#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('./v0_7_common.js');
const C = require('./perceptual-relation-contract-v0_7.js');
const R = require('./perceptual-relation-candidate-v0_7.js');

const B = __dirname;
function assert(c, m){ if(!c) throw new Error(m); }
function exists(f){ return fs.existsSync(path.join(B,f)); }

if(!exists('v0_7_validation_human.json')){
  console.log('HUMAN_VALIDATION_REQUIRED: place v0_7_validation_human.json in tools\\b1');
  process.exit(11);
}

const d = U.read('v0_7_validation_human.json');
C.assertDirectHumanDataset(d, 'INDEPENDENT_VALIDATION');
assert(d.cases.length === 12, 'Expected exactly 12 validation cases');

const freeze = U.read('v0_7_candidate_freeze.json');
const cfg = U.read('perceptual_relation_candidate_config_v0_7.json');
const q = U.read('v0_7_validation_queue.json');
const commit = U.read('v0_7_validation_commitment.json');

assert(freeze.metadata?.status === 'FROZEN_BEFORE_VALIDATION_LABELS',
  'Candidate freeze status invalid');

assert(U.fileSha('perceptual_relation_candidate_config_v0_7.json') === freeze.candidate_config_sha256,
  'Candidate config changed after freeze');

assert(U.fileSha('perceptual-relation-candidate-v0_7.js') === freeze.candidate_code_sha256,
  'Candidate prediction code changed after freeze');

assert(U.fileSha('v0_7_train_human.json') === freeze.train_labels_sha256,
  'Train labels changed after candidate freeze');

assert(q.metadata?.materialized_after_candidate_freeze === true,
  'Validation queue was not materialized after candidate freeze');

assert(q.metadata?.candidate_config_sha256 === freeze.candidate_config_sha256,
  'Validation queue is bound to a different candidate config');

assert(Array.isArray(q.cases) && q.cases.length === 12,
  'Materialized validation queue must contain exactly 12 cases');

const qDigest = U.sha(q.cases.map(x=>x.pair_key).sort().join('\n'));
const dDigest = U.sha(d.cases.map(x=>x.pair_key).sort().join('\n'));

assert(qDigest === commit.validation_pair_digest,
  'Materialized validation queue does not match pre-train commitment');

assert(dDigest === commit.validation_pair_digest,
  'Human validation pair set does not match pre-train commitment');

const seenPairs = new Set(), seenIds = new Set();
for(let i=0;i<12;i++){
  const got = d.cases[i], exp = q.cases[i];
  assert(!seenPairs.has(got.pair_key), `Duplicate validation pair: ${got.pair_key}`);
  assert(!seenIds.has(got.case_id), `Duplicate validation case_id: ${got.case_id}`);
  seenPairs.add(got.pair_key); seenIds.add(got.case_id);

  assert(got.case_id === exp.case_id, `Validation case_id mismatch at index ${i}`);
  assert(got.pair_key === exp.pair_key, `Validation pair mismatch at ${got.case_id}`);
  assert(got.a?.mode_id === exp.a?.mode_id && got.b?.mode_id === exp.b?.mode_id,
    `Validation mode ordering mismatch at ${got.case_id}`);
  assert(got.a?.hex === exp.a?.hex && got.b?.hex === exp.b?.hex,
    `Validation color payload mismatch at ${got.case_id}`);
}

assert(Date.parse(d.metadata.exported_at) >= Date.parse(freeze.frozen_at),
  'Validation labels predate candidate freeze; independence broken');

const graph = U.read('y2k_color_relation_graph.json');
const em = U.edgeMap(graph);
const dims = ['lightness_relation','chroma_relation','hue_applicability','tone_relation'];
const score = Object.fromEntries(dims.map(k=>[k,{correct:0,total:0}]));
score.hue_relation_reliable = {correct:0,total:0};
score.all_relevant = {correct:0,total:0};

let hiContr = 0;
const rows = [];

for(const c of d.cases){
  const e = em.get(c.pair_key || U.getPairFromCase(c));
  assert(e, `Validation edge missing: ${c.pair_key}`);
  const y = c.human_label;
  const p = R.predict(e.physical_relations, cfg);
  let all = true;

  for(const k of dims){
    if(y[k] === 'review') continue;
    score[k].total++;
    const ok = p[k] === y[k];
    if(ok) score[k].correct++;
    else all = false;
  }

  if(y.hue_applicability === 'reliable' && y.hue_relation !== 'review'){
    score.hue_relation_reliable.total++;
    const ok = p.hue_relation === y.hue_relation;
    if(ok) score.hue_relation_reliable.correct++;
    else all = false;
  }

  if(y.hue_applicability === 'low_chroma' && p.hue_relation !== 'not_applicable') all = false;

  score.all_relevant.total++;
  if(all) score.all_relevant.correct++;
  if(!all && y.confidence === 'high') hiContr++;

  rows.push({
    case_id:c.case_id,
    pair_key:e.pair_key,
    human:y,
    predicted:p,
    all_relevant_pass:all
  });
}

for(const v of Object.values(score)) v.rate = v.total ? v.correct / v.total : null;

const g = C.CONTRACT.preregistered_pilot_gate;
const gateChecks = {
  complete: d.cases.length >= g.min_complete_cases,
  lightness: score.lightness_relation.rate >= g.min_lightness_exact_rate,
  chroma: score.chroma_relation.rate >= g.min_chroma_exact_rate,
  tone: score.tone_relation.rate >= g.min_tone_exact_rate,
  hue_applicability: score.hue_applicability.rate >= g.min_hue_applicability_exact_rate,
  reliable_hue_count: score.hue_relation_reliable.total >= g.min_reliable_hue_cases,
  reliable_hue_rate:
    score.hue_relation_reliable.total >= g.min_reliable_hue_cases &&
    score.hue_relation_reliable.rate >= g.min_reliable_hue_exact_rate,
  all_relevant: score.all_relevant.rate >= g.min_all_relevant_exact_rate,
  high_conf_contradictions: hiContr <= g.max_high_confidence_all_relation_contradictions
};

const pass = Object.values(gateChecks).every(Boolean);

const out = {
  metadata:{
    name:'YOYO v0.7 First Independent Validation',
    version:'0.7.0b',
    candidate_version:'0.7.0',
    status: pass ? 'PILOT_PASS_NOT_PRODUCTION_READY' : 'PILOT_FAIL_REDESIGN_REQUIRED',
    validation_scope:'Y2K_INDEPENDENT_VALIDATION_PILOT',
    candidate_frozen_before_labels:true,
    validation_labels_used_for_retuning:false,
    validation_commitment_verified:true,
    validation_queue_exact_match:true,
    candidate_code_hash_verified:true,
    candidate_config_hash_verified:true,
    train_labels_hash_verified:true,
    production_gate_eligible:false,
    universality_status:'UNVALIDATED'
  },
  candidate_freeze: freeze,
  validation_commitment:{
    validation_pair_digest:commit.validation_pair_digest,
    verified:true
  },
  score,
  high_confidence_all_relation_contradictions:hiContr,
  preregistered_gate:g,
  gate_checks:gateChecks,
  rows
};

U.write('v0_7_independent_validation_report.json', out);

console.log('=== v0.7 Independent Validation — Commitment Verified ===');
for(const [k,v] of Object.entries(score)){
  console.log(`${k.padEnd(28)} ${v.correct}/${v.total} ${v.rate==null?'n/a':(v.rate*100).toFixed(1)+'%'}`);
}
console.log(`High-conf contradictions       ${hiContr}`);
console.log(`Commitment exact match         PASS`);
console.log(`Candidate config/code hash     PASS`);
console.log(`Train labels freeze hash       PASS`);
console.log(`Status                         ${out.metadata.status}`);
console.log('Production eligible            false');
