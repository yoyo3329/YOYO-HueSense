#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawnSync}=require('child_process');
const Repro=require('./reproduction-policy-v0_6b_1.js');
const B=__dirname;
const forceReuseB1=process.argv.includes('--reuse-b1');
const forceB1=process.argv.includes('--force-b1');
const runId=`v0_6b1_${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`;
const backupDir=path.join(B,'_pipeline_backups',runId);
const core=[
 'y2k_color_mvp_b1_observations.json',
 'y2k_color_mvp_b2_aggregation.json',
 'b3_threshold_sensitivity.json',
 'y2k_color_mvp_b3_hierarchy.json',
 'y2k_color_relation_graph.json'
];
const derivedByteExact=core.slice(1);
function shaFile(file){const p=path.join(B,file);if(!fs.existsSync(p))return null;return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function readJson(file){return JSON.parse(fs.readFileSync(path.join(B,file),'utf8'))}
function b1PhysicalHash(){const p=path.join(B,core[0]);return fs.existsSync(p)?Repro.b1PhysicalHash(readJson(core[0])):null}
function backup(){fs.mkdirSync(backupDir,{recursive:true});for(const f of core){const p=path.join(B,f);if(fs.existsSync(p))fs.copyFileSync(p,path.join(backupDir,f));}}
function restore(){for(const f of core){const src=path.join(backupDir,f),dst=path.join(B,f);if(fs.existsSync(src))fs.copyFileSync(src,dst);}}
function stage(script,args=[]){const t=Date.now();console.log(`\n>>> ${script} ${args.join(' ')}`.trim());const r=spawnSync(process.execPath,[path.join(B,script),...args],{cwd:B,stdio:'inherit'});return {script,args,status:r.status,elapsed_ms:Date.now()-t}}
function writeReport(report){fs.writeFileSync(path.join(B,'offline_pipeline_report_v0_6b.json'),JSON.stringify(report,null,2)+'\n')}
function fail(msg,stages,pre,reproduction=null){console.error(`\n❌ ${msg}`);console.error('Rolling back core derived artifacts...');restore();const report={metadata:{name:'YOYO Offline Pipeline',version:'0.6B.1',status:'FAIL_ROLLED_BACK',run_id:runId,mode,network_fetch_allowed:false,comparison_policy:'B1_PHYSICAL_SEMANTIC_EXACT + DERIVED_BYTE_EXACT'},pre_hashes:pre,reproduction,stages};writeReport(report);process.exit(1)}
console.log('=== YOYO One-click Offline Pipeline v0.6B.1 ===');
console.log('Reproduction policy: B1 physical-semantic exact; B2/B3-A/Relation byte-for-byte exact.');
const sharpProbe=spawnSync(process.execPath,['-e',"require('sharp');"],{cwd:B,stdio:'ignore'});
const sharpAvailable=sharpProbe.status===0;
let reuseB1=forceReuseB1||(!forceB1&&!sharpAvailable);
let mode=reuseB1?(forceReuseB1?'REUSE_EXISTING_B1':'AUTO_REUSE_B1_SHARP_UNAVAILABLE'):'FULL_B1_CACHE_ONLY';
if(forceB1&&!sharpAvailable){console.error('❌ --force-b1 requested but sharp is unavailable for this platform.');process.exit(1)}
if(reuseB1){const b1p=path.join(B,core[0]);let valid=false;try{const d=JSON.parse(fs.readFileSync(b1p,'utf8'));valid=Array.isArray(d.items)&&d.items.length===24}catch(_){}if(!valid){console.error('❌ Cannot reuse B1: a valid 24-item B1 observation file is required.');process.exit(1)}}
console.log(`Mode: ${mode}`);
console.log('Network policy: B1 cache-only clone; no live network fetch is allowed.');
if(!sharpAvailable&&!forceReuseB1)console.log('Platform note: sharp unavailable here, so the frozen valid B1 artifact is reused automatically; derived stages still rebuild.');
backup();
const pre={raw:Object.fromEntries(core.map(f=>[f,shaFile(f)])),b1_physical_sha256:b1PhysicalHash()};
const stages=[];
const corePlan=[];
if(!reuseB1)corePlan.push(['run_b1_observation_offline_v0_6b.js',[]]);
corePlan.push(['run_b2_aggregation.js',[]],['run_b3_threshold_sensitivity.js',[]],['run_b3_hierarchy.js',[]],['run_b3_color_relation_graph.js',[]]);
for(const [s,a] of corePlan){const r=stage(s,a);stages.push(r);if(r.status!==0)fail(`Stage failed: ${s}`,stages,pre)}
const postRaw=Object.fromEntries(core.map(f=>[f,shaFile(f)]));
const postB1Physical=b1PhysicalHash();
const reproduction={
 b1:{pre_raw_sha256:pre.raw[core[0]],post_raw_sha256:postRaw[core[0]],raw_byte_exact:pre.raw[core[0]]===postRaw[core[0]],pre_physical_sha256:pre.b1_physical_sha256,post_physical_sha256:postB1Physical,physical_semantic_exact:pre.b1_physical_sha256===postB1Physical,accepted_transport_only_difference:(pre.raw[core[0]]!==postRaw[core[0]])&&(pre.b1_physical_sha256===postB1Physical)},
 derived:{}
};
for(const f of derivedByteExact)reproduction.derived[f]={pre_sha256:pre.raw[f],post_sha256:postRaw[f],byte_exact:pre.raw[f]===postRaw[f]};
const derivedExact=Object.values(reproduction.derived).every(x=>x.byte_exact);
const gatePass=reproduction.b1.physical_semantic_exact&&derivedExact;
reproduction.policy={name:'B1_PHYSICAL_SEMANTIC_EXACT + DERIVED_BYTE_EXACT',ignored_b1_transport_fields:['items[*].analysis_provenance.image_fetch_mode','items[*].analysis_provenance.primary_error'],numeric_tolerance:0,gate_pass:gatePass};
console.log('\n=== Reproduction Gate v0.6B.1 ===');
console.log(`B1 raw byte exact             : ${reproduction.b1.raw_byte_exact}`);
console.log(`B1 physical-semantic exact    : ${reproduction.b1.physical_semantic_exact}`);
console.log(`Transport-only diff accepted  : ${reproduction.b1.accepted_transport_only_difference}`);
console.log(`B2/B3/Relation byte exact     : ${derivedExact}`);
if(!gatePass)fail('Deterministic physical reproduction mismatch in one or more core artifacts.',stages,pre,reproduction);

// Only after the reproduction gate passes do we publish downstream shadow/profile diagnostics.
for(const [s,a] of [['build_dynamic_profile_packet_v0_6b.js',[]],['create_provenance_trace_v0_6b.js',[]],['run_pipeline_integrity_audit_v0_6a.js',[]]]){const r=stage(s,a);stages.push(r);if(r.status!==0)fail(`Post-gate stage failed: ${s}`,stages,pre,reproduction)}
const report={metadata:{name:'YOYO One-click Offline Pipeline',version:'0.6B.1',status:'PASS',run_id:runId,mode,sharp_available:sharpAvailable,b1_reused:reuseB1,network_fetch_allowed:false,transactional_core_rollback_on_failure:true,comparison_policy:'B1_PHYSICAL_SEMANTIC_EXACT + DERIVED_BYTE_EXACT'},summary:{stages:stages.length,all_stages_pass:true,reproduction_gate_pass:true,b1_raw_byte_exact:reproduction.b1.raw_byte_exact,b1_physical_semantic_exact:true,derived_byte_exact:true},reproduction,stages,outputs:['y2k_dynamic_profile_packet_v0_6b.json','runtime_profile_provenance_v0_6b.json']};
writeReport(report);
console.log('\n✅ Offline pipeline PASS.');
console.log('✅ B1 physical observations reproduced exactly after excluding transport-only diagnostics.');
console.log('✅ B2/B3-A/Relation reproduced byte-for-byte.');
console.log(`Report: ${path.join(B,'offline_pipeline_report_v0_6b.json')}`);
