#!/usr/bin/env node
'use strict';
const {spawnSync}=require('child_process'),fs=require('fs'),path=require('path');const B=__dirname;
function run(f,args=[]){console.log(`>>> ${f}${args.length?' '+args.join(' '):''}`);const r=spawnSync(process.execPath,[path.join(B,f),...args],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
console.log('=== YOYO v0.7.0b — Commitment-Verified Final Validation ===');
if(!fs.existsSync(path.join(B,'v0_7_validation_human.json'))){
  console.log('HUMAN_VALIDATION_REQUIRED');
  process.exit(11);
}
run('validate_v0_7_candidate_v0_7_0b.js');
run('retire_v0_7_validation.js');
run('audit_v0_7_train_cv_diagnostic_v0_7_0b.js');
run('audit_v0_7_final_validation_integrity.js');
run('build_project_state_manifest_v0_7_0b.js');
console.log('\n✅ v0.7 first independent validation finalized with commitment verification.');
console.log('✅ No validation retuning or production auto-promotion is permitted.');
