#!/usr/bin/env node
'use strict'; const {spawnSync}=require('child_process'),path=require('path');
const scripts=['tone-core.contract.test.js','color-relation-core.contract.test.js','run_pipeline_integrity_audit_v0_6a.js','runtime-profile-bridge.contract.test.js','freeze_reproducibility_snapshot_v0_6a.js'];
console.log('=== YOYO Safe Foundation Sprint v0.6A ===');
for(const s of scripts){console.log(`\n>>> ${s}`);const r=spawnSync(process.execPath,[path.join(__dirname,s)],{cwd:__dirname,stdio:'inherit'});if(r.status!==0){console.error(`\n❌ Failed: ${s}`);process.exit(r.status||1)}}
console.log('\n✅ Safe Foundation Sprint v0.6A passed. No human calibration was required and no live Runtime file was modified.');
