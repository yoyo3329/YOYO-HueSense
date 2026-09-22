#!/usr/bin/env node
'use strict';
const C=require('./project-state-contract-v0_1.js');
let p=0,t=0;
function test(n,fn){t++;try{fn();console.log('PASS ',n);p++;}catch(e){console.error('FAIL ',n,'—',e.message);process.exitCode=1;}}
const valid={contract:{name:C.CONTRACT.name,version:C.CONTRACT.version},project:'YOYO/HueSense',current_phase:'SAFE_FOUNDATION_v0.6C',safety:{live_runtime_integration:false,candidate_v0_5_production_eligible:false,holdout_auto_retuning:false},calibration:{human_calibration_status:'PAUSED'},components:[{id:'x',status:'READY'}]};
test('valid state manifest accepted',()=>C.validate(valid));
test('live integration cannot silently become true',()=>{let x=JSON.parse(JSON.stringify(valid));x.safety.live_runtime_integration=true;let ok=false;try{C.validate(x)}catch(_){ok=true}if(!ok)throw new Error('unsafe manifest accepted')});
test('v0.5 candidate cannot silently become production eligible',()=>{let x=JSON.parse(JSON.stringify(valid));x.safety.candidate_v0_5_production_eligible=true;let ok=false;try{C.validate(x)}catch(_){ok=true}if(!ok)throw new Error('unsafe manifest accepted')});
test('holdout auto-retuning remains forbidden',()=>{let x=JSON.parse(JSON.stringify(valid));x.safety.holdout_auto_retuning=true;let ok=false;try{C.validate(x)}catch(_){ok=true}if(!ok)throw new Error('unsafe manifest accepted')});
console.log(`\n${p}/${t} ProjectState contract tests PASS.`);if(p!==t)process.exit(1);
