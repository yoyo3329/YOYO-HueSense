#!/usr/bin/env node
'use strict';
const U=require('./v0_7_common.js');

const report=U.read('v0_7_independent_validation_report.json');
const validation=U.read('v0_7_validation_human.json');
const out={
  metadata:{
    name:'YOYO v0.7 Independent Validation Retirement Record',
    version:'0.7.0b',
    status:'RETIRED_AFTER_FIRST_EVALUATION',
    scientific_role:'DIAGNOSTIC_ONLY_FOR_FUTURE_FAILURE_TAXONOMY',
    training_eligible:false,
    threshold_tuning_eligible:false,
    formula_selection_eligible:false,
    future_independent_validation_eligible:false
  },
  validation_file_sha256:U.fileSha('v0_7_validation_human.json'),
  validation_pair_digest:U.sha(validation.cases.map(x=>x.pair_key).sort().join('\n')),
  result_status:report.metadata.status,
  no_retuning_from_this_validation:true,
  note:'This validation set has now been observed. Future redesign may use it only for failure taxonomy, never to claim independent validation again.'
};
U.write('v0_7_validation_retirement_manifest.json',out);
console.log('Validation retirement record written: RETIRED_AFTER_FIRST_EVALUATION / NO RETUNING.');
