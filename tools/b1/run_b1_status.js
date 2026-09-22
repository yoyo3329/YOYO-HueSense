#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const B=__dirname;
function r(f){try{return JSON.parse(fs.readFileSync(path.join(B,f),'utf8'))}catch{return null}}
const d1=r('safe_foundation_sprint_report_v0_6d1.json');
const debt=r('perceptual_validation_debt_v0_6d1.json');
const report=r('v0_7_independent_validation_report.json');
const audit=r('v0_7_final_validation_integrity_audit.json');
const cv=r('v0_7_train_cv_diagnostic_correction.json');
console.log('=== YOYO / HueSense Project Status v0.7.0b ===\n');
console.log(`v0.6D.1 governance       : ${d1?.metadata?.status||'NOT FOUND'}`);
console.log('v0.6D ingestion          : PASS / SCOPED CLOSED');
console.log('Live runtime             : OFF / app.js NOT INTEGRATED\n');

console.log('v0.5 known blocker');
if(debt?.v0_5_candidate){
  console.log(`Boundary stress           : ${debt.v0_5_candidate.holdout_status}`);
  console.log(`Tone                      : ${debt.v0_5_candidate.tone.correct}/${debt.v0_5_candidate.tone.total}`);
  console.log(`Reliable Hue              : ${debt.v0_5_candidate.hue_relation_reliable.correct}/${debt.v0_5_candidate.hue_relation_reliable.total}`);
}
console.log('');

if(report){
  console.log('v0.7 first independent validation');
  for(const [k,x] of Object.entries(report.score||{}))
    console.log(`${k.padEnd(27)} ${x.correct}/${x.total} (${(x.rate*100).toFixed(1)}%)`);
  console.log(`High-conf contradictions  : ${report.high_confidence_all_relation_contradictions}`);
  console.log(`Commitment verified       : ${report.metadata.validation_commitment_verified?'YES':'NO'}`);
  console.log(`Final integrity audit     : ${audit?.metadata?.status||'NOT RUN'}`);
  console.log(`Status                    : ${report.metadata.status}`);
  console.log('Production eligible       : false');
  console.log('Universality              : UNVALIDATED');
  console.log('Validation set            : RETIRED / NO RETUNING / TAXONOMY ONLY');
  if(cv) console.log(`Train Hue-CV diagnostic   : corrected report ${cv.corrected_reliable_only_loo.correct}/${cv.corrected_reliable_only_loo.total}; candidate unchanged`);
  console.log('\nNEXT: Do not retune v0.7 on these 12 validation labels. If redesign continues, start a new candidate version and reserve a fresh independent validation set.');
}else{
  console.log('v0.7 validation report    : NOT YET COMPLETED');
}
