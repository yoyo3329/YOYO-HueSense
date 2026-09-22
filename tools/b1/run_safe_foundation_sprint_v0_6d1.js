#!/usr/bin/env node
'use strict';
const {spawnSync}=require('child_process'),fs=require('fs'),path=require('path');const B=__dirname;
function run(f,args=[]){console.log(`>>> ${f}${args.length?' '+args.join(' '):''}`);const r=spawnSync(process.execPath,[path.join(B,f),...args],{stdio:'inherit'});if(r.status!==0){console.error(`\n❌ v0.6D.1 failed at ${f}`);process.exit(r.status||1)}}
console.log('=== YOYO Safe Foundation v0.6D.1 — Governance + v0.6E Preconditions ===');
console.log('Scope: record perceptual failure honestly; separate selection from Tone/Hue calibration; preserve determinism before real fetch.');
run('run_safe_foundation_sprint_v0_6d.js');
run('network-sandbox-contract.contract.test.js');
run('selection-readiness-contract.contract.test.js');
run('build_perceptual_validation_debt_v0_6d1.js');
run('run_safe_foundation_integrity_audit_v0_6d1.js');
run('build_project_state_manifest_v0_6d1.js');
const audit=JSON.parse(fs.readFileSync(path.join(B,'safe_foundation_integrity_audit_v0_6d1.json'),'utf8'));
const report={metadata:{name:'YOYO Safe Foundation Sprint Report v0.6D.1',version:'0.6D.1',status:audit.metadata.status},summary:{governance_integrity:`${audit.summary.pass}/${audit.summary.total}`,v0_6d:'PASS_SCOPED_CLOSED',perceptual_relation_v0_5:'FAILED_BOUNDARY_STRESS_REDESIGN_REQUIRED',network_determinism:'REPLAY_ONLY',quiet_luxury_fetch_only_ceiling:'PENDING_VISUAL_SELECTION',live_integration:'OFF'}};
fs.writeFileSync(path.join(B,'safe_foundation_sprint_report_v0_6d1.json'),JSON.stringify(report,null,2)+'\n');
console.log('\n✅ v0.6D.1 PASS.');
console.log('✅ v0.6D closure is now explicitly scoped to ingestion infrastructure.');
console.log('✅ v0.5 Tone failure is a visible production blocker, not hidden by foundation PASS.');
console.log('✅ No missing holdout file may silently fabricate BOUNDARY_CONTRADICTION_FOUND.');
console.log('✅ Real network is forbidden in deterministic tests; capture/replay contract is ready.');
console.log('✅ Fetch/cache alone can reach at most PENDING_VISUAL_SELECTION.');
console.log('✅ CLIP reference selection is distinct from Human Tone/Hue calibration.');
