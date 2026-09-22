#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const C=require('./dynamic-profile-contract-v0_1.js');
const F=require('./failure-fallback-contract-v0_1.js');
const L=require('./runtime-audit-log-v0_1.js');
const B=__dirname;const checks=[];let failed=0;
function ok(name,cond,detail=''){checks.push({name,pass:!!cond,detail});if(!cond)failed++;console.log(`${cond?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`)}
function read(name){const p=path.join(B,name);ok(`file exists: ${name}`,fs.existsSync(p));if(!fs.existsSync(p))return null;try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){ok(`JSON parse: ${name}`,false,e.message);return null}}
console.log('=== YOYO Safe Foundation Integrity Audit v0.6B ===');
const a6=read('pipeline_integrity_audit_v0_6a.json');
const off=read('offline_pipeline_report_v0_6b.json');
const prof=read('y2k_dynamic_profile_packet_v0_6b.json');
const prov=read('runtime_profile_provenance_v0_6b.json');
const sim=read('shadow_runtime_simulation_v0_6b.json');
const pol=read('shadow_runtime_policy_v0_6b.json');
const cand=read('relation_formula_candidate_config_v0_5.json');
if(a6)ok('v0.6A integrity still PASS',a6.metadata?.status==='PASS');
if(off){ok('offline pipeline PASS',off.metadata?.status==='PASS');ok('offline reproduction gate PASS',off.summary?.reproduction_gate_pass===true);ok('B1 physical-semantic reproduction exact',off.summary?.b1_physical_semantic_exact===true);ok('derived B2/B3/Relation byte exact',off.summary?.derived_byte_exact===true);ok('offline pipeline network fetch disabled',off.metadata?.network_fetch_allowed===false);ok('offline pipeline core rollback enabled',off.metadata?.transactional_core_rollback_on_failure===true)}
if(prof){try{C.validatePacket(prof);ok('dynamic profile contract validates',true)}catch(e){ok('dynamic profile contract validates',false,e.message)}
 ok('dynamic profile has 53 atomic nodes',prof.atomic_nodes?.length===53,`got ${prof.atomic_nodes?.length}`);
 ok('dynamic profile has 1378 relations',prof.relation_graph?.edge_count===1378,`got ${prof.relation_graph?.edge_count}`);
 ok('dynamic profile is SHADOW_ONLY',prof.authority?.runtime_mode==='SHADOW_ONLY');
 ok('dynamic profile cannot block search',prof.authority?.can_block_search===false);
 ok('dynamic profile cannot change palette',prof.authority?.can_change_palette===false);
 ok('B3-D views remain reserved',prof.views?.status==='RESERVED_B3D_NOT_BUILT');
 const txt=JSON.stringify(prof);ok('candidate v0.5 semantics excluded from profile packet',!txt.includes('perceptual_relations_candidate_v0_5'));ok('provisional perceptual relation fields excluded from profile packet',!txt.includes('perceptual_relations_provisional'));
}
if(prov){ok('provenance stores no raw user input',prov.run?.raw_user_input_stored===false);ok('provenance has no missing tracked files',(prov.files||[]).filter(x=>x.missing).length===0,`missing=${(prov.files||[]).filter(x=>x.missing).length}`);ok('provenance manifest fingerprint is SHA-256 length',String(prov.manifest_fingerprint||'').length===64)}
if(sim){ok('shadow simulation PASS',sim.metadata?.status==='PASS');ok('simulation did not mutate production',sim.production_safety?.production_mutations===0);ok('simulation had zero synchronous shadow starts',sim.production_safety?.synchronous_shadow_starts===0);ok('simulation had zero search block events',sim.production_safety?.search_block_events===0);ok('simulation had zero palette change events',sim.production_safety?.palette_change_events===0);ok('synthetic shadow failures contained',sim.middleware_stats?.failed===3,`got ${sim.middleware_stats?.failed}`);ok('synthetic shadow timeouts contained',sim.middleware_stats?.timed_out===2,`got ${sim.middleware_stats?.timed_out}`);ok('audit log has no raw request/palette leak',sim.audit_log?.raw_request_or_palette_token_leak===false);ok('simulation queue stayed bounded',sim.middleware_stats?.max_queue_depth<=256,`max=${sim.middleware_stats?.max_queue_depth}`)}
if(pol){ok('live shadow integration remains disabled',pol.middleware?.enabled_in_live_runtime===false);ok('planned live sample rate is bounded',pol.middleware?.sample_rate<=0.10,`rate=${pol.middleware?.sample_rate}`);ok('planned live queue is bounded',pol.middleware?.queue_limit<=64,`limit=${pol.middleware?.queue_limit}`);ok('planned live concurrency is bounded',pol.middleware?.concurrency<=2,`concurrency=${pol.middleware?.concurrency}`);ok('planned live timeout is bounded',pol.middleware?.task_timeout_ms<=1200,`ms=${pol.middleware?.task_timeout_ms}`);ok('audit privacy disables raw user input',pol.audit_log?.raw_user_input_stored===false);ok('audit privacy disables image URLs',pol.audit_log?.image_urls_stored===false);ok('audit privacy disables palette payload',pol.audit_log?.palette_payload_stored===false)}
ok('fallback contract is fail-open',F.CONTRACT.mode==='FAIL_OPEN_SHADOW_ONLY');ok('fallback cannot block search',F.CONTRACT.invariants.can_block_search===false);ok('audit log privacy contract forbids raw input',L.CONTRACT.privacy.raw_user_input_stored===false);
if(cand){ok('v0.5 candidate remains TRAIN_FIT_ONLY',cand.metadata?.status==='TRAIN_FIT_ONLY');ok('v0.5 candidate remains production-ineligible',cand.metadata?.production_gate_eligible===false)}
const report={metadata:{name:'YOYO Safe Foundation Integrity Audit',version:'0.6B.1',status:failed?'FAIL':'PASS'},summary:{checks:checks.length,passed:checks.length-failed,failed},checks};
fs.writeFileSync(path.join(B,'safe_foundation_integrity_audit_v0_6b.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\n${failed?'❌':'✅'} ${checks.length-failed}/${checks.length} checks PASS`);if(failed)process.exit(1);
