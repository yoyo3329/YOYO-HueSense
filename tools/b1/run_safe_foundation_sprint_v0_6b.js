#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawnSync}=require('child_process');
const B=__dirname,ROOT=path.resolve(B,'../..');
const protectedFiles=[
 {label:'live app.js',path:path.join(ROOT,'public','js','app.js')},
 {label:'ToneCore',path:path.join(B,'tone-core.js')},
 {label:'formal ColorRelationCore',path:path.join(B,'color-relation-core.js')},
 {label:'v0.5 candidate formula code',path:path.join(B,'color-relation-candidate-v0_5.js')},
 {label:'v0.5 candidate graph',path:path.join(B,'y2k_color_relation_graph_v0_5_candidate.json')},
 {label:'v0.4 Train',path:path.join(B,'gold_train_candidate_v0_4.json')},
 {label:'v0.5.2 retired Holdout evidence',path:path.join(B,'gold_holdout_human_v0_5_2.json')}
];
function hash(p){if(!fs.existsSync(p))return null;return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function snapshot(){return protectedFiles.map(x=>({...x,sha256:hash(x.path),exists:fs.existsSync(x.path)}))}
function run(script,args=[]){console.log(`\n>>> ${script} ${args.join(' ')}`.trim());const t=Date.now();const r=spawnSync(process.execPath,[path.join(B,script),...args],{cwd:B,stdio:'inherit'});return {script,args,status:r.status,elapsed_ms:Date.now()-t}}
const before=snapshot();const stages=[];
console.log('=== YOYO Safe Foundation Sprint v0.6B — One Chain ===');
console.log('Safety boundary: no live app integration, no Candidate promotion, no Holdout retuning.');
const plan=[
 ['run_safe_foundation_sprint_v0_6a.js',[]],
 ['dynamic-profile-contract.contract.test.js',[]],
 ['failure-fallback-contract.contract.test.js',[]],
 ['runtime-audit-log.contract.test.js',[]],
 ['shadow-audit-middleware.contract.test.js',[]],
 ['provenance-trace.contract.test.js',[]],
 ['reproduction-policy.contract.test_v0_6b_1.js',[]],
 ['run_b1_offline_cache_preflight_v0_6b.js',[]],
 ['run_offline_pipeline_v0_6b.js',[]],
 ['run_shadow_runtime_simulation_v0_6b.js',[]],
 ['run_safe_foundation_integrity_audit_v0_6b.js',[]]
];
for(const [s,a] of plan){const r=run(s,a);stages.push(r);if(r.status!==0){console.error(`\n❌ Sprint v0.6B failed at ${s}`);process.exit(r.status||1)}}
const after=snapshot();const protectedAudit=before.map((b,i)=>({label:b.label,path:b.path,exists_before:b.exists,exists_after:after[i].exists,sha256_before:b.sha256,sha256_after:after[i].sha256,unchanged:b.sha256===after[i].sha256}));
const allProtected=protectedAudit.every(x=>x.unchanged);
const report={metadata:{name:'YOYO Safe Foundation Sprint',version:'0.6B.1',status:allProtected?'PASS':'FAIL_PROTECTED_FILE_CHANGED',live_runtime_modified:false,human_calibration_required:false},summary:{stages:stages.length,stages_passed:stages.filter(x=>x.status===0).length,protected_files_unchanged:allProtected},protected_files:protectedAudit,stages};
fs.writeFileSync(path.join(B,'safe_foundation_sprint_report_v0_6b.json'),JSON.stringify(report,null,2)+'\n');
if(!allProtected){console.error('\n❌ A protected production/calibration artifact changed unexpectedly.');for(const x of protectedAudit.filter(x=>!x.unchanged))console.error(`Changed: ${x.label}`);process.exit(1)}
console.log('\n✅ Safe Foundation Sprint v0.6B PASS.');
console.log('✅ Live app.js unchanged.');
console.log('✅ Formal ColorRelationCore unchanged.');
console.log('✅ v0.5 Candidate remains production-ineligible and untouched.');
console.log('✅ v0.5.2 Holdout evidence untouched; no automatic retuning occurred.');
const offline=JSON.parse(fs.readFileSync(path.join(B,'offline_pipeline_report_v0_6b.json'),'utf8'));
console.log(`✅ Offline B1 → B2 → B3-A → Relation reproduction gate PASS (mode: ${offline.metadata.mode}).`);
console.log(`✅ B1 physical-semantic exact: ${offline.summary.b1_physical_semantic_exact}; derived byte exact: ${offline.summary.derived_byte_exact}.`);
console.log('✅ Shadow middleware + audit log + fallback + provenance + runtime simulation passed.');
