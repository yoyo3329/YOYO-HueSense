#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const W=require('./style-workspace-contract-v0_1.js');
const Repro=require('./reproduction-policy-v0_6b_1.js');
const GenericRepro=require('./generic-reproduction-policy-v0_6c.js');
function arg(name,fallback){const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback}
function fail(m){console.error('❌ '+m);process.exit(1)}
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function write(p,d){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n','utf8')}
function hash(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function resolve(base,p){return p?path.resolve(base,p):null}
function run(script,args){console.log(`>>> ${path.basename(script)} ${args.join(' ')}`);const r=spawnSync(process.execPath,[script,...args],{stdio:'inherit',cwd:__dirname});if(r.status!==0)fail(`${path.basename(script)} exited ${r.status}`)}
function copyFile(src,dst){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}

const manifestPath=path.resolve(arg('--workspace',path.join(__dirname,'styles','y2k','style.workspace.json')));
if(!fs.existsSync(manifestPath))fail(`Workspace not found: ${manifestPath}`);
const base=path.dirname(manifestPath), ws=read(manifestPath);W.validate(ws,{allowDataPending:true});
if(ws.data_status!=='READY')fail(`Workspace ${ws.style.id} is ${ws.data_status}. Real evaluation data/cache are required; no fake data will be generated.`);
const evalSet=resolve(base,ws.paths.evaluation_set), cacheDir=resolve(base,ws.paths.cache_dir), fallbackMap=resolve(base,ws.paths.fallback_map), b1Seed=resolve(base,ws.paths.b1_observations_seed);
const reuseB1=process.argv.includes('--reuse-b1');
const outDir=resolve(base,ws.paths.artifact_dir);fs.mkdirSync(outDir,{recursive:true});
if(!reuseB1){if(!fs.existsSync(evalSet))fail(`Evaluation set not found: ${evalSet}`);if(!fs.existsSync(cacheDir))fail(`Cache dir not found: ${cacheDir}`);}else if(!b1Seed||!fs.existsSync(b1Seed))fail(`B1 seed not found for --reuse-b1: ${b1Seed}`);
const files={b1:path.join(outDir,'b1_observations.json'),b1preview:path.join(outDir,'b1_preview.html'),b2:path.join(outDir,'b2_aggregation.json'),b2preview:path.join(outDir,'b2_preview.html'),sens:path.join(outDir,'b3_threshold_sensitivity.json'),b3:path.join(outDir,'b3_hierarchy.json'),graph:path.join(outDir,'color_relation_graph.json')};
console.log('=== YOYO Style-Agnostic Offline Pipeline v0.6C ===');console.log(`Style       : ${ws.style.display_name} (${ws.style.id})`);console.log(`B1 mode      : ${reuseB1?'REUSE_PROVEN_B1':'FULL_CACHE_ONLY'}`);console.log('Network      : OFF / CACHE ONLY');console.log('Live runtime : untouched');
if(reuseB1){copyFile(b1Seed,files.b1);console.log(`>>> B1 REUSE: ${b1Seed}`);console.log('    Reason: prior v0.6B.1 already proved cache-only B1 physical-semantic reproduction.');}else{run(path.join(__dirname,'run_b1_observation_style_v0_6c.js'),['--input',evalSet,'--output',files.b1,'--preview',files.b1preview,'--preview-asset-dir',path.join(outDir,'b1_preview_assets'),'--cache-dir',cacheDir,'--style-label',ws.style.display_name,...(fallbackMap?['--fallback-map',fallbackMap]:[])]);}
run(path.join(__dirname,'run_b2_aggregation_style_v0_6c.js'),['--input',files.b1,'--output',files.b2,'--preview',files.b2preview]);
run(path.join(__dirname,'run_b3_threshold_sensitivity_style_v0_6c.js'),['--b1',files.b1,'--b2',files.b2,'--output',files.sens]);
run(path.join(__dirname,'run_b3_hierarchy_style_v0_6c.js'),['--b2',files.b2,'--sensitivity',files.sens,'--output',files.b3]);
run(path.join(__dirname,'run_b3_color_relation_graph_style_v0_6c.js'),['--input',files.b3,'--output',files.graph]);
let baseline={enabled:!!ws?.baseline_compare?.enabled,status:'NOT_REQUESTED'};
if(baseline.enabled){
 const refs={b1:resolve(base,ws.baseline_compare.b1),b2:resolve(base,ws.baseline_compare.b2),b3a:resolve(base,ws.baseline_compare.b3a),relation:resolve(base,ws.baseline_compare.relation)};
 for(const [k,p] of Object.entries(refs))if(!p||!fs.existsSync(p))fail(`Baseline ${k} not found: ${p}`);
 const b1PhysicalExact=Repro.b1PhysicalHash(read(refs.b1))===Repro.b1PhysicalHash(read(files.b1));
 const b2Exact=GenericRepro.equal('b2',read(refs.b2),read(files.b2));
 const b3Exact=GenericRepro.equal('b3a',read(refs.b3a),read(files.b3));
 const relationExact=GenericRepro.equal('relation',read(refs.relation),read(files.graph));
 baseline={enabled:true,status:(b1PhysicalExact&&b2Exact&&b3Exact&&relationExact)?'PASS':'FAIL',b1_raw_byte_exact:hash(refs.b1)===hash(files.b1),b1_physical_semantic_exact:b1PhysicalExact,b1_diff_count:b1PhysicalExact?0:null,b2_raw_byte_exact:hash(refs.b2)===hash(files.b2),b2_structural_semantic_exact:b2Exact,b3a_raw_byte_exact:hash(refs.b3a)===hash(files.b3),b3a_structural_semantic_exact:b3Exact,relation_raw_byte_exact:hash(refs.relation)===hash(files.graph),relation_structural_semantic_exact:relationExact,path_only_metadata_differences_allowed:true};
 if(baseline.status!=='PASS')fail('Generic pipeline baseline reproduction mismatch');
}
const g=read(files.graph), b1d=read(files.b1), b2d=read(files.b2), b3d=read(files.b3);
const report={metadata:{name:'YOYO Style-Agnostic Offline Pipeline Report',version:'0.6C',status:'PASS',style_id:ws.style.id,style_display_name:ws.style.display_name,b1_mode:reuseB1?'REUSE_PROVEN_B1':'FULL_CACHE_ONLY',network_fetch_allowed:false,live_runtime_modified:false},summary:{images:b1d?.metadata?.success_count??null,physical_modes:b2d?.color_modes?.length??b2d?.metadata?.natural_color_mode_count??null,b3_modes:b3d?.modes?.length??null,relation_nodes:g.node_count,relation_edges:g.edge_count},baseline_reproduction:baseline,artifacts:Object.fromEntries(Object.entries(files).filter(([k])=>!k.includes('preview')).map(([k,p])=>[k,{file:path.basename(p),sha256:hash(p)}]))};
write(path.join(outDir,'style_pipeline_report_v0_6c.json'),report);console.log('✅ Style-agnostic pipeline PASS.');console.log(`Report: ${path.join(outDir,'style_pipeline_report_v0_6c.json')}`);
