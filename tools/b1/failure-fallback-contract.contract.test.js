#!/usr/bin/env node
'use strict';
const assert=require('assert');
const F=require('./failure-fallback-contract-v0_1.js');
let pass=0;
function test(name,fn){try{fn();pass++;console.log('PASS ',name)}catch(e){console.error('FAIL ',name);throw e}}

test('contract is fail-open and shadow-only',()=>{
  assert.equal(F.CONTRACT.mode,'FAIL_OPEN_SHADOW_ONLY');
  assert.equal(F.CONTRACT.production_authority,false);
  assert.equal(F.CONTRACT.invariants.can_block_search,false);
});

test('timeout resolves to continue production unchanged',()=>{
  const d=F.resolveFailure(new Error('shadow timeout'),{stage:'shadow'});
  assert.equal(d.category,'TIMEOUT');
  assert.equal(d.production_action,'CONTINUE_UNCHANGED');
  assert.equal(d.can_change_palette,false);
  F.assertSafeDecision(d);
});

test('queue full drops shadow task only',()=>{
  const d=F.resolveFailure(null,{reason:'queue_full',stage:'shadow'});
  assert.equal(d.category,'QUEUE_FULL');
  assert.equal(d.shadow_action,'DROP_SHADOW_TASK');
  F.assertSafeDecision(d);
});

test('log sink failure is contained',()=>{
  const d=F.resolveFailure(new Error('disk full'),{stage:'audit_log'});
  assert.equal(d.category,'LOG_SINK_FAILURE');
  assert.equal(d.audit_action,'DROP_LOG_EVENT');
  F.assertSafeDecision(d);
});

test('protectProduction returns exact original reference',()=>{
  const prod={results:[1,2,3],palette:['#fff']};
  const got=F.protectProduction(prod,new Error('boom'),{stage:'shadow'},()=>{throw new Error('sink broken')});
  assert.strictEqual(got,prod);
  assert.deepStrictEqual(got,{results:[1,2,3],palette:['#fff']});
});

console.log(`\n${pass}/5 FailureFallback contract tests PASS.`);
