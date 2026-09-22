'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {spawnSync}=require('child_process');
const {health,startAssetServer,scoreRegions}=require('./clip_bridge');
const {build:buildAudit}=require('./build_audit_html');

const VERSION='0.8a.0';
function arg(name,def=null){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:def;}
function flag(name){return process.argv.includes(name);}
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function shaText(s){return crypto.createHash('sha256').update(s).digest('hex');}
function nowStamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'').replace('T','_');}
function mkdir(p){fs.mkdirSync(p,{recursive:true});}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function writeJson(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n','utf8');}
function relUnix(p,root){return path.relative(root,p).split(path.sep).join('/');}

async function main(){
 const root=path.resolve(arg('--root',path.resolve(__dirname,'..','..')));
 const python=arg('--python',process.platform==='win32'?'python':'python3');
 const concept=arg('--concept','Y2K aesthetic');
 const clipMode=arg('--clip','auto'); // auto|off|required
 const outBase=path.resolve(arg('--out-base',path.join(root,'stylecolor-v0.8a','runs')));
 const configPath=path.resolve(arg('--config',path.join(__dirname,'..','config','stylecolor_v0_8a.config.json')));
 const b1Path=path.resolve(arg('--b1',path.join(root,'y2k_color_mvp_b1_observations.json')));
 if(!fs.existsSync(b1Path)) throw new Error('B1 observations not found: '+b1Path);
 if(!fs.existsSync(configPath)) throw new Error('config not found: '+configPath);
 const config=readJson(configPath); const b1=readJson(b1Path);
 if(!Array.isArray(b1.items)||b1.items.length===0) throw new Error('B1 items missing');
 const runDir=path.join(outBase,`${nowStamp()}_${config.style_id||'style'}_v0_8a`); mkdir(runDir);
 const log=[]; const logLine=s=>{console.log(s);log.push(`[${new Date().toISOString()}] ${s}`)};
 logLine(`YOYO StyleColor Extractor v${VERSION}`); logLine(`Root: ${root}`); logLine(`B1: ${b1Path}`); logLine(`Items: ${b1.items.length}`);

 const sourceManifest=[]; const regionDocs=[]; const failures=[];
 const worker=path.resolve(__dirname,'..','python','cv_worker.py');
 const batchItems=[];
 for(let i=0;i<b1.items.length;i++){
   const item=b1.items[i]; const prov=item.analysis_provenance||{};
   const choices=[prov.cache_file,prov.preview_asset].filter(Boolean).map(x=>path.resolve(root,x));
   const img=choices.find(fs.existsSync);
   sourceManifest.push({image_id:item.id,query_family:item.query_family,source_domain:item.source_domain,image_url:item.image_url,raw_b1_clip_score:item.clip_score,cache_file:prov.cache_file||null,preview_asset:prov.preview_asset||null,resolved_local_path:img||null,resolved:!!img});
   if(!img){failures.push({image_id:item.id,error:'local_image_missing',choices});logLine(`[preflight ${i+1}/${b1.items.length}] ${item.id} MISSING`);continue;}
   batchItems.push({image_id:item.id,image:img});
 }
 const batchManifestPath=path.join(runDir,'cv_batch_input.json'); writeJson(batchManifestPath,{schema_version:'0.8a.0',items:batchItems});
 if(batchItems.length){
   logLine(`Python CV batch: ${batchItems.length} images in one process...`);
   const cp=spawnSync(python,[worker,'--batch-manifest',batchManifestPath,'--out-dir',runDir,'--segments',String(config.region_proposal.segments),'--compactness',String(config.region_proposal.compactness),'--max-dim',String(config.region_proposal.max_dim),'--palette-k',String(config.region_palette.k)],{encoding:'utf8',timeout:300000,maxBuffer:20*1024*1024});
   if(cp.stdout) for(const line of cp.stdout.trim().split(/\r?\n/).slice(0,-1)) logLine('  '+line);
   if(cp.status!==0){throw new Error(`CV batch worker failed: ${(cp.stderr||cp.stdout||'').slice(-6000)}`);}
 }
 for(const item of b1.items){
   const p=path.join(runDir,`${item.id}.regions.json`);
   if(!fs.existsSync(p)){
     if(!failures.some(x=>x.image_id===item.id)) failures.push({image_id:item.id,error:'worker_output_missing'});
     continue;
   }
   const doc=readJson(p); doc.query_family=item.query_family; doc.source_domain=item.source_domain; doc.source_clip_score=item.clip_score??null; doc.raw_b1_palette=item.palette||[]; doc.alt=item.alt||'';
   regionDocs.push(doc);
 }
 writeJson(path.join(runDir,'source_manifest.json'),{schema_version:'0.8a.0',source_b1:path.relative(root,b1Path),source_b1_sha256:shaFile(b1Path),items:sourceManifest,failures});

 // Region CLIP evidence via existing local CLIP service. No hard threshold.
 let clipInfo={mode:clipMode,available:false}; let assetServer=null;
 if(clipMode!=='off'){
   clipInfo=await health(config.clip.service_base);
   if(clipInfo.available){
     logLine(`CLIP service READY: ${clipInfo.model||'?'} on ${clipInfo.device||'?'}`);
     const srv=await startAssetServer(runDir,config.clip.asset_server_port); assetServer=srv.server;
     const allRegions=regionDocs.flatMap(d=>d.regions);
     const clipRegions=[];
     const maxPer=Number(config.clip.max_regions_per_image||8);
     for(const d of regionDocs){
       const byArea=[...d.regions].sort((a,b)=>b.area_ratio-a.area_ratio).slice(0,Math.max(1,maxPer-2));
       const chosen=new Map(byArea.map(r=>[r.region_id,r]));
       for(const r of [...d.regions].sort((a,b)=>b.saliency_proxy-a.saliency_proxy)){ if(chosen.size>=maxPer) break; chosen.set(r.region_id,r); }
       for(const r of d.regions){ if(!chosen.has(r.region_id)){r.clip_status='NOT_SELECTED_FOR_CLIP_BUDGET';r.clip_style_similarity=null;} }
       clipRegions.push(...chosen.values());
     }
     const scored=await scoreRegions({regions:clipRegions,concept,clipBase:config.clip.service_base,assetBase:srv.baseUrl,batchSize:config.clip.batch_size,timeoutMs:config.clip.timeout_ms});
     for(const r of clipRegions){
       if(scored.scores.has(r.region_id)){r.clip_style_similarity=scored.scores.get(r.region_id);r.clip_status='OK';}
       else {r.clip_style_similarity=null;r.clip_status=scored.errors.get(r.region_id)||'UNAVAILABLE';}
     }
     clipInfo={...clipInfo,regions_total:allRegions.length,regions_requested:clipRegions.length,regions_scored:scored.scores.size,regions_error:scored.errors.size,selection_policy:`TOP_AREA_PLUS_SALIENCY_MAX_${maxPer}_PER_IMAGE`,concept};
     assetServer.close(); assetServer=null;
   }else{
     logLine(`CLIP service unavailable: ${clipInfo.error||'health not ready'}`);
     if(clipMode==='required') throw new Error('CLIP required but unavailable');
     for(const d of regionDocs) for(const r of d.regions){r.clip_style_similarity=null;r.clip_status='UNAVAILABLE_SERVICE';}
   }
 }

 // Build evidence-only candidates, no overall style score.
 const candidates=[];
 for(const d of regionDocs){
   const local=[];
   for(const r of d.regions){
     r.status=(r.illumination_reliability<0.50 || (r.low_reliability_reasons||[]).includes('tiny_region'))?'LOW_RELIABILITY':'CANDIDATE';
     r.candidates=[];
     for(let j=0;j<r.palette.length;j++){
       const p=r.palette[j]; const imageArea=r.area_ratio*p.ratio_within_region;
       const cand={candidate_id:`${d.image_id}:r${String(r.region_index).padStart(2,'0')}:p${j}`,image_id:d.image_id,region_id:r.region_id,color:p.hex,lab:p.lab,lch:p.lch,region_area_ratio:r.area_ratio,region_palette_ratio:p.ratio_within_region,image_area_ratio:imageArea,evidence:{saliency_proxy:r.saliency_proxy,clip_style_similarity:r.clip_style_similarity,clip_status:r.clip_status,illumination_reliability:r.illumination_reliability,region_stability:r.region_stability,source_clip_score:d.source_clip_score},low_reliability_reasons:[...r.low_reliability_reasons],status:r.status,style_classification:null,evidence_policy:'VECTOR_ONLY_NO_OVERALL_STYLE_SCORE',provisional_role:null,role_basis:'IMAGE_AREA_RATIO_RANK_HEURISTIC'};
       candidates.push(cand); local.push(cand); r.candidates.push(cand);
     }
   }
   local.sort((a,b)=>b.image_area_ratio-a.image_area_ratio);
   local.forEach((c,ix)=>{c.role_rank=ix+1;c.provisional_role=ix===0?'dominant':(ix<4?'secondary':'accent');});
 }
 // remove duplicated candidate objects from embedded region docs down to compact refs
 for(const d of regionDocs) for(const r of d.regions){r.candidates=(r.candidates||[]).map(c=>({candidate_id:c.candidate_id,provisional_role:c.provisional_role,image_area_ratio:c.image_area_ratio,status:c.status}));}

 const clipScored=regionDocs.flatMap(d=>d.regions).filter(r=>r.clip_style_similarity!=null).length;
 const summary={schema_version:'0.8a.0',status:failures.length?'PASS_WITH_INPUT_FAILURES':'PASS_POC',images_total:b1.items.length,images_processed:regionDocs.length,images_failed:failures.length,regions_total:regionDocs.reduce((s,d)=>s+d.regions.length,0),candidates_total:candidates.length,low_reliability_candidates:candidates.filter(c=>c.status==='LOW_RELIABILITY').length,clip_regions_scored:clipScored,clip_available:!!clipInfo.available,hard_style_classifications:0,semantic_segmentation_claim:false,style_graph_built:false,production_eligible:false,next_gate:'AUTOMATED_DIAGNOSTICS_THEN_OPTIONAL_VISUAL_AUDIT'};

 writeJson(path.join(runDir,'region_observations.json'),{schema_version:'0.8a.0',role:'REGION_OBSERVATION',style_id:config.style_id,concept,images:regionDocs});
 writeJson(path.join(runDir,'style_color_candidates.json'),{schema_version:'0.8a.0',role:'EVIDENCE_ONLY_CANDIDATES',hard_thresholds:false,overall_style_score:false,candidates});
 writeJson(path.join(runDir,'extractor_summary.json'),summary);
 const diag=spawnSync(process.execPath,[path.resolve(__dirname,'build_automated_diagnostics.js'),runDir],{encoding:'utf8',timeout:30000});
 if(diag.status!==0) throw new Error('automated diagnostics failed: '+(diag.stderr||diag.stdout));
 const report={summary,clip:clipInfo,images:regionDocs.map(d=>({image_id:d.image_id,query_family:d.query_family,source_domain:d.source_domain,source_clip_score:d.source_clip_score,source_image_asset:d.source_image_asset,region_preview_asset:d.region_preview_asset,raw_b1_palette:d.raw_b1_palette,regions:d.regions}))};
 writeJson(path.join(runDir,'audit_report.json'),report); buildAudit(report,path.join(runDir,'audit.html'));
 const runManifest={schema_version:'0.8a.0',name:'YOYO StyleColor Extractor PoC',version:VERSION,created_at:new Date().toISOString(),scope:'OFFLINE_POC_ONLY',style_id:config.style_id,concept,root,b1_path:b1Path,b1_sha256:shaFile(b1Path),config_path:configPath,config_sha256:shaFile(configPath),node_version:process.version,python_executable:python,platform:{os:os.platform(),release:os.release(),arch:os.arch()},region_engine:'SLIC_REGION_PROPOSAL_BASELINE',semantic_segmentation_claim:false,saliency_engine:'DETERMINISTIC_PROXY',clip:clipInfo,methodology:{working_color_space:'OKLab',derived_color_space:'OKLCH',kobayashi_role:'SEMANTIC_DESCRIPTION_CONCEPT_ONLY_NOT_PIXEL_FILTER',wcag_role:'ACCESSIBILITY_LAYER_ONLY_NOT_AESTHETIC_FILTER'},safety:{production_app_js_touched:false,live_runtime_integrated:false,hard_style_filtering:false,generic_corpus_subtraction:false,style_graph_built:false}};
 writeJson(path.join(runDir,'run_manifest.json'),runManifest); fs.writeFileSync(path.join(runDir,'run.log'),log.join('\n')+'\n');
 // cleanup per-image intermediary jsons to keep run clean? preserve for auditability under per_image/
 const per=path.join(runDir,'per_image');mkdir(per); for(const d of regionDocs){const p=path.join(runDir,`${d.image_id}.regions.json`);if(fs.existsSync(p))fs.renameSync(p,path.join(per,path.basename(p)));}
 fs.writeFileSync(path.join(outBase,'LATEST_RUN.txt'),runDir+'\n','utf8');
 logLine(`DONE: ${runDir}`); logLine(`Summary: images=${summary.images_processed}/${summary.images_total} regions=${summary.regions_total} candidates=${summary.candidates_total} clip=${summary.clip_regions_scored}`);
 console.log(`RUN_DIR=${runDir}`);
 }

main().catch(e=>{console.error('FATAL',e.stack||e);process.exit(1)});
