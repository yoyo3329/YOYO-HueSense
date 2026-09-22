#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TRAIN = path.join(__dirname, 'gold_train_candidate_v0_4.json');
const GRAPH = path.join(__dirname, 'y2k_color_relation_graph.json');
const OUTPUT = path.join(__dirname, 'relation_formula_calibration_v0_5.json');
const CONFIG = path.join(__dirname, 'relation_formula_candidate_config_v0_5.json');

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function pairKey(a, b) { return [a, b].sort().join('||'); }
function frange(start, end, step) {
  const out = [];
  for (let x = start; x <= end + step / 10; x += step) out.push(Number(x.toFixed(8)));
  return out;
}
function midpoint(a, b) { return (a + b) / 2; }
function median(values) {
  const s = [...values].sort((a,b)=>a-b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}
function round(v, d=8) {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** d;
  return Math.round((v + Number.EPSILON) * f) / f;
}

const train = read(TRAIN);
const graph = read(GRAPH);
const edgeMap = new Map(graph.edges.map(e => [e.pair_key, e]));

const rows = train.cases.map(c => {
  const key = pairKey(c.a.mode_id, c.b.mode_id);
  const edge = edgeMap.get(key);
  if (!edge) throw new Error(`Train pair missing from graph: ${key}`);
  return {
    case_id: c.case_id,
    confidence: c.human_retest_label.confidence,
    label: c.human_retest_label,
    physical: edge.physical_relations,
  };
});

// ------------------------------------------------------------------
// Hue applicability: choose a simple threshold in the largest perfect plateau.
// low_chroma if minC < threshold, otherwise reliable.
// ------------------------------------------------------------------
const hueAppCandidates = [];
for (const t of frange(0.005, 0.08, 0.0005)) {
  let correct = 0;
  for (const r of rows) {
    const pred = r.physical.min_chroma < t ? 'low_chroma' : 'reliable';
    if (pred === r.label.hue_applicability) correct += 1;
  }
  hueAppCandidates.push({ threshold: t, correct, total: rows.length });
}
const hueAppBest = Math.max(...hueAppCandidates.map(x => x.correct));
const hueAppPerfect = hueAppCandidates.filter(x => x.correct === hueAppBest);
const hueAppRange = {
  min: hueAppPerfect[0].threshold,
  max: hueAppPerfect[hueAppPerfect.length - 1].threshold,
};
// Prefer a round central threshold if it lies inside best plateau.
const hueAppSelected = 0.03 >= hueAppRange.min && 0.03 <= hueAppRange.max
  ? 0.03
  : round(midpoint(hueAppRange.min, hueAppRange.max), 4);

// ------------------------------------------------------------------
// Hue relation only on reliable labels.
// same/adjacent if deltaH <= threshold.
// ------------------------------------------------------------------
const reliableRows = rows.filter(r => r.label.hue_applicability === 'reliable');
const hueRelCandidates = [];
for (const t of frange(5, 120, 0.5)) {
  let correct = 0;
  for (const r of reliableRows) {
    const pred = r.physical.circular_delta_H_degrees <= t ? 'same_or_adjacent' : 'different';
    if (pred === r.label.hue_relation) correct += 1;
  }
  hueRelCandidates.push({ threshold: t, correct, total: reliableRows.length });
}
const hueRelBest = Math.max(...hueRelCandidates.map(x => x.correct));
const hueRelPerfect = hueRelCandidates.filter(x => x.correct === hueRelBest);
const hueRelRange = {
  min: hueRelPerfect[0].threshold,
  max: hueRelPerfect[hueRelPerfect.length - 1].threshold,
};
const hueRelSelected = 40 >= hueRelRange.min && 40 <= hueRelRange.max
  ? 40
  : round(midpoint(hueRelRange.min, hueRelRange.max), 1);

// ------------------------------------------------------------------
// Tone: transparent two-stage model.
// 1) similar if both deltaL and deltaC are small.
// 2) otherwise separation = dL + k*sqrt(dL*dC)
//    partial if separation < threshold, otherwise different.
// Search a coarse grid and choose a central point from the perfect-fit plateau.
// This is TRAIN FIT ONLY; no independent holdout exists yet.
// ------------------------------------------------------------------
const toneCandidates = [];
for (const simL of frange(0.04, 0.08, 0.005)) {
  for (const simC of frange(0.025, 0.04, 0.0025)) {
    for (const k of frange(2.0, 6.0, 0.25)) {
      for (const diffT of frange(0.40, 0.70, 0.01)) {
        let correct = 0;
        const preds = [];
        for (const r of rows) {
          const dL = r.physical.delta_L;
          const dC = r.physical.delta_C;
          const separation = dL + k * Math.sqrt(Math.max(0, dL * dC));
          let pred;
          if (dL <= simL && dC <= simC) pred = 'similar';
          else if (separation >= diffT) pred = 'different';
          else pred = 'similar_or_partial';
          if (pred === r.label.tone_relation) correct += 1;
          preds.push(pred);
        }
        toneCandidates.push({ simL, simC, k, diffT, correct, total: rows.length });
      }
    }
  }
}
const toneBest = Math.max(...toneCandidates.map(x => x.correct));
const toneBestSet = toneCandidates.filter(x => x.correct === toneBest);
const toneMedian = {
  simL: median(toneBestSet.map(x => x.simL)),
  simC: median(toneBestSet.map(x => x.simC)),
  k: median(toneBestSet.map(x => x.k)),
  diffT: median(toneBestSet.map(x => x.diffT)),
};

// Use round values close to plateau median if they retain best fit.
const tonePreferred = { simL: 0.06, simC: 0.033, k: 4.0, diffT: 0.54 };
function toneCorrect(params) {
  let correct = 0;
  for (const r of rows) {
    const dL = r.physical.delta_L;
    const dC = r.physical.delta_C;
    const separation = dL + params.k * Math.sqrt(Math.max(0, dL * dC));
    let pred;
    if (dL <= params.simL && dC <= params.simC) pred = 'similar';
    else if (separation >= params.diffT) pred = 'different';
    else pred = 'similar_or_partial';
    if (pred === r.label.tone_relation) correct += 1;
  }
  return correct;
}
const selectedTone = toneCorrect(tonePreferred) === toneBest
  ? tonePreferred
  : {
      simL: round(toneMedian.simL, 4),
      simC: round(toneMedian.simC, 4),
      k: round(toneMedian.k, 2),
      diffT: round(toneMedian.diffT, 3),
    };

const config = {
  metadata: {
    name: 'YOYO Relation Formula Candidate Config',
    version: '0.5.0-candidate',
    status: 'TRAIN_FIT_ONLY',
    calibration_source: 'gold_train_candidate_v0_4.json',
    calibration_case_count: rows.length,
    independent_holdout_count: 0,
    production_gate_eligible: false,
    warning: 'Do not claim validated human-perception accuracy until independent GOLD_HOLDOUT and cross-style checks exist.',
  },
  hue: {
    min_chroma_reliable: hueAppSelected,
    same_or_adjacent_max_delta_h_degrees: hueRelSelected,
  },
  tone: {
    similar_max_delta_l: selectedTone.simL,
    similar_max_delta_c: selectedTone.simC,
    interaction_weight: selectedTone.k,
    different_threshold: selectedTone.diffT,
    formula: 'deltaL + interactionWeight * sqrt(deltaL * deltaC)',
  },
};

const report = {
  metadata: {
    name: 'YOYO Relation Formula Calibration Report',
    version: '0.5.0',
    status: 'TRAIN_FIT_ONLY',
    source_train: path.basename(TRAIN),
    source_graph: path.basename(GRAPH),
    train_case_count: rows.length,
    independent_holdout_count: 0,
    production_gate_eligible: false,
  },
  hue_applicability: {
    best_correct: hueAppBest,
    total: rows.length,
    best_threshold_plateau: hueAppRange,
    selected_threshold: hueAppSelected,
  },
  hue_relation_reliable_only: {
    best_correct: hueRelBest,
    total: reliableRows.length,
    best_threshold_plateau_degrees: hueRelRange,
    selected_threshold_degrees: hueRelSelected,
  },
  tone_relation: {
    best_correct: toneBest,
    total: rows.length,
    perfect_or_best_candidate_count: toneBestSet.length,
    best_parameter_ranges: {
      similar_max_delta_l: { min: Math.min(...toneBestSet.map(x=>x.simL)), max: Math.max(...toneBestSet.map(x=>x.simL)) },
      similar_max_delta_c: { min: Math.min(...toneBestSet.map(x=>x.simC)), max: Math.max(...toneBestSet.map(x=>x.simC)) },
      interaction_weight: { min: Math.min(...toneBestSet.map(x=>x.k)), max: Math.max(...toneBestSet.map(x=>x.k)) },
      different_threshold: { min: Math.min(...toneBestSet.map(x=>x.diffT)), max: Math.max(...toneBestSet.map(x=>x.diffT)) },
    },
    plateau_median: toneMedian,
    selected: selectedTone,
    selected_correct: toneCorrect(selectedTone),
    interpretation: 'A broad best-fit plateau is preferred over tuning to a single razor-thin parameter combination.',
  },
  selected_config: config,
  next_requirement: 'Independent GOLD_HOLDOUT before any validation or production claim.',
};

fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf8');
fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('=== YOYO Relation Formula Calibration v0.5 ===');
console.log(`Train cases              : ${rows.length}`);
console.log(`Hue applicability        : ${hueAppBest}/${rows.length}`);
console.log(`  plateau                : ${hueAppRange.min} .. ${hueAppRange.max}`);
console.log(`  selected               : ${hueAppSelected}`);
console.log(`Reliable Hue relation    : ${hueRelBest}/${reliableRows.length}`);
console.log(`  plateau (degrees)      : ${hueRelRange.min} .. ${hueRelRange.max}`);
console.log(`  selected               : ${hueRelSelected}°`);
console.log(`Tone relation train fit  : ${toneCorrect(selectedTone)}/${rows.length}`);
console.log(`  best grid candidates   : ${toneBestSet.length}`);
console.log(`  selected               : L<=${selectedTone.simL}, C<=${selectedTone.simC}, k=${selectedTone.k}, diff>=${selectedTone.diffT}`);
console.log('');
console.log('⚠ TRAIN FIT ONLY — independent GOLD_HOLDOUT = 0');
console.log(`Report: ${OUTPUT}`);
console.log(`Config: ${CONFIG}`);
