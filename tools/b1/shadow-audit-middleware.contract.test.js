#!/usr/bin/env node
'use strict';
const assert=require('assert');
const M=require('./shadow-audit-middleware-v0_1.js');
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
(async()=>{
  let pass=0;const tests=[];function test(n,f){tests.push([n,f])}
  test('contract is shadow-only and non-blocking',()=>{assert.equal(M.CONTRACT.mode,'SHADOW_ONLY_NON_BLOCKING');assert.equal(M.CONTRACT.production_decision_authority,false);assert.equal(M.CONTRACT.invariants.can_block_search,false)});
  test('shadow task is deferred until after observe returns',async()=>{
    let started=0;const mw=M.createShadowAuditMiddleware({sampleRate:1,queueLimit:8,taskTimeoutMs:100});
    const r=mw.observe({stage:'test'},async()=>{started++});
    assert.equal(r.accepted,true);assert.equal(started,0);
    await mw.drain();assert.equal(started,1);
  });
  test('sampling can skip without running shadow work',async()=>{
    let ran=0;const mw=M.createShadowAuditMiddleware({sampleRate:0,random:()=>0});
    const r=mw.observe({},()=>{ran++});assert.equal(r.sampled,false);await mw.drain();assert.equal(ran,0);
  });
  test('queue is bounded and overflow is fail-open drop',async()=>{
    let release;const gate=new Promise(r=>release=r);const mw=M.createShadowAuditMiddleware({sampleRate:1,queueLimit:1,concurrency:1,taskTimeoutMs:500});
    const a=mw.observe({},()=>gate);const b=mw.observe({},()=>1);assert.equal(a.accepted,true);assert.equal(b.accepted,false);assert.equal(b.reason,'queue_full');release();await mw.drain();assert.equal(mw.stats().dropped_queue_full,1);
  });
  test('shadow exceptions are contained',async()=>{
    const mw=M.createShadowAuditMiddleware({sampleRate:1});mw.observe({},()=>{throw new Error('boom')});await mw.drain();assert.equal(mw.stats().failed,1);
  });
  test('shadow timeouts are contained',async()=>{
    const mw=M.createShadowAuditMiddleware({sampleRate:1,taskTimeoutMs:10});mw.observe({},()=>wait(40));await mw.drain();assert.equal(mw.stats().timed_out,1);
  });
  test('sink exceptions never escape',async()=>{
    const mw=M.createShadowAuditMiddleware({sampleRate:1,sink:{enqueue(){throw new Error('disk')}}});mw.observe({},()=>({audit_summary:{nodes:53}}));await mw.drain();assert(mw.stats().log_failures>=1);
  });
  test('diagnostics are allowlisted summary, not arbitrary shadow result',async()=>{
    const events=[];const mw=M.createShadowAuditMiddleware({sampleRate:1,sink:e=>events.push(e)});mw.observe({},()=>({raw_user_input:'secret',audit_summary:{nodes:53,status:'ok'}}));await mw.drain();assert.equal(events[0].diagnostics.nodes,53);assert(!JSON.stringify(events[0]).includes('secret'));
  });
  for(const [n,f] of tests){try{await f();pass++;console.log('PASS ',n)}catch(e){console.error('FAIL ',n);throw e}}
  console.log(`\n${pass}/${tests.length} ShadowAuditMiddleware contract tests PASS.`);
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
