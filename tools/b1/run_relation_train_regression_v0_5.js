#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TRAIN = path.join(__dirname, 'gold_train_candidate_v0_4.json');
const GRAPH = path.join(__dirname, 'y2k_color_relation_graph_v0_5_candidate.json');
const OUTPUT = path.join(__dirname, 'relation_train_regression_v0_5.json');

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function key(a,b){ return [a,b].sort().join('||'); }

const train = read(TRAIN);
const graph = read(GRAPH);
const em = new Map(graph.edges.map(e => [e.pair_key,e]));

const cases = [];
let hueAppCorrect=0, hueRelCorrect=0, hueRelTotal=0, toneCorrect=0, allCorrect=0;

for (const c of train.cases) {
  const e = em.get(key(c.a.mode_id,c.b.mode_id));
  if (!e) throw new Error(`Missing edge for ${c.case_id}`);
  const pred = e.perceptual_relations_candidate_v0_5;
  const truth = c.human_retest_label;

  const ha = pred.hue_applicability === truth.hue_applicability;
  if (ha) hueAppCorrect += 1;

  let hr = true;
  if (truth.hue_applicability === 'reliable') {
    hueRelTotal += 1;
    hr = pred.hue_relation === truth.hue_relation;
    if (hr) hueRelCorrect += 1;
  } else {
    hr = pred.hue_relation === 'not_applicable';
  }

  const tr = pred.tone_relation === truth.tone_relation;
  if (tr) toneCorrect += 1;

  const all = ha && hr && tr;
  if (all) allCorrect += 1;

  cases.push({
    case_id: c.case_id,
    pair_key: e.pair_key,
    confidence: truth.confidence,
    expected: truth,
    predicted: pred,
    pass: { hue_applicability: ha, hue_relation: hr, tone_relation: tr, all },
  });
}

const out = {
  metadata: {
    name: 'YOYO Relation Train Regression v0.5',
    version: '0.5.0',
    status: 'TRAIN_FIT_ONLY',
    train_source: path.basename(TRAIN),
    graph_source: path.basename(GRAPH),
    independent_holdout_count: 0,
    warning: '100% train fit, if observed, is not validation. Do not use this report as a production accuracy claim.',
  },
  summary: {
    total_train_cases: cases.length,
    hue_applicability: { correct: hueAppCorrect, total: cases.length },
    hue_relation_reliable_only: { correct: hueRelCorrect, total: hueRelTotal },
    tone_relation: { correct: toneCorrect, total: cases.length },
    all_relations: { correct: allCorrect, total: cases.length },
  },
  cases,
};

fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('=== YOYO Relation Train Regression v0.5 ===');
console.log(`Hue applicability : ${hueAppCorrect}/${cases.length}`);
console.log(`Hue relation      : ${hueRelCorrect}/${hueRelTotal} reliable cases`);
console.log(`Tone relation     : ${toneCorrect}/${cases.length}`);
console.log(`All               : ${allCorrect}/${cases.length}`);
console.log('⚠ TRAIN FIT ONLY — not independent validation.');
console.log(`Output: ${OUTPUT}`);
