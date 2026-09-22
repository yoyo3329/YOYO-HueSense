'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const OUT = process.argv[3] || __dirname;
const PILOT_EXCL = path.join(__dirname, 'v0_8_round1_pilot_exclusion_pairs.json');

const VERSION = '0.8.1-stage-a-controlled-train16';
const SELECTION_SEED = 'YOYO-v0.8.1-controlled-selection-v1';
const PRESENTATION_SEED = 'YOYO-v0.8.1-controlled-presentation-v1';
const SURROUND_HEX = '#777777';
const INTER_STIMULUS_MS = 600;
const INITIAL_ADAPTATION_MS = 5000;

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
    if (!fs.existsSync(p)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(d.modes) && d.modes.length >= 40) return { path: p, data: d };
    } catch (_) {}
  }

  for (const p of walk(ROOT)) {
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(d.modes) && d.modes.length >= 40 && d.modes.every(x => x.mode_id)) {
        return { path: p, data: d };
      }
    } catch (_) {}
  }
  throw new Error('Could not locate usable B3 mode graph.');
}

function extractMode(mode) {
  const physical = mode.physical || mode;
  const lch = physical.centroid_lch || mode.centroid_lch || physical.lch;
  const hex =
    physical.centroid_hex ||
    mode.centroid_hex ||
    (physical.representative_medoid && physical.representative_medoid.hex);

  if (!mode.mode_id || !lch || !hex) return null;

  const L = Number(lch.L);
  const C = Number(lch.C);
  const H = lch.H == null ? null : Number(lch.H);
  if (!Number.isFinite(L) || !Number.isFinite(C) || (H !== null && !Number.isFinite(H))) return null;

  return { mode_id: mode.mode_id, hex, L, C, H };
}

function oklchToLinearSRGB(L, C, H) {
  const h = (H == null ? 0 : H) * Math.PI / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  };
}

function isSRGBSafe(mode) {
  const rgb = oklchToLinearSRGB(mode.L, mode.C, mode.H);
  const eps = 1e-7;
  return (
    rgb.r >= -eps && rgb.r <= 1 + eps &&
    rgb.g >= -eps && rgb.g <= 1 + eps &&
    rgb.b >= -eps && rgb.b <= 1 + eps
  );
}

function recursivePairs(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const x of node) recursivePairs(x, out);
    return;
  }
  if (typeof node !== 'object') return;

  let a = null, b = null;
  if (node.a && node.b && typeof node.a === 'object' && typeof node.b === 'object') {
    a = node.a.mode_id || node.a.id || null;
    b = node.b.mode_id || node.b.id || null;
  }
  if ((!a || !b) && typeof node.pair_key === 'string') {
    const parts = node.pair_key.split('||');
    if (parts.length === 2 && parts.every(x => /^mode_\d+$/i.test(x))) {
      a = parts[0]; b = parts[1];
    }
  }

  if (a && b && /^mode_\d+$/i.test(a) && /^mode_\d+$/i.test(b)) {
    out.add(pairKey(a, b));
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') recursivePairs(v, out);
  }
}

function buildHistoricalExclusions() {
  const files = walk(ROOT)
    .filter(p => EXCLUDE_NAME_PATTERNS.some(rx => rx.test(path.basename(p))));

  const pairs = new Set();
  const sources = [];

  for (const p of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (_) { continue; }

    const before = pairs.size;
    recursivePairs(d, pairs);
    const added = pairs.size - before;

    if (added > 0) {
      sources.push({ path: p, sha256: sha256File(p), pairs_added: added });
    }
  }

  // Explicitly exclude the 16 already-seen pilot pairs from this chat run.
  const pilot = JSON.parse(fs.readFileSync(PILOT_EXCL, 'utf8'));
  for (const k of pilot.pair_keys || []) pairs.add(k);

  sources.push({
    path: path.resolve(PILOT_EXCL),
    sha256: sha256File(PILOT_EXCL),
    pairs_added: (pilot.pair_keys || []).length,
    role: 'PILOT_PAIR_EXCLUSION_ONLY'
  });

  return { pairs, sources };
}

function quantile(sorted, q) {
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
function features(a, b) {
  return {
    dC: Math.abs(a.C - b.C),
    dL: Math.abs(a.L - b.L),
    meanC: (a.C + b.C) / 2,
    minC: Math.min(a.C, b.C),
    maxC: Math.max(a.C, b.C),
    hueChord: hueChord(a, b)
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
  if (key === 'LOW_MEDIUM' || key === 'LOW_HIGH') return 'LOW_MIDHIGH';
  if (key === 'MEDIUM_MEDIUM') return 'MEDIUM_MEDIUM';
  if (key === 'HIGH_MEDIUM' || key === 'HIGH_HIGH') return 'MIDHIGH_HIGH';
  return null;
}

function seed32(text) {
  return parseInt(sha256Text(text).slice(0, 8), 16) >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fisherYates(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(pool) {
  const fields = ['dC','dL','meanC','minC','maxC','hueChord'];
  const mins = {}, maxs = {};
  for (const f of fields) {
    mins[f] = Math.min(...pool.map(p => p.features[f]));
    maxs[f] = Math.max(...pool.map(p => p.features[f]));
  }
  for (const p of pool) {
    p.vector = fields.map(f => {
      const lo = mins[f], hi = maxs[f];
      return hi === lo ? 0 : (p.features[f] - lo) / (hi - lo);
    });
  }
}
function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
function selectDiverse(pool, n, seedLabel) {
  if (pool.length < n) throw new Error(`Need ${n}, only ${pool.length} candidates in ${seedLabel}`);
  normalize(pool);
  const rng = mulberry32(seed32(SELECTION_SEED + '|' + seedLabel));

  const dim = pool[0].vector.length;
  const centroid = Array(dim).fill(0);
  for (const p of pool) for (let i = 0; i < dim; i++) centroid[i] += p.vector[i];
  for (let i = 0; i < dim; i++) centroid[i] /= pool.length;

  const startCandidates = [...pool].sort((x, y) => dist(x.vector, centroid) - dist(y.vector, centroid));
  const near = startCandidates.slice(0, Math.min(5, startCandidates.length));
  let first = near[Math.floor(rng() * near.length)];

  const selected = [first];
  const usedModes = new Map();
  for (const m of [first.a.mode_id, first.b.mode_id]) usedModes.set(m, 1);

  while (selected.length < n) {
    let best = null, bestScore = -Infinity;
    for (const p of pool) {
      if (selected.includes(p)) continue;
      const minDist = Math.min(...selected.map(s => dist(p.vector, s.vector)));
      const reuse = (usedModes.get(p.a.mode_id) || 0) + (usedModes.get(p.b.mode_id) || 0);
      const score = minDist - 0.12 * reuse + rng() * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    selected.push(best);
    for (const m of [best.a.mode_id, best.b.mode_id]) usedModes.set(m, (usedModes.get(m) || 0) + 1);
  }
  return selected;
}

function maxRun(arr) {
  let max = 0, run = 0, prev = null;
  for (const x of arr) {
    if (x.stratum === prev) run++;
    else { prev = x.stratum; run = 1; }
    max = Math.max(max, run);
  }
  return max;
}

function buildPresentationOrder(selected) {
  // Fisher-Yates is used, but we deterministically retry with seed variants
  // until the pre-registered sequence guard (max same stratum run <= 2) passes.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const rng = mulberry32(seed32(PRESENTATION_SEED + '|order|' + attempt));
    const shuffled = fisherYates(selected, rng);
    if (maxRun(shuffled) <= 2) {
      return { order: shuffled, attempt };
    }
  }
  throw new Error('Could not satisfy presentation sequence guard.');
}

const graph = findGraph();
const modes = graph.data.modes.map(extractMode).filter(Boolean);
if (modes.length < 40) throw new Error(`Only ${modes.length} usable modes found.`);

for (const m of modes) {
  m.srgb_safe = isSRGBSafe(m);
}
const gamutSafeModes = modes.filter(m => m.srgb_safe);
if (gamutSafeModes.length < 40) throw new Error('Too few sRGB-safe modes for controlled Train set.');

const chromas = gamutSafeModes.map(x => x.C).sort((a,b) => a-b);
const q33 = quantile(chromas, 1/3);
const q67 = quantile(chromas, 2/3);
for (const m of gamutSafeModes) m.chroma_bin = binForC(m.C, q33, q67);

const historical = buildHistoricalExclusions();

const all = [];
for (let i = 0; i < gamutSafeModes.length; i++) {
  for (let j = i + 1; j < gamutSafeModes.length; j++) {
    const a = gamutSafeModes[i], b = gamutSafeModes[j];
    const key = pairKey(a.mode_id, b.mode_id);
    if (historical.pairs.has(key)) continue;

    const stratum = stratumFor(a.chroma_bin, b.chroma_bin);
    if (!stratum) continue;

    all.push({ pair_key: key, a, b, stratum, features: features(a, b) });
  }
}

const target = {
  LOW_LOW: 4,
  LOW_MIDHIGH: 4,
  MEDIUM_MEDIUM: 4,
  MIDHIGH_HIGH: 4
};

const selected = [];
const selectionAudit = {};
for (const [stratum, n] of Object.entries(target)) {
  const pool = all.filter(x => x.stratum === stratum);
  const chosen = selectDiverse(pool, n, stratum);
  selected.push(...chosen);
  selectionAudit[stratum] = {
    fresh_pool_count: pool.length,
    selected_pair_keys: chosen.map(x => x.pair_key)
  };
}

// Create committed presentation order using seeded Fisher-Yates + sequence guard.
const presentation = buildPresentationOrder(selected);
const sideRng = mulberry32(seed32(PRESENTATION_SEED + '|sides'));

const cases = presentation.order.map((p, i) => {
  const flip = sideRng() >= 0.5;
  const left = flip ? p.b : p.a;
  const right = flip ? p.a : p.b;

  return {
    case_id: `V081_CTRL_TRAIN_${String(i + 1).padStart(3, '0')}`,
    role: 'TRAIN_CALIBRATION',
    source_style: 'Y2K',
    pair_key: p.pair_key,
    stratum: p.stratum,

    left: {
      mode_id: left.mode_id,
      hex: left.hex,
      physical: { L: left.L, C: left.C, H: left.H },
      chroma_bin: left.chroma_bin,
      srgb_safe: left.srgb_safe
    },
    right: {
      mode_id: right.mode_id,
      hex: right.hex,
      physical: { L: right.L, C: right.C, H: right.H },
      chroma_bin: right.chroma_bin,
      srgb_safe: right.srgb_safe
    },

    selection_features: p.features,
    presentation: {
      position: i + 1,
      side_assignment_randomized: true
    }
  };
});

fs.mkdirSync(OUT, { recursive: true });

const queue = {
  metadata: {
    name: 'YOYO v0.8.1 Stage A Controlled Fresh Chroma Train Queue',
    version: VERSION,
    role: 'TRAIN_CALIBRATION',
    authority_target: 'DIRECT_HUMAN_BLIND_CONTROLLED_PRESENTATION',
    case_count: cases.length,

    selection_seed: SELECTION_SEED,
    presentation_seed: PRESENTATION_SEED,
    presentation_shuffle: 'SEEDED_FISHER_YATES_WITH_SEQUENCE_GUARD',
    presentation_shuffle_attempt: presentation.attempt,
    max_same_stratum_run: maxRun(presentation.order),

    source_graph: path.resolve(graph.path),
    source_graph_sha256: sha256File(graph.path),

    historical_labels_used_for_selection: false,
    candidate_predictions_used_for_selection: false,
    historical_pairs_used_only_as_exclusion_keys: true,
    prior_pilot_pairs_explicitly_excluded: true,

    algorithm_outputs_hidden_in_human_ui: true,
    physical_numeric_features_hidden_in_human_ui: true,
    independent_validation_materialized: false
  },

  presentation_contract: {
    stimulus_color_space: 'sRGB',
    require_srgb_safe_original_oklch: true,
    neutral_surround_hex: SURROUND_HEX,
    neutral_surround_basis: 'approximately CIELAB L*=50 neutral gray in sRGB',
    initial_adaptation_ms: INITIAL_ADAPTATION_MS,
    inter_stimulus_ms: INTER_STIMULUS_MS,
    swatch_gap_px: 64,
    system_theme_override: true,
    no_shadow: true,
    no_gradient: true,
    no_colored_border: true,
    sequence_guard_max_same_stratum_run: 2,
    side_assignment_randomized_and_committed: true,
    optional_lightness_interference_flag: true
  },

  gamut_audit: {
    usable_modes_total: modes.length,
    srgb_safe_modes: gamutSafeModes.length,
    srgb_unsafe_modes: modes.length - gamutSafeModes.length,
    selected_cases_all_srgb_safe: cases.every(c => c.left.srgb_safe && c.right.srgb_safe)
  },

  chroma_bins: {
    method: 'mode-level empirical terciles over sRGB-safe usable B3 physical modes',
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

const queuePath = path.join(OUT, 'v0_8_1_controlled_train_queue.json');
fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');

const queueHash = sha256File(queuePath);
const pairsetHash = sha256Text([...historical.pairs].sort().join('\n'));

const manifest = {
  metadata: {
    name: 'YOYO v0.8.1 Controlled Presentation Manifest',
    version: VERSION,
    committed_before_human_labels: true
  },
  queue_sha256: queueHash,
  source_graph_sha256: sha256File(graph.path),
  historical_exclusion_pairset_sha256: pairsetHash,
  presentation_order: cases.map(c => ({
    position: c.presentation.position,
    case_id: c.case_id,
    pair_key: c.pair_key,
    left_mode_id: c.left.mode_id,
    right_mode_id: c.right.mode_id
  })),
  sequence_guard: {
    max_same_stratum_run_allowed: 2,
    observed_max_same_stratum_run: maxRun(presentation.order)
  },
  presentation_contract: queue.presentation_contract
};

fs.writeFileSync(
  path.join(OUT, 'v0_8_1_controlled_presentation_manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

const commitment = {
  metadata: {
    name: 'YOYO v0.8.1 Controlled Train Commitment',
    version: VERSION,
    committed_before_human_labels: true
  },
  queue_sha256: queueHash,
  presentation_manifest_sha256:
    sha256File(path.join(OUT, 'v0_8_1_controlled_presentation_manifest.json')),
  case_count: cases.length,
  pair_keys_in_presentation_order: cases.map(c => c.pair_key),
  policy: {
    retired_v0_7_validation_taxonomy_only: true,
    prior_uncontrolled_pilot_not_formal_freeze_evidence: true,
    validation_not_materialized: true,
    hue_frozen: true,
    hue_applicability_frozen: true,
    lightness_baseline_frozen: true,
    chroma_primary_redesign_axis: true
  }
};

fs.writeFileSync(
  path.join(OUT, 'v0_8_1_controlled_train_commitment.json'),
  JSON.stringify(commitment, null, 2) + '\n'
);

const state = {
  status: 'PREPARED_WAITING_DIRECT_HUMAN_BLIND_CONTROLLED_TRAIN',
  cases: cases.length,
  prior_pilot_pairs_excluded: true,
  gamut_audit: queue.gamut_audit,
  max_same_stratum_run: queue.metadata.max_same_stratum_run,
  queue_sha256: queueHash,
  next:
    'Open v0_8_1_controlled_chroma_blind_lab.html, keep normal browser zoom, label all 16 cases without AI, export JSON.'
};
fs.writeFileSync(
  path.join(OUT, 'v0_8_1_controlled_train_state.json'),
  JSON.stringify(state, null, 2) + '\n'
);

console.log('=== YOYO v0.8.1 Controlled Fresh Chroma Train16 ===');
console.log(`Usable B3 modes        : ${modes.length}`);
console.log(`sRGB-safe modes        : ${gamutSafeModes.length}`);
console.log(`Historical+pilot excl. : ${historical.pairs.size}`);
console.log(`Fresh candidate pairs  : ${all.length}`);
console.log(`Selected cases         : ${cases.length}`);
for (const s of Object.keys(target)) {
  console.log(`${s.padEnd(20)}: ${cases.filter(c => c.stratum === s).length}`);
}
console.log(`Max same-stratum run   : ${queue.metadata.max_same_stratum_run}`);
console.log(`Queue SHA-256          : ${queueHash}`);
console.log('Status                 : PREPARED_WAITING_DIRECT_HUMAN_BLIND_CONTROLLED_TRAIN');
