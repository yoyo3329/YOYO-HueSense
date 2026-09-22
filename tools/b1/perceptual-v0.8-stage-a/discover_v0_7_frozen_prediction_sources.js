'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const OUTPUT = process.argv[3] || path.join(__dirname, 'v0_7_prediction_source_discovery.json');
const HUMAN_FILE = path.resolve(__dirname, 'retired_v0_7_validation_human.json');

const validation = JSON.parse(fs.readFileSync(HUMAN_FILE, 'utf8'));
const caseIds = validation.cases.map(x => x.case_id);
const pairKeys = validation.cases.map(x => x.pair_key);

const ALLOWED_EXT = new Set(['.json', '.js', '.txt', '.log', '.md']);
const SKIP_DIR = new Set(['node_modules', '.git', 'vendor', 'b1_cache']);
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return out; }

  for (const e of entries) {
    const p = path.join(dir, e.name);

    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(p, out);
      continue;
    }

    if (!e.isFile()) continue;
    if (!ALLOWED_EXT.has(path.extname(e.name).toLowerCase())) continue;

    try {
      const st = fs.statSync(p);
      if (st.size > MAX_FILE_BYTES) continue;
    } catch (_) { continue; }

    out.push(p);
  }
  return out;
}

function scoreText(text) {
  const idHits = caseIds.filter(x => text.includes(x));
  const pairHits = pairKeys.filter(x => text.includes(x));
  const lower = text.toLowerCase();

  const predictionTerms = [
    'prediction', 'predicted', 'candidate_prediction',
    'chroma_prediction', 'chroma_relation',
    'validation_score', 'candidate_version',
    'frozen_candidate', 'candidate_config'
  ].filter(x => lower.includes(x));

  return {
    case_id_hits: idHits.length,
    pair_key_hits: pairHits.length,
    prediction_terms: predictionTerms
  };
}

const files = walk(ROOT);
const candidates = [];

for (const file of files) {
  const resolved = path.resolve(file);
  if (resolved === HUMAN_FILE) continue;
  if (resolved.startsWith(path.resolve(__dirname) + path.sep) &&
      /v0_7_prediction_source_discovery|failure_taxonomy|stage_a_state/i.test(path.basename(file))) {
    continue;
  }

  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (_) { continue; }

  const s = scoreText(text);
  if (s.case_id_hits >= 3 || s.pair_key_hits >= 3) {
    candidates.push({
      path: resolved,
      ...s,
      likely_frozen_prediction_source:
        s.case_id_hits >= 10 &&
        s.prediction_terms.length >= 2
    });
  }
}

candidates.sort((a, b) =>
  Number(b.likely_frozen_prediction_source) - Number(a.likely_frozen_prediction_source) ||
  b.case_id_hits - a.case_id_hits ||
  b.pair_key_hits - a.pair_key_hits
);

const report = {
  metadata: {
    name: 'YOYO v0.7 Frozen Prediction Source Discovery',
    role: 'DISCOVERY_ONLY',
    does_not_modify_source_files: true,
    does_not_generate_thresholds: true
  },
  root_scanned: path.resolve(ROOT),
  retired_validation_case_count: caseIds.length,
  candidate_files: candidates,
  likely_source_count: candidates.filter(x => x.likely_frozen_prediction_source).length,
  next_action:
    candidates.filter(x => x.likely_frozen_prediction_source).length === 1
      ? 'RUN_TAXONOMY_BUILDER_WITH_THE_SINGLE_LIKELY_SOURCE'
      : 'REVIEW_CANDIDATE_FILES_AND_SELECT_THE_ACTUAL_FROZEN_V0_7_PREDICTION_ARTIFACT'
};

fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');

console.log('=== v0.7 Frozen Prediction Source Discovery ===');
console.log(`Root scanned       : ${report.root_scanned}`);
console.log(`Candidate files    : ${candidates.length}`);
console.log(`Likely sources     : ${report.likely_source_count}`);
for (const c of candidates.slice(0, 12)) {
  console.log(
    `${c.likely_frozen_prediction_source ? '[LIKELY]' : '[maybe] '} ` +
    `${c.case_id_hits}/12 case IDs | ${c.prediction_terms.join(', ') || 'no prediction terms'} | ${c.path}`
  );
}
console.log(`Output             : ${OUTPUT}`);
console.log(`NEXT               : ${report.next_action}`);
