'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');

function arg(n,d=null){const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d}
function requiredArg(n){const v=arg(n);if(!v||String(v).trim()==='')throw new Error(`MISSING_REQUIRED_ARGUMENT:${n}`);return v}
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')}
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function shaText(s){return crypto.createHash('sha256').update(s).digest('hex')}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'').replace('T','_')}
function codeHash(root,files){const h=crypto.createHash('sha256');for(const f of files){const p=path.join(root,f);h.update(f);h.update(fs.readFileSync(p))}return h.digest('hex')}
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{stdio:'inherit',encoding:'utf8',timeout:opts.timeout||10800000,env:opts.env||process.env});if(r.status!==0)process.exit(r.status||2)}
function requireFile(p,label){if(!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error(`REQUIRED_FILE_MISSING:${label}:${p}`)}
function requireDir(p,label){if(!fs.existsSync(p)||!fs.statSync(p).isDirectory())throw new Error(`REQUIRED_DIR_MISSING:${label}:${p}`)}

function main(){
 const root=path.resolve(requiredArg('--root'));
 const nr=root.replace(/\//g,'\\').toLowerCase();
 const runnerToolsRoot=path.resolve(__dirname,'..','..').replace(/\//g,'\\').toLowerCase();
 if(nr!==runnerToolsRoot)throw new Error(`CANONICAL_CODE_ROOT_MISMATCH:${root}`);
 const declaredCodeRoot=process.env.YOYO_CODE_ROOT?path.resolve(process.env.YOYO_CODE_ROOT):null;
 if(declaredCodeRoot){
   const declaredToolsRoot=path.join(declaredCodeRoot,'tools','b1').replace(/\//g,'\\').toLowerCase();
   if(nr!==declaredToolsRoot)throw new Error(`CANONICAL_CODE_ROOT_MISMATCH:${root}`);
 }
 if(nr.startsWith('c:\\xampp\\'))throw new Error(`HOLD_LEGACY_CODE_PATH_DETECTED:${root}`);

 const a1=path.resolve(requiredArg('--a1-run'));
 const baseline=path.resolve(requiredArg('--baseline-a2-run'));
 const py=path.resolve(requiredArg('--python'));
 const configPath=path.resolve(requiredArg('--config'));
 const samLockPath=path.resolve(requiredArg('--sam-lock'));
 const clipLockPath=path.resolve(requiredArg('--openclip-lock'));
 const envPrePath=path.resolve(requiredArg('--env-pre'));

 requireDir(a1,'a1-run');
 requireDir(baseline,'baseline-a2-run');
 requireFile(py,'python');
 requireFile(configPath,'config');
 requireFile(samLockPath,'sam-lock');
 requireFile(clipLockPath,'openclip-lock');
 requireFile(envPrePath,'env-pre');
 requireFile(path.join(a1,'atomic_region_observations.json'),'a1-atomic-observations');
 requireFile(path.join(a1,'run_manifest.json'),'a1-run-manifest');
 requireFile(path.join(baseline,'run_manifest.json'),'baseline-run-manifest');

 const cfg=read(configPath),samLock=read(samLockPath),clipLock=read(clipLockPath),envPre=read(envPrePath);
 if(!envPre.cleanly_certified)throw new Error('PRE_ENV_NOT_CERTIFIED');
 if(!samLock.certified||!clipLock.cleanly_certified)throw new Error('MODEL_LOCK_NOT_CERTIFIED');

 const obs=read(path.join(a1,'atomic_region_observations.json'));
 const a1ManifestPath=path.join(a1,'run_manifest.json');
 const outBase=path.join(root,'stylecolor-v0.8a2.1-clean-repro','runs');
 fs.mkdirSync(outBase,{recursive:true});

 const buildRoot=path.resolve(__dirname,'..');
 const files=[
   'config/stylecolor_v0_8a2_1_clean_repro.config.json',
   'python/a2_foundation_worker_clean.py',
   'python/map_atomic_foundation.py',
   'node/assemble_a2.js',
   'node/run_clean_repro.js'
 ];
 for(const f of files)requireFile(path.join(buildRoot,f),`code-bundle:${f}`);

 const baselineManifest=read(path.join(baseline,'run_manifest.json'));
 const fingerprint={
   schema_version:'0.8a2.1-clean-repro',
   current_code_root:root,
   execution_host:'WINDOWS_LOCAL_RUNNER',
   a1_run_manifest_sha256:shaFile(a1ManifestPath),
   baseline_a2_run_manifest_sha256:shaFile(path.join(baseline,'run_manifest.json')),
   baseline_run_id:path.basename(baseline),
   config_sha256:shaFile(configPath),
   sam_lock_sha256:shaFile(samLockPath),
   openclip_lock_sha256:shaFile(clipLockPath),
   env_pre_sha256:shaFile(envPrePath),
   runner_script_sha256:shaFile(__filename),
   code_bundle_sha256:codeHash(buildRoot,files),
   dependency_fingerprint:envPre.actual,
   node_version:process.version,
   python_executable:py
 };
 fingerprint.dependency_fingerprint_sha256=shaText(JSON.stringify(fingerprint.dependency_fingerprint));
 fingerprint.fingerprint_sha256=shaText(JSON.stringify(fingerprint));

 const runDir=path.join(outBase,`${stamp()}_${cfg.style_id}_v0_8a2_1_clean_repro`);
 fs.mkdirSync(runDir,{recursive:true});
 write(path.join(runDir,'run_fingerprint.json'),fingerprint);

 const items=[];
 for(const img of obs.images){
   let src=img.source_path,status='A1_ORIGINAL_SOURCE';
   if(!src||!fs.existsSync(src)){
     src=path.join(a1,img.source_image_asset);
     status='NON_BYTE_IDENTICAL_FALLBACK_A1_JPEG';
   }
   items.push({
     image_id:img.image_id,
     source_path:src,
     source_sha256:status==='A1_ORIGINAL_SOURCE'?img.source_sha256:null,
     input_source_status:status
   });
 }
 write(path.join(runDir,'source_manifest.json'),{
   schema_version:'0.8a2.1-clean-repro',
   a1_run:a1,
   baseline_uncertified_a2_run:baseline,
   a1_run_manifest_sha256:fingerprint.a1_run_manifest_sha256,
   items
 });

 const worker=path.join(buildRoot,'python','a2_foundation_worker_clean.py');
 run(py,[worker,'--manifest',path.join(runDir,'source_manifest.json'),'--config',configPath,'--out-dir',runDir,'--mode','real','--model-lock',samLockPath,'--run-fingerprint',fingerprint.fingerprint_sha256],{timeout:10800000,env:{...process.env,PYTHONUNBUFFERED:'1'}});
 run(py,[path.join(buildRoot,'python','map_atomic_foundation.py'),'--a1-run',a1,'--a2-run',runDir],{timeout:600000});
 run(process.execPath,[path.join(buildRoot,'node','assemble_a2.js'),a1,runDir,configPath]);

 const a1PrevDir=path.join(runDir,'a1_previews');
 fs.mkdirSync(a1PrevDir,{recursive:true});
 for(const img of obs.images){
   const src=path.join(a1,img.region_preview_asset||'');
   if(img.region_preview_asset&&fs.existsSync(src))fs.copyFileSync(src,path.join(a1PrevDir,path.basename(img.region_preview_asset)));
 }

 const diag=read(path.join(runDir,'a2_diagnostics.json'));
 const fw=read(path.join(runDir,'foundation_worker_summary.json'));
 const clipHashes=[...new Set(fw.results.filter(r=>!r.error&&r.openclip_weight_sha256).map(r=>r.openclip_weight_sha256))];
 if(clipHashes.length!==1||clipHashes[0]!==clipLock.state_dict_sha256)throw new Error('WORKER_OPENCLIP_HASH_NOT_CERTIFIED');

 const manifest={
   schema_version:'0.8a2.1-clean-repro',
   name:'YOYO v0.8-A.2.1 Clean Certified Inference Reproduction',
   version:'0.8a2.1-CLEAN-REPRO',
   created_at:new Date().toISOString(),
   mode:'real',
   purpose:'REPRODUCE_A2_1_WITH_CLEAN_IMMUTABLE_INFERENCE_ENVIRONMENT_AND_COMPARE_DRIFT',
   upstream_a1_run:a1,
   baseline_uncertified_a2_run:baseline,
   execution_identity:{
     code_root:root,
     execution_host:'WINDOWS_LOCAL_RUNNER',
     python_executable:py,
     runner_script_sha256:fingerprint.runner_script_sha256,
     config_sha256:fingerprint.config_sha256,
     sam_lock_sha256:fingerprint.sam_lock_sha256,
     openclip_lock_sha256:fingerprint.openclip_lock_sha256,
     env_pre_sha256:fingerprint.env_pre_sha256,
     baseline_run_id:fingerprint.baseline_run_id,
     baseline_manifest_sha256:fingerprint.baseline_a2_run_manifest_sha256
   },
   certification:{
     clean_environment_pre:true,
     sam_model_lock:true,
     openclip_architecture_lock:true,
     quickgelu_expected:true,
     quickgelu_actual:true,
     algorithm_tuning:false,
     baseline_uncertified_dependency_fingerprint:(baselineManifest.run_fingerprint||{}).dependency_fingerprint||null,
     certified_dependency_fingerprint:envPre.actual,
     quickgelu_correction_disclosure:'Prior A2.1 used ViT-B-32/openai with a QuickGELU mismatch warning. Certified reproduction uses explicit ViT-B-32-quickgelu/openai, the activation expected by OpenAI pretrained weights. Therefore SAM drift isolates environment; OpenCLIP drift reflects clean environment plus architecture-consistency correction.'
   },
   foundation_model:{
     repo_id:samLock.sam_repo_id,
     resolved_revision:samLock.resolved_revision,
     weight_files:samLock.weight_files,
     preprocessor_config:samLock.preprocessor_config,
     device:'cpu',
     dtype:'float32'
   },
   visual_embedding_model:{
     model:cfg.visual_embedding.model,
     pretrained:cfg.visual_embedding.pretrained,
     quick_gelu_required:true,
     weight_sha256:clipHashes,
     openclip_lock:clipLock
   },
   atomic_regions_immutable:true,
   foundation_mask_authority:'HYPOTHESIS_ONLY',
   foundation_mask_equals_perceptual_component:false,
   a1_relationship_action_authority:'NONE',
   destructive_merges_executed:0,
   style_graph_built:false,
   production_authority:'NONE',
   input_fallback_count:items.filter(x=>x.input_source_status!=='A1_ORIGINAL_SOURCE').length,
   run_fingerprint:fingerprint,
   summary:diag
 };
 write(path.join(runDir,'run_manifest.json'),manifest);
 run(process.execPath,[path.join(buildRoot,'node','build_a2_audit_1.js'),runDir,a1]);
 fs.writeFileSync(path.join(outBase,'LATEST_RUN.txt'),runDir+'\n');
 console.log('RUN_DIR='+runDir);
}
main();
