#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const steps = [
  'color-relation-candidate-v0_5.contract.test.js',
  'run_relation_formula_calibration_v0_5.js',
  'run_b3_color_relation_graph_v0_5_candidate.js',
  'run_relation_train_regression_v0_5.js',
  'run_relation_baseline_comparison_v0_5.js',
  'run_relation_graph_audit_v0_5.js',
  'build_gold_holdout_queue_v0_5.js',
  'build_gold_holdout_blind_lab_v0_5.js',
];

console.log('=== YOYO Relation Formula Sprint v0.5 ===\n');
for (const s of steps) {
  console.log(`>>> ${s}`);
  const r = spawnSync(process.execPath,[path.join(__dirname,s)],{cwd:__dirname,stdio:'inherit'});
  if (r.status !== 0) {
    console.error(`\n❌ Failed: ${s}`);
    process.exit(r.status || 1);
  }
  console.log('');
}
console.log('✅ All Relation Formula Sprint v0.5 steps passed.');
console.log('⚠ Candidate only: independent GOLD_HOLDOUT has not been labeled yet.');
