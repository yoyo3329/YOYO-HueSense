'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const OUT = process.argv[3] || __dirname;

const VERSION = '0.8-stage-a-round1-train16';
const SELECTION_SEED = 'YOYO-v0.8-stage-a-round1-chroma-train16-fixed-seed-v1';

const EXCLUDE_NAME_PATTERNS = [
  /calibration.*\.json$/i,
  /holdout.*\.json$/i,
  /train.*human.*\.json$/i,
  /validation.*human.*\.json$/i,
  /gold.*train.*\.json$/i,
  /gold.*holdout.*\.json$/i,
  /human.*label.*\.json$/i,
  /independent_validation_report.*\.json$/i
];

const GRAPH_CANDIDATES = [
  'y2k_color_mvp_b3_hierarchy.json',
  'styles/y2k/artifacts/y2k_color_mvp_b3_hierarchy.json',
  'styles/y2k/artifacts/color_relation_graph.json',
  'y2k_color_relation_graph.json'
];

function sha256Text(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function sha256File(p) {
  return sha256Text(fs.readFileSync(p));
}
function stableFloat(key) {
  const h = sha256Text(SELECTION_SEED + '|' + key).slice(0, 13);
  return parseInt(h, 16) / 0x1fffffffffffff;
}
function pairKey(a, b) {
  return [a, b].sort().join('||');
}
function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules','.git'].includes(e.name)) continue;
      walk(p, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) {
      out.push(p);
    }
  }
  return out;
}

function findGraph() {
  for (const rel of GRAPH_CANDIDATES) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) {
      try {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(d.modes) && d.modes.length >= 40) return { path: p, data: d };
      } catch (_) {}
    }
  }

  const files = walk(ROOT);
  for (const p of files) {
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (
        Array.isArray(d.modes) &&
        d.modes.length >= 40 &&
        d.modes.every(x => x.mode_id)
      ) return { path: p, data: d };
    } catch (_) {}
  }
  throw new Error('Could not locate a B3 hierarchy / mode graph with >=40 modes.');
}

function extractMode(mode) {
  const physical = mode.physical || mode;
  const lch = physical.centroid_lch || mode.centroid_lch || physical.lch;
  const hex =
    physical.centroid_hex ||
    mode.centroid_hex ||
    (physical.representative_medoid && physical.representative_medoid.hex);

  if (!mode.mode_id || !lch || !hex) return null;
  const L = Number(lch.L), C = Number(lch.C);
  const H = lch.H == null ? null : Number(lch.H);
  if (!Number.isFinite(L) || !Number.isFinite(C) || (H !== null && !Number.isFinite(H))) return null;

  return {
    mode_id: mode.mode_id,
    hex,
    L,
    C,
    H
  };
}

function recursivePairs(node, fileContext, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const x of node) recursivePairs(x, fileContext, out);
    return;
  }
  if (typeof node !== 'object') return;

  let a = null, b = null;
  if (node.a && node.b && typeof node.a === 'object' && typeof node.b === 'object') {
    a = node.a.mode_id || node.a.id || null;
    b = node.b.mode_id || node.b.id || null;
  }
  if (!a && !b && typeof node.pair_key === 'string') {
    const parts = node.pair_key.split('||');
    if (parts.length === 2 && parts.every(x => /^mode_\d+$/i.test(x))) {
      a = parts[0]; b = parts[1];
    }
  }

  if (a && b && /^mode_\d+$/i.test(a) && /^mode_\d+$/i.test(b)) {
    out.add(pairKey(a, b));
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') recursivePairs(v, fileContext, out);
  }
}

function buildHistoricalExclusionRegistry() {
  const files = walk(ROOT)
    .filter(p => EXCLUDE_NAME_PATTERNS.some(rx => rx.test(path.basename(p))));

  const pairs = new Set();
  const sources = [];

  for (const p of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (_) { continue; }

    const before = pairs.size;
    recursivePairs(d, p, pairs);
    const added = pairs.size - before;
    if (added > 0) {
      sources.push({
        path: p,
        sha256: sha256File(p),
        pairs_added: added
      });
    }
  }

  return { pairs, sources };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const t = pos - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function hueDistance(a, b) {
  if (a == null || b == null) return 180;
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function hueChord(a, b) {
  const dh = hueDistance(a.H, b.H) * Math.PI / 180;
  return 2 * Math.sqrt(Math.max(0, a.C * b.C)) * Math.sin(dh / 2);
}

function pairFeatures(a, b) {
  return {
    dC: Math.abs(a.C - b.C),
    dL: Math.abs(a.L - b.L),
    meanC: (a.C + b.C) / 2,
    minC: Math.min(a.C, b.C),
    maxC: Math.max(a.C, b.C),
    hueChord: hueChord(a, b),
    hueDistance: hueDistance(a.H, b.H)
  };
}

function binForC(C, q33, q67) {
  if (C <= q33) return 'LOW';
  if (C <= q67) return 'MEDIUM';
  return 'HIGH';
}

function stratumFor(aBin, bBin) {
  const bins = [aBin, bBin].sort();
  const key = bins.join('_');
  if (key === 'LOW_LOW') return 'LOW_LOW';
  if (key === 'LOW_MEDIUM' || key === 'HIGH_LOW') return 'LOW_MIDHIGH';
  if (key === 'LOW_HIGH') return 'LOW_MIDHIGH';
  if (key === 'MEDIUM_MEDIUM') return 'MEDIUM_MEDIUM';
  if (key === 'HIGH_MEDIUM' || key === 'HIGH_HIGH') return 'MIDHIGH_HIGH';
  return null;
}

function normalizeFeatures(pairs) {
  const fields = ['dC','dL','meanC','minC','maxC','hueChord'];
  const mins = {}, maxs = {};
  for (const f of fields) {
    mins[f] = Math.min(...pairs.map(p => p.features[f]));
    maxs[f] = Math.max(...pairs.map(p => p.features[f]));
  }
  for (const p of pairs) {
    p.vector = fields.map(f => {
      const lo = mins[f], hi = maxs[f], v = p.features[f];
      return hi === lo ? 0 : (v - lo) / (hi - lo);
    });
  }
}

function euclid(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function selectDiverse(candidates, n) {
  if (candidates.length < n) {
    throw new Error(`Not enough candidates in stratum: need ${n}, have ${candidates.length}`);
  }

  normalizeFeatures(candidates);

  // Start from the candidate nearest the physical-feature centroid,
  // tie-broken only by a fixed seed hash.
  const dim = candidates[0].vector.length;
  const centroid = Array(dim).fill(0);
  for (const p of candidates) for (let i = 0; i < dim; i++) centroid[i] += p.vector[i];
  for (let i = 0; i < dim; i++) centroid[i] /= candidates.length;

  let first = [...candidates].sort((x, y) => {
    const dx = euclid(x.vector, centroid), dy = euclid(y.vector, centroid);
    return dx - dy || stableFloat(x.pair_key) - stableFloat(y.pair_key);
  })[0];

  const selected = [first];
  const usedModes = new Map();
  for (const m of [first.a.mode_id, first.b.mode_id]) usedModes.set(m, 1);

  while (selected.length < n) {
    let best = null, bestScore = -Infinity;

    for (const p of candidates) {
      if (selected.includes(p)) continue;
      const minDist = Math.min(...selected.map(s => euclid(p.vector, s.vector)));
      const reuse =
        (usedModes.get(p.a.mode_id) || 0) +
        (usedModes.get(p.b.mode_id) || 0);

      // Diversity dominates; mode reuse is softly penalized to avoid one color flooding the set.
      const score = minDist - 0.12 * reuse + 0.000001 * stableFloat(p.pair_key);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    if (!best) throw new Error('Diverse selection failed unexpectedly.');
    selected.push(best);
    for (const m of [best.a.mode_id, best.b.mode_id]) {
      usedModes.set(m, (usedModes.get(m) || 0) + 1);
    }
  }

  return selected;
}

const graph = findGraph();
const modes = graph.data.modes.map(extractMode).filter(Boolean);
if (modes.length < 40) throw new Error(`Only ${modes.length} usable modes found.`);

const chromas = modes.map(x => x.C).sort((a,b) => a-b);
const q33 = quantile(chromas, 1/3);
const q67 = quantile(chromas, 2/3);

for (const m of modes) m.chroma_bin = binForC(m.C, q33, q67);

const historical = buildHistoricalExclusionRegistry();

const all = [];
for (let i = 0; i < modes.length; i++) {
  for (let j = i + 1; j < modes.length; j++) {
    const a = modes[i], b = modes[j];
    const key = pairKey(a.mode_id, b.mode_id);
    if (historical.pairs.has(key)) continue;

    const stratum = stratumFor(a.chroma_bin, b.chroma_bin);
    if (!stratum) continue;

    all.push({
      pair_key: key,
      a,
      b,
      stratum,
      features: pairFeatures(a, b)
    });
  }
}

const targetPerStratum = {
  LOW_LOW: 4,
  LOW_MIDHIGH: 4,
  MEDIUM_MEDIUM: 4,
  MIDHIGH_HIGH: 4
};

const selected = [];
const selectionAudit = {};
for (const [stratum, n] of Object.entries(targetPerStratum)) {
  const pool = all.filter(x => x.stratum === stratum);
  const chosen = selectDiverse(pool, n);
  selected.push(...chosen);
  selectionAudit[stratum] = {
    fresh_pool_count: pool.length,
    selected_pair_keys: chosen.map(x => x.pair_key)
  };
}

// Stable blind order independent of labels/predictions.
selected.sort((x, y) => stableFloat('blind|' + x.pair_key) - stableFloat('blind|' + y.pair_key));

const cases = selected.map((p, i) => {
  const flip = stableFloat('orientation|' + p.pair_key) >= 0.5;
  const A = flip ? p.b : p.a;
  const B = flip ? p.a : p.b;

  return {
    case_id: `V08_STAGEA_TRAIN_${String(i + 1).padStart(3, '0')}`,
    role: 'TRAIN_CALIBRATION',
    source_style: 'Y2K',
    pair_key: p.pair_key,
    stratum: p.stratum,

    // Hidden from human UI, retained for audit/fitting after labels.
    a: {
      mode_id: A.mode_id,
      hex: A.hex,
      physical: { L: A.L, C: A.C, H: A.H },
      chroma_bin: A.chroma_bin
    },
    b: {
      mode_id: B.mode_id,
      hex: B.hex,
      physical: { L: B.L, C: B.C, H: B.H },
      chroma_bin: B.chroma_bin
    },

    selection_features: p.features
  };
});

const queue = {
  metadata: {
    name: 'YOYO v0.8 Stage A Round 1 Fresh Chroma Train Queue',
    version: VERSION,
    role: 'TRAIN_CALIBRATION',
    authority_target: 'DIRECT_HUMAN_BLIND',
    case_count: cases.length,
    selection_seed: SELECTION_SEED,
    source_graph: path.resolve(graph.path),
    source_graph_sha256: sha256File(graph.path),
    historical_labels_used_for_selection: false,
    historical_pairs_used_only_as_exclusion_keys: true,
    retired_v0_7_validation_labels_used_for_selection: false,
    candidate_predictions_used_for_selection: false,
    algorithm_outputs_hidden_in_human_ui: true,
    physical_numeric_features_hidden_in_human_ui: true,
    independent_validation_materialized: false,
    note: 'Selection is based only on fresh-pair exclusion plus physical feature diversity. No retired labels or candidate predictions influence selection.'
  },
  chroma_bins: {
    method: 'mode-level empirical terciles from all usable B3 physical modes',
    q33,
    q67
  },
  historical_exclusion: {
    unique_pair_count: historical.pairs.size,
    source_files: historical.sources
  },
  selection_audit: selectionAudit,
  cases
};

fs.mkdirSync(OUT, { recursive: true });

const queuePath = path.join(OUT, 'v0_8_stage_a_train_queue.json');
fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');

const queueHash = sha256File(queuePath);
const exclusionHash = sha256Text([...historical.pairs].sort().join('\n'));

const commitment = {
  metadata: {
    name: 'YOYO v0.8 Stage A Round 1 Train Queue Commitment',
    version: VERSION,
    committed_before_human_labels: true
  },
  queue_sha256: queueHash,
  source_graph_sha256: sha256File(graph.path),
  historical_exclusion_pairset_sha256: exclusionHash,
  case_count: cases.length,
  pair_keys_in_blind_order: cases.map(x => x.pair_key),
  policy: {
    validation_not_materialized: true,
    retired_v0_7_validation_taxonomy_only: true,
    hue_frozen: true,
    hue_applicability_frozen: true,
    lightness_baseline_frozen: true,
    chroma_primary_redesign_axis: true
  }
};
fs.writeFileSync(
  path.join(OUT, 'v0_8_stage_a_train_commitment.json'),
  JSON.stringify(commitment, null, 2) + '\n'
);

const summary = {
  status: 'PREPARED_WAITING_DIRECT_HUMAN_BLIND_TRAIN',
  cases: cases.length,
  strata: Object.fromEntries(
    Object.keys(targetPerStratum).map(s => [s, cases.filter(c => c.stratum === s).length])
  ),
  historical_pairs_excluded: historical.pairs.size,
  fresh_candidate_pairs_after_exclusion: all.length,
  queue_sha256: queueHash,
  next: 'Open v0_8_stage_a_chroma_blind_lab.html, label all 16 cases, export JSON.'
};
fs.writeFileSync(
  path.join(OUT, 'v0_8_stage_a_train_state.json'),
  JSON.stringify(summary, null, 2) + '\n'
);

console.log('=== YOYO v0.8 Stage A Fresh Chroma Train Queue ===');
console.log(`Usable B3 modes       : ${modes.length}`);
console.log(`Historical pairs excl.: ${historical.pairs.size}`);
console.log(`Fresh candidate pairs : ${all.length}`);
console.log(`Selected cases        : ${cases.length}`);
for (const s of Object.keys(targetPerStratum)) {
  console.log(`${s.padEnd(20)}: ${cases.filter(c => c.stratum === s).length}`);
}
console.log(`Queue SHA-256         : ${queueHash}`);
console.log('Status                : PREPARED_WAITING_DIRECT_HUMAN_BLIND_TRAIN');
