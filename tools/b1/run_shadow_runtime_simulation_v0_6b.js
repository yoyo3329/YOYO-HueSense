#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const M=require('./shadow-audit-middleware-v0_1.js');
const L=require('./runtime-audit-log-v0_1.js');
const C=require('./dynamic-profile-contract-v0_1.js');
const B=__dirname;
const PROFILE=path.join(B,'y2k_dynamic_profile_packet_v0_6b.json');
const LOGDIR=path.join(B,'shadow_runtime_audit_v0_6b');
const OUT=path.join(B,'shadow_runtime_simulation_v0_6b.json');
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function quantile(xs,q){const a=[...xs].sort((x,y)=>x-y);if(!a.length)return null;const i=Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*q)));return a[i]}
(async()=>{
  if(!fs.existsSync(PROFILE)) throw new Error('Missing dynamic profile packet. Run build_dynamic_profile_packet_v0_6b.js first.');
  const profile=JSON.parse(fs.readFileSync(PROFILE,'utf8'));C.validatePacket(profile);
  fs.rmSync(LOGDIR,{recursive:true,force:true});fs.mkdirSync(LOGDIR,{recursive:true});
  const logger=L.createRuntimeAuditLogger({dir:LOGDIR,prefix:'shadow-sim',batchSize:20,flushIntervalMs:50,maxQueue:1000,maxFileBytes:1024*1024,maxFiles:3});
  let shadowStarted=0;
  const mw=M.createShadowAuditMiddleware({sampleRate:1,queueLimit:256,concurrency:4,taskTimeoutMs:25,sink:logger});
  const N=200;let productionMutations=0,synchronousShadowStarts=0;const enqueueMs=[];
  for(let i=0;i<N;i++){
    const production={request_id:`req_${i}`,search_status:'OK',result_count:30,palette_token:`palette_${i}`};
    const before=JSON.stringify(production);const startedBefore=shadowStarted;
    const t=process.hrtime.bigint();
    const accepted=mw.observe({run_id:'shadow-sim-v0.6b',stage:'relation_shadow',source_profile_id:profile.metadata.profile_id,source_profile_version:profile.metadata.profile_version,concept_fingerprint:profile.metadata.concept_fingerprint},async()=>{
      shadowStarted++;
      if(i%67===0) throw new Error('synthetic shadow engine failure');
      if(i%71===0){await wait(50);return {audit_summary:{nodes:profile.atomic_nodes.length}};}
      C.validatePacket(profile);
      return {audit_summary:{nodes:profile.atomic_nodes.length,relations:profile.relation_graph.edge_count,structural_profile_valid:true}};
    });
    const dt=Number(process.hrtime.bigint()-t)/1e6;enqueueMs.push(dt);
    if(shadowStarted!==startedBefore)synchronousShadowStarts++;
    if(JSON.stringify(production)!==before)productionMutations++;
    if(!accepted.accepted) throw new Error(`Unexpected simulation queue rejection at ${i}: ${accepted.reason}`);
  }
  const stats=await mw.close();
  const files=fs.readdirSync(LOGDIR).filter(f=>f.endsWith('.ndjson')).sort();
  const rows=[];for(const f of files){const t=fs.readFileSync(path.join(LOGDIR,f),'utf8').trim();if(t)rows.push(...t.split(/\n/).map(JSON.parse));}
  const rawLeak=rows.some(r=>JSON.stringify(r).includes('palette_')||JSON.stringify(r).includes('req_'));
  const report={
    metadata:{name:'YOYO Shadow Runtime Simulation',version:'0.6B',status:'PASS',mode:'SHADOW_ONLY',production_integration_performed:false},
    workload:{requests:N,sample_rate:1,queue_limit:256,concurrency:4,task_timeout_ms:25,synthetic_failures_expected:3,synthetic_timeouts_expected:2},
    production_safety:{production_mutations:productionMutations,synchronous_shadow_starts:synchronousShadowStarts,search_block_events:0,palette_change_events:0},
    performance:{enqueue_ms_median:quantile(enqueueMs,.5),enqueue_ms_p95:quantile(enqueueMs,.95),enqueue_ms_max:Math.max(...enqueueMs),note:'Informational local simulation timings; safety gate is deferred execution + bounded queue, not a fixed millisecond threshold.'},
    middleware_stats:stats,
    audit_log:{files:files.length,events:rows.length,raw_request_or_palette_token_leak:rawLeak,privacy_contract:L.CONTRACT.privacy},
    assertions:{all_requests_accepted:stats.accepted===N,no_synchronous_shadow_execution:synchronousShadowStarts===0,production_unchanged:productionMutations===0,no_raw_payload_leak:rawLeak===false,failures_contained:stats.failed===3,timeouts_contained:stats.timed_out===2}
  };
  if(!Object.values(report.assertions).every(Boolean)){report.metadata.status='FAIL';fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');throw new Error('Shadow runtime simulation assertion failed');}
  fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
  console.log('=== YOYO Shadow Runtime Simulation v0.6B ===');
  console.log(`Requests                       : ${N}`);
  console.log(`Synchronous shadow starts      : ${synchronousShadowStarts}`);
  console.log(`Production mutations           : ${productionMutations}`);
  console.log(`Shadow success                 : ${stats.completed}`);
  console.log(`Contained failures             : ${stats.failed}`);
  console.log(`Contained timeouts             : ${stats.timed_out}`);
  console.log(`Max queue depth                : ${stats.max_queue_depth}/256`);
  console.log(`Enqueue p95 (informational ms) : ${report.performance.enqueue_ms_p95.toFixed(4)}`);
  console.log(`Audit events                   : ${rows.length}`);
  console.log(`Raw request/palette leak       : ${rawLeak}`);
  console.log(`Output                         : ${OUT}`);
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
