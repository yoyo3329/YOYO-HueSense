#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HUMAN = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'gold_holdout_human_v0_5.json');

const GRAPH = path.join(__dirname, 'y2k_color_relation_graph_v0_5_candidate.json');
const OUT = path.join(__dirname, 'gold_holdout_regression_v0_5_1.json');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
function read(p) {
  if (!fs.existsSync(p)) fail(`找不到檔案：${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function pairKey(a, b) {
  return [a, b].sort().join('||');
}

const human = read(HUMAN);
const graph = read(GRAPH);
const edgeMap = new Map((graph.edges || []).map(e => [e.pair_key, e]));

const rows = [];

let complete = 0;
let hardScorable = 0;
let highScorable = 0;
let mediumScorable = 0;
let lowConfidence = 0;
let ambiguous = 0;
let incomplete = 0;

let appCorrect = 0;
let toneCorrect = 0;
let hueReliableCorrect = 0;
let hueReliableTotal = 0;
let allCorrect = 0;

let highConfidenceContradictions = 0;
let mediumConfidenceContradictions = 0;

for (const c of human.cases || []) {
  const y = c.human_label;
  if (!y || !y.hue_applicability || !y.hue_relation || !y.tone_relation || !y.confidence) {
    incomplete++;
    rows.push({
      case_id: c.case_id,
      evaluation_status: 'INCOMPLETE',
      hard_score_included: false
    });
    continue;
  }

  complete++;

  const edge = edgeMap.get(pairKey(c.a.mode_id, c.b.mode_id));
  if (!edge) {
    rows.push({
      case_id: c.case_id,
      evaluation_status: 'EDGE_NOT_FOUND',
      hard_score_included: false
    });
    continue;
  }

  const p = edge.perceptual_relations_candidate_v0_5;

  const hasReview =
    y.hue_applicability === 'review' ||
    y.hue_relation === 'review' ||
    y.tone_relation === 'review';

  const isLowConfidence = y.confidence === 'low';

  if (hasReview) ambiguous++;
  if (isLowConfidence) lowConfidence++;

  const appPass = p.hue_applicability === y.hue_applicability;
  const tonePass = p.tone_relation === y.tone_relation;

  let huePass = null;
  if (y.hue_applicability === 'reliable') {
    huePass = p.hue_relation === y.hue_relation;
  } else if (y.hue_applicability === 'low_chroma') {
    huePass = p.hue_relation === 'not_applicable' && y.hue_relation === 'not_applicable';
  }

  const relationAllPass =
    appPass &&
    tonePass &&
    (huePass === null || huePass === true);

  // Boundary holdout rule:
  // REVIEW and low-confidence cases are diagnostic only, not hard failures.
  const hardIncluded = !hasReview && !isLowConfidence;

  if (hardIncluded) {
    hardScorable++;

    if (y.confidence === 'high') highScorable++;
    if (y.confidence === 'medium') mediumScorable++;

    if (appPass) appCorrect++;
    if (tonePass) toneCorrect++;

    if (y.hue_applicability === 'reliable') {
      hueReliableTotal++;
      if (huePass) hueReliableCorrect++;
    }

    if (relationAllPass) allCorrect++;

    if (!relationAllPass) {
      if (y.confidence === 'high') highConfidenceContradictions++;
      if (y.confidence === 'medium') mediumConfidenceContradictions++;
    }
  }

  let evaluationStatus;
  if (hasReview) {
    evaluationStatus = 'AMBIGUOUS_HUMAN_REVIEW';
  } else if (isLowConfidence) {
    evaluationStatus = 'LOW_CONFIDENCE_DIAGNOSTIC_ONLY';
  } else if (relationAllPass) {
    evaluationStatus = 'HARD_SCORE_PASS';
  } else {
    evaluationStatus = y.confidence === 'high'
      ? 'HIGH_CONFIDENCE_CONTRADICTION'
      : 'MEDIUM_CONFIDENCE_CONTRADICTION';
  }

  rows.push({
    case_id: c.case_id,
    pair_key: edge.pair_key,
    confidence: y.confidence,
    evaluation_status: evaluationStatus,
    hard_score_included: hardIncluded,
    human: y,
    predicted: {
      hue_applicability: p.hue_applicability,
      hue_relation: p.hue_relation,
      tone_relation: p.tone_relation
    },
    pass: {
      hue_applicability: appPass,
      hue_relation: huePass,
      tone_relation: tonePass,
      all_relevant_relations: relationAllPass
    }
  });
}

let sanityStatus;
if (hardScorable === 0) {
  sanityStatus = 'INCONCLUSIVE_NO_HARD_SCORABLE_CASES';
} else if (highConfidenceContradictions > 0) {
  sanityStatus = 'BOUNDARY_CONTRADICTION_FOUND';
} else if (mediumConfidenceContradictions > 0 || ambiguous > 0 || lowConfidence > 0) {
  sanityStatus = 'NO_HIGH_CONFIDENCE_CONTRADICTION_BUT_REVIEW_NEEDED';
} else {
  sanityStatus = 'NO_MAJOR_CONTRADICTION_IN_BOUNDARY_STRESS_SET';
}

const out = {
  metadata: {
    name: 'YOYO Boundary Stress Holdout Evaluation v0.5.1',
    version: '0.5.1',
    status: sanityStatus,
    validation_scope: 'Y2K_BOUNDARY_STRESS_ONLY',
    production_gate_eligible: false,
    universality_status: 'unvalidated',
    important_note:
      'The 9 cases were selected around candidate decision boundaries. This is a stress/sanity test, not an unbiased estimate of general accuracy.',
    scoring_policy: {
      review_labels: 'diagnostic_only_not_hard_failure',
      low_confidence_labels: 'diagnostic_only_not_hard_failure',
      high_and_medium_confidence_non_review: 'hard_score',
      high_confidence_disagreement: 'boundary_contradiction_requires_review',
      automatic_formula_retuning_from_holdout: false
    }
  },
  summary: {
    total_cases: (human.cases || []).length,
    complete,
    incomplete,
    hard_scorable: hardScorable,
    high_confidence_scorable: highScorable,
    medium_confidence_scorable: mediumScorable,
    low_confidence_diagnostic_only: lowConfidence,
    ambiguous_review_cases: ambiguous,
    hard_score: {
      hue_applicability: { correct: appCorrect, total: hardScorable },
      hue_relation_reliable: { correct: hueReliableCorrect, total: hueReliableTotal },
      tone: { correct: toneCorrect, total: hardScorable },
      all_relevant_relations: { correct: allCorrect, total: hardScorable }
    },
    contradictions: {
      high_confidence: highConfidenceContradictions,
      medium_confidence: mediumConfidenceContradictions
    },
    sanity_status: sanityStatus
  },
  rows
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('=== YOYO Boundary Stress Holdout v0.5.1 ===');
console.log(`Complete                       : ${complete}/${(human.cases || []).length}`);
console.log(`Hard scorable                  : ${hardScorable}`);
console.log(`Ambiguous REVIEW               : ${ambiguous}`);
console.log(`Low-confidence diagnostic only : ${lowConfidence}`);
console.log('');
console.log(`Hue applicability              : ${appCorrect}/${hardScorable}`);
console.log(`Hue relation (reliable only)   : ${hueReliableCorrect}/${hueReliableTotal}`);
console.log(`Tone                           : ${toneCorrect}/${hardScorable}`);
console.log(`All relevant relations         : ${allCorrect}/${hardScorable}`);
console.log('');
console.log(`High-confidence contradictions : ${highConfidenceContradictions}`);
console.log(`Medium-confidence contradictions: ${mediumConfidenceContradictions}`);
console.log(`Status                         : ${sanityStatus}`);
console.log('');
console.log('Production gate eligible       : false');
console.log('Universality status            : unvalidated');
console.log(`Output                         : ${OUT}`);
