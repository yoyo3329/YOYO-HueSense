 'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {spawnSync}=require('child_process');
const {health,startAssetServer,scoreRegions}=require('./clip_bridge_a1');
const {build:buildAudit}=require('./build_audit_html_a1');

const VERSION='0.8a1.0';
function arg(n,d=null){const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d;}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function writeJson(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n','utf8')}
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function mkdir(p){fs.mkdirSync(p,{recursive:true})}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'').replace('T','_')}

async function main(){
 const root=path.resolve(arg('--root',path.resolve(__dirname,'..','..')));
 const python=arg('--python',process.platform==='win32'?'python':'python3');
 const clipMode=arg('--clip','auto');
 const configPath=path.resolve(arg('--config',path.join(__dirname,'..','config','stylecolor_v0_8a1.config.json')));
 const b1Path=path.resolve(arg('--b1',path.join(root,'y2k_color_mvp_b1_observations.json')));
 const outBase=path.resolve(arg('--out-base',path.join(root,'stylecolor-v0.8a1','runs')));
 const config=readJson(configPath), b1=readJson(b1Path);
 if(!Array.isArray(b1.items)||!b1.items.length)throw new Error('B1 items missing');
 const runDir=path.join(outBase,`${stamp()}_${config.style_id}_v0_8a1`);mkdir(runDir);
 const log=[];const say=s=>{console.log(s);log.push(`[${new Date().toISOString()}] ${s}`)};
 say(`YOYO Stable Atomic Region Diagnostics ${VERSION}`); say(`Items: ${b1.items.length}`);

 const source=[],docs=[],fails=[],batch=[];
 for(const item of b1.items){
  const p=item.analysis_provenance||{};
  const choices=[p.cache_file,p.preview_asset].filter(Boolean).map(x=>path.resolve(root,x));
  const img=choices.find(fs.existsSync);
  source.push({image_id:item.id,resolved_local_path:img||null,resolved:!!img,query_family:item.query_family,source_domain:item.source_domain});
  if(img)batch.push({image_id:item.id,image:img}); else fails.push({image_id:item.id,error:'local_image_missing'});
 }
 const batchPath=path.join(runDir,'cv_batch_input.json');writeJson(batchPath,{schema_version:'0.8a1.0',items:batch});
 const worker=path.resolve(__dirname,'..','python','cv_worker_a1.py');
 const cp=spawnSync(python,[worker,'--batch-manifest',batchPath,'--out-dir',runDir,
  '--segments',String(config.atomic_segmentation.segments),'--compactness',String(config.atomic_segmentation.compactness),
  '--max-dim',String(config.atomic_segmentation.max_dim),'--palette-k',String(config.region_palette.k),
  '--scale-multipliers',config.stability_diagnostics.multiscale_segment_multipliers.join(',')],
  {encoding:'utf8',timeout:600000,maxBuffer:40*1024*1024});
 if(cp.stdout) say(cp.stdout.trim());
 if(cp.status!==0)throw new Error((cp.stderr||cp.stdout||'worker failed').slice(-8000));

 for(const item of b1.items){
  const p=path.join(runDir,`${item.id}.atomic.json`);
  if(!fs.existsSync(p))continue;
  const d=readJson(p);
  d.query_family=item.query_family;d.source_domain=item.source_domain;d.source_clip_score=item.clip_score??null;d.raw_b1_palette=item.palette||[];
  docs.push(d);
 }
 writeJson(path.join(runDir,'source_manifest.json'),{schema_version:'0.8a1.0',source_b1:b1Path,source_b1_sha256:shaFile(b1Path),items:source,failures:fails});

 // CLIP evidence: diversified budget, never used as merge truth.
 let clipInfo={mode:clipMode,available:false};
 if(clipMode!=='off'){
  clipInfo=await health(config.clip.service_base);
  if(clipInfo.available){
   say(`CLIP READY: ${clipInfo.model||'?'} ${clipInfo.device||'?'}`);
   const srv=await startAssetServer(runDir,config.clip.asset_server_port);
   const chosen=[];
   const max=Number(config.clip.max_regions_per_image||12);
   for(const d of docs){
    const regs=d.atomic_regions;
    const map=new Map();
    const quota=Math.max(1,Math.floor(max/3));
    for(const r of [...regs].sort((a,b)=>b.area_ratio-a.area_ratio).slice(0,quota))map.set(r.region_id,r);
    for(const r of [...regs].sort((a,b)=>b.saliency_proxy-a.saliency_proxy).slice(0,quota))map.set(r.region_id,r);
    for(const r of [...regs].sort((a,b)=>b.diagnostics.minority_contrast_signal_score-a.diagnostics.minority_contrast_signal_score).slice(0,quota))map.set(r.region_id,r);
    for(const r of [...regs].sort((a,b)=>b.clip_input_coherence_score-a.clip_input_coherence_score)){if(map.size>=max)break;map.set(r.region_id,r);}
    for(const r of regs)if(!map.has(r.region_id)){r.clip_status='NOT_SELECTED_FOR_CLIP_BUDGET';r.clip_style_similarity=null;}
    chosen.push(...map.values());
   }
   const scored=await scoreRegions({regions:chosen,concept:config.concept,clipBase:config.clip.service_base,assetBase:srv.baseUrl,batchSize:config.clip.batch_size,timeoutMs:config.clip.timeout_ms});
   for(const r of chosen){
    if(scored.scores.has(r.region_id)){r.clip_status='OK';r.clip_style_similarity=scored.scores.get(r.region_id);}
    else {r.clip_status=scored.errors.get(r.region_id)||'CLIP_ERROR';r.clip_style_similarity=null;}
   }
   srv.server.close();
   clipInfo={...clipInfo,regions_total:docs.reduce((s,d)=>s+d.atomic_regions.length,0),regions_requested:chosen.length,regions_scored:scored.scores.size,regions_error:scored.errors.size,selection_policy:config.clip.selection_policy};
  }else{
   for(const d of docs)for(const r of d.atomic_regions){r.clip_status='UNAVAILABLE_SERVICE';r.clip_style_similarity=null;}
  }
 }

 // Update edge evidence with CLIP-style-score difference only as style-evidence compatibility; not semantic identity.
 const graphImages=[];
 for(const d of docs){
  const byId=new Map(d.atomic_regions.map(r=>[r.region_id,r]));
  for(const e of d.relationship_edges){
   const a=byId.get(e.source_region_id),b=byId.get(e.target_region_id);
   if(a?.clip_status==='OK'&&b?.clip_status==='OK'){
    e.evidence.clip_style_score_similarity=1-Math.min(1,Math.abs(a.clip_style_similarity-b.clip_style_similarity)/.15);
   }else e.evidence.clip_style_score_similarity=null;
  }
  graphImages.push({image_id:d.image_id,edges:d.relationship_edges});
 }

 writeJson(path.join(runDir,'atomic_region_observations.json'),{schema_version:'0.8a1.0',role:'IMMUTABLE_ATOMIC_REGION_OBSERVATIONS',style_id:config.style_id,concept:config.concept,images:docs});
 writeJson(path.join(runDir,'region_relationship_graph.json'),{schema_version:'0.8a1.0',role:'REGION_RELATIONSHIP_GRAPH_NOT_STYLE_GRAPH',destructive_merges_executed:0,images:graphImages});
 const summary={schema_version:'0.8a1.0',status:fails.length?'PASS_WITH_INPUT_FAILURES':'PASS_POC',images_total:b1.items.length,images_processed:docs.length,images_failed:fails.length,
  atomic_regions_total:docs.reduce((s,d)=>s+d.atomic_regions.length,0),relationship_edges_total:graphImages.reduce((s,d)=>s+d.edges.length,0),
  destructive_merges_executed:0,clip_regions_scored:docs.flatMap(d=>d.atomic_regions).filter(r=>r.clip_status==='OK').length,
  style_graph_built:false,semantic_truth_claim:false,probability_claims_from_scores:false,production_eligible:false,
  next_gate:'v0.8-A.1 PHYSICAL_AUDIT THEN OPTIONAL v0.8-A.2 SEMANTIC_PRIORS'};
 writeJson(path.join(runDir,'extractor_summary.json'),summary);

 const dg=spawnSync(process.execPath,[path.resolve(__dirname,'build_physical_audit.js'),runDir],{encoding:'utf8'});
 if(dg.status!==0)throw new Error(dg.stderr||dg.stdout);
 const audit=readJson(path.join(runDir,'physical_audit.json'));
 const report={summary,audit,clip:clipInfo,images:docs.map(d=>({image_id:d.image_id,source_image_asset:d.source_image_asset,region_preview_asset:d.region_preview_asset,atomic_regions:d.atomic_regions,edges:d.relationship_edges}))};
 writeJson(path.join(runDir,'audit_report.json'),report);
 buildAudit(report,path.join(runDir,'audit.html'));

 const manifest={schema_version:'0.8a1.0',name:'YOYO v0.8-A.1 Stable Atomic Regions + Relationship Diagnostics',version:VERSION,created_at:new Date().toISOString(),scope:'OFFLINE_POC_ONLY',
  b1_path:b1Path,b1_sha256:shaFile(b1Path),config_path:configPath,config_sha256:shaFile(configPath),node_version:process.version,python_executable:python,platform:{os:os.platform(),release:os.release(),arch:os.arch()},
  architecture:{atomic_regions_immutable:true,destructive_merge:false,relationship_graph:true,style_graph:false,semantic_prior:'DEFERRED_TO_v0.8-A.2',embedding_agreement:'DEFERRED_TO_v0.8-A.2'},
  score_semantics:'HEURISTIC_SCORES_NOT_CALIBRATED_PROBABILITIES',clip:clipInfo,safety:{production_app_js_touched:false,live_runtime_integrated:false,no_destructive_merge:true,no_style_graph:true}};
 writeJson(path.join(runDir,'run_manifest.json'),manifest);
 const per=path.join(runDir,'per_image');mkdir(per);
 for(const d of docs){const p=path.join(runDir,`${d.image_id}.atomic.json`);if(fs.existsSync(p))fs.renameSync(p,path.join(per,path.basename(p)));}
 fs.writeFileSync(path.join(outBase,'LATEST_RUN.txt'),runDir+'\n','utf8');
 fs.writeFileSync(path.join(runDir,'run.log'),log.join('\n')+'\n');
 say(`DONE: ${runDir}`);
 console.log(`RUN_DIR=${runDir}`);
}
main().catch(e=>{console.error('FATAL',e.stack||e);process.exit(1)});
