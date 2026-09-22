'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = process.argv[2] || path.resolve(__dirname, '..');
const discoveryPath = path.join(__dirname, 'v0_7_prediction_source_discovery.json');

const d = spawnSync(
  process.execPath,
  [path.join(__dirname, 'discover_v0_7_frozen_prediction_sources.js'), projectRoot, discoveryPath],
  { encoding: 'utf8' }
);

process.stdout.write(d.stdout || '');
process.stderr.write(d.stderr || '');

if (d.status !== 0) process.exit(d.status || 1);

const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
const likely = discovery.candidate_files.filter(x => x.likely_frozen_prediction_source);

const state = {
  metadata: {
    name: 'YOYO v0.8 Stage A Prep State',
    version: '0.8-stage-a-prep-1'
  },
  research_policy: 'RETired v0.7 validation = FAILURE TAXONOMY ONLY',
  likely_frozen_prediction_sources: likely.map(x => x.path),
  status: null,
  next_action: null
};

if (likely.length === 1 && path.extname(likely[0].path).toLowerCase() === '.json') {
  const out = path.join(__dirname, 'v0_8_failure_taxonomy_chroma.json');
  const b = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'build_v0_8_failure_taxonomy_chroma.js'),
      '--predictions', likely[0].path,
      '--output', out
    ],
    { encoding: 'utf8' }
  );

  process.stdout.write(b.stdout || '');
  process.stderr.write(b.stderr || '');

  if (b.status === 0) {
    state.status = 'FAILURE_TAXONOMY_BUILT';
    state.next_action = 'REVIEW_TAXONOMY_THEN_PREPARE_FRESH_12_16_CASE_STAGE_A_TRAIN';
  } else {
    state.status = 'WAITING_EXPLICIT_FROZEN_PREDICTION_ARTIFACT';
    state.next_action = 'Discovery found a likely file, but its JSON shape was not safely extractable. Select the exact frozen v0.7 prediction artifact manually.';
  }
} else {
  state.status = 'WAITING_EXPLICIT_FROZEN_PREDICTION_ARTIFACT';
  state.next_action =
    likely.length === 0
      ? 'No unique frozen prediction artifact was found automatically. Locate the v0.7 finalizer/candidate prediction JSON in the project and pass it to build_v0_8_failure_taxonomy_chroma.js.'
      : 'Multiple likely prediction sources found. Select the actual frozen v0.7 prediction artifact; do not guess.';
}

fs.writeFileSync(
  path.join(__dirname, 'v0_8_stage_a_state.json'),
  JSON.stringify(state, null, 2) + '\n'
);

console.log('\n=== v0.8 Stage A Prep ===');
console.log(`Status : ${state.status}`);
console.log(`NEXT   : ${state.next_action}`);
