'use strict';

const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const predictionPath = arg('--predictions');
const humanPath = arg('--human') || path.join(__dirname, 'retired_v0_7_validation_human.json');
const outPath = arg('--output') || path.join(__dirname, 'v0_8_failure_taxonomy_chroma.json');

if (!predictionPath) {
  console.error('Usage: node build_v0_8_failure_taxonomy_chroma.js --predictions <frozen-v0.7-predictions.json>');
  process.exit(2);
}

const human = JSON.parse(fs.readFileSync(humanPath, 'utf8'));
const raw = JSON.parse(fs.readFileSync(predictionPath, 'utf8'));

const VALID = new Set(['similar', 'similar_or_partial', 'different']);

function pickPrediction(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const direct = [
    obj.chroma_prediction,
    obj.predicted_chroma_relation,
    obj.prediction && obj.prediction.chroma_relation,
    obj.predicted && obj.predicted.chroma_relation,
    obj.candidate_prediction && obj.candidate_prediction.chroma_relation,
    obj.candidate && obj.candidate.chroma_relation,
    obj.output && obj.output.chroma_relation,
    obj.prediction && obj.prediction.chroma_prediction
  ].find(x => typeof x === 'string');

  return VALID.has(direct) ? direct : null;
}

function collectRecords(node, out = []) {
  if (!node) return out;

  if (Array.isArray(node)) {
    for (const x of node) collectRecords(x, out);
    return out;
  }

  if (typeof node !== 'object') return out;

  const caseId = typeof node.case_id === 'string' ? node.case_id : null;
  const pairKey = typeof node.pair_key === 'string' ? node.pair_key : null;
  const pred = pickPrediction(node);

  if ((caseId || pairKey) && pred) {
    out.push({
      case_id: caseId,
      pair_key: pairKey,
      predicted_chroma_relation: pred
    });
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectRecords(v, out);
  }
  return out;
}

const records = collectRecords(raw);
const byCase = new Map();
const byPair = new Map();

for (const r of records) {
  if (r.case_id && !byCase.has(r.case_id)) byCase.set(r.case_id, r);
  if (r.pair_key && !byPair.has(r.pair_key)) byPair.set(r.pair_key, r);
}

function severity(label) {
  return ({ similar: 0, similar_or_partial: 1, different: 2 })[label];
}

function classify(humanLabel, predictedLabel) {
  if (humanLabel === predictedLabel) return 'MATCH';

  const h = severity(humanLabel);
  const p = severity(predictedLabel);

  if (p > h) return 'CHROMA_OVER_SEPARATION';
  if (p < h) return 'CHROMA_UNDER_SEPARATION';
  return 'CHROMA_CLASS_MISMATCH';
}

const rows = [];
const missing = [];

for (const c of human.cases) {
  const r = byCase.get(c.case_id) || byPair.get(c.pair_key);
  if (!r) {
    missing.push(c.case_id);
    continue;
  }

  const humanLabel = c.human_label.chroma_relation;
  const pred = r.predicted_chroma_relation;
  const failureClass = classify(humanLabel, pred);

  rows.push({
    case_id: c.case_id,
    pair_key: c.pair_key,
    retired_source_style: c.source_style,
    human_chroma_relation: humanLabel,
    frozen_v0_7_prediction: pred,
    result: failureClass,
    is_mismatch: failureClass !== 'MATCH',

    // These are identifiers for auditability only, NEVER rule conditions.
    audit_pair: {
      a_mode_id: c.a.mode_id,
      b_mode_id: c.b.mode_id,
      a_hex: c.a.hex,
      b_hex: c.b.hex
    }
  });
}

if (missing.length) {
  console.error(`BLOCKED: frozen prediction source is missing ${missing.length}/12 cases: ${missing.join(', ')}`);
  process.exit(3);
}

const mismatches = rows.filter(x => x.is_mismatch);
const counts = {};
for (const x of mismatches) counts[x.result] = (counts[x.result] || 0) + 1;

const generalizedQuestions = [
  {
    id: 'CHROMA_Q01_ABSOLUTE_LEVEL',
    status: 'FAILURE_QUESTION_ONLY',
    question: '人類對 perceived chroma 的差異判斷，是否同時受到兩端 absolute chroma level 影響，而不能只由 |C1-C2| 解釋？'
  },
  {
    id: 'CHROMA_Q02_LOW_CHROMA_ASYMMETRY',
    status: 'FAILURE_QUESTION_ONLY',
    question: '當其中一端接近 achromatic 時，相同的物理 chroma difference 是否會產生不同的感知分離程度？'
  },
  {
    id: 'CHROMA_Q03_PARTIAL_BAND',
    status: 'FAILURE_QUESTION_ONLY',
    question: 'similar_or_partial 是否需要作為真正的 uncertainty / transition band，而不是由兩端類別硬壓縮而成？'
  },
  {
    id: 'CHROMA_Q04_RELATIVE_TERM',
    status: 'FAILURE_QUESTION_ONLY',
    question: '相對 chroma 比例是否值得在 fresh Stage-A Train 中與 absolute chroma difference 做最小複雜度比較？'
  },
  {
    id: 'CHROMA_Q05_LIMITED_LIGHTNESS_INTERACTION',
    status: 'FAILURE_QUESTION_ONLY',
    question: '只有在 fresh data 顯示穩定 residual pattern 時，是否需要最多一個 Lightness×Chroma interaction term？'
  }
];

const output = {
  metadata: {
    name: 'YOYO v0.8 Chroma Failure Taxonomy from Retired v0.7 Validation',
    version: '0.8-stage-a-prep-1',
    status: 'RETROSPECTIVE_FAILURE_TAXONOMY_ONLY',
    source_validation_role: 'RETIRED_AFTER_FIRST_EVALUATION',
    source_prediction_role: 'FROZEN_V0_7_CANDIDATE_PREDICTIONS',
    tuning_authority: 'NONE',
    training_authority: 'NONE',
    independent_validation_authority: 'NONE',
    thresholds_generated: false,
    formula_selected: false,
    model_selected: false
  },
  source_files: {
    retired_human_validation: path.resolve(humanPath),
    frozen_prediction_artifact: path.resolve(predictionPath)
  },
  summary: {
    cases: rows.length,
    chroma_matches: rows.length - mismatches.length,
    chroma_mismatches: mismatches.length,
    failure_class_counts: counts
  },
  cases: rows,
  generalized_failure_questions: generalizedQuestions,
  next_stage: {
    status: 'PREPARE_FRESH_STAGE_A_TRAIN',
    target_cases: '12-16',
    authority_required: 'DIRECT_HUMAN_BLIND',
    restriction: 'Fresh pairs only; retired v0.7 cases cannot be used for tuning/model selection.'
  }
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

console.log('=== YOYO v0.8 Chroma Failure Taxonomy ===');
console.log(`Cases             : ${rows.length}`);
console.log(`Chroma mismatches : ${mismatches.length}`);
console.log(`Failure classes   : ${JSON.stringify(counts)}`);
console.log(`Thresholds made   : NO`);
console.log(`Formula selected  : NO`);
console.log(`Output            : ${outPath}`);
console.log('NEXT              : fresh 12–16 case Stage-A direct-human blind Train');
