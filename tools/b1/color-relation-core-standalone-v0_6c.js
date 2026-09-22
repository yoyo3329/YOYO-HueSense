'use strict';

/**
 * YOYO Color Relation Core v0.1.0
 *
 * Style-agnostic, deterministic color-relation math.
 * No Y2K rules, no clustering, no Superfamily, no AI, no DOM.
 *
 * Browser: window.ColorRelationCore
 * Node.js: require('./color-relation-core.js')
 */
(function colorRelationCoreFactory(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === 'object') {
    root.ColorRelationCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const CONTRACT = Object.freeze({
    name: 'YOYO Color Relation Contract',
    version: '0.1.0',
    engineScope: 'style_agnostic',
    validationScope: 'Y2K_only',
    universalityStatus: 'unvalidated',

    // These parameters are deliberately PROVISIONAL and must be calibrated.
    hueEvidence: Object.freeze({
      chromaLow: 0.005,
      chromaHigh: 0.04,
      status: 'provisional',
      purpose: 'Down-weight hue-angle evidence when chroma is too low to carry stable hue identity.',
    }),

    similarities: Object.freeze({
      status: 'provisional',
      lightness: '1 - |ΔL| because OKLab L is normalized to [0,1].',
      chroma: 'Bray-Curtis style proximity: 1 - |C1-C2|/(C1+C2).',
      tone: 'Geometric mean of lightness_similarity and chroma_similarity.',
      hueAngular: '1 - circularΔH/180. Kept separate from hue_reliability.',
      hueEvidence: 'hue_reliability * (2*hue_angular_similarity - 1).',
    }),

    coverageFeatures: Object.freeze([
      'delta_L',
      'delta_C',
      'hue_chord',
      'min_chroma',
      'max_chroma',
    ]),
  });

  const EPS = 1e-12;

  function clamp01(value) {
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(1, value));
  }

  function round(value, digits = 8) {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function smoothstep(edge0, edge1, value) {
    if (!(edge1 > edge0)) {
      throw new Error('smoothstep requires edge1 > edge0');
    }

    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function circularHueDifference(h1, h2) {
    if (!Number.isFinite(h1) || !Number.isFinite(h2)) {
      return null;
    }

    const raw = Math.abs(h1 - h2) % 360;
    return raw > 180 ? 360 - raw : raw;
  }

  function deltaEOk(labA, labB, chromaWeight = 1.0) {
    const dL = labA.L - labB.L;
    const da = (labA.a - labB.a) * chromaWeight;
    const db = (labA.b - labB.b) * chromaWeight;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  function perColorHueReliability(C) {
    const low = CONTRACT.hueEvidence.chromaLow;
    const high = CONTRACT.hueEvidence.chromaHigh;
    return smoothstep(low, high, Math.max(0, C));
  }

  function pairHueReliability(C1, C2) {
    const r1 = perColorHueReliability(C1);
    const r2 = perColorHueReliability(C2);
    return Math.sqrt(r1 * r2);
  }

  /**
   * Chroma-aware hue separation in OKLCH geometry.
   * Large ΔH contributes little when either color is near-achromatic.
   */
  function hueChord(C1, C2, deltaHDegrees) {
    if (!Number.isFinite(deltaHDegrees)) return 0;
    const radians = (deltaHDegrees * Math.PI) / 180;
    return 2 * Math.sqrt(Math.max(0, C1) * Math.max(0, C2)) * Math.sin(radians / 2);
  }

  function chromaSimilarity(C1, C2) {
    const a = Math.max(0, C1);
    const b = Math.max(0, C2);
    const denominator = a + b;

    if (denominator <= EPS) return 1;
    return clamp01(1 - Math.abs(a - b) / denominator);
  }

  function extractColor(mode) {
    if (!mode || typeof mode !== 'object') {
      throw new Error('Color mode must be an object.');
    }

    const physical = mode.physical && typeof mode.physical === 'object'
      ? mode.physical
      : mode;

    const lab = physical.centroid_lab || physical.lab;
    const lch = physical.centroid_lch || physical.lch;

    if (!lab || !lch) {
      throw new Error(`Mode ${mode.mode_id || mode.id || '(unknown)'} missing LAB/LCH centroid.`);
    }

    for (const key of ['L', 'a', 'b']) {
      if (!Number.isFinite(lab[key])) {
        throw new Error(`Invalid LAB.${key} for ${mode.mode_id || mode.id || '(unknown)'}`);
      }
    }

    for (const key of ['L', 'C']) {
      if (!Number.isFinite(lch[key])) {
        throw new Error(`Invalid LCH.${key} for ${mode.mode_id || mode.id || '(unknown)'}`);
      }
    }

    return {
      id: mode.mode_id || mode.id || null,
      hex: physical.centroid_hex || physical.hex || null,
      lab: { L: lab.L, a: lab.a, b: lab.b },
      lch: {
        L: lch.L,
        C: lch.C,
        H: Number.isFinite(lch.H) ? lch.H : null,
      },
    };
  }

  function computePairRelation(modeA, modeB) {
    const a = extractColor(modeA);
    const b = extractColor(modeB);

    const deltaL = Math.abs(a.lch.L - b.lch.L);
    const deltaC = Math.abs(a.lch.C - b.lch.C);
    const deltaH = circularHueDifference(a.lch.H, b.lch.H);
    const minC = Math.min(a.lch.C, b.lch.C);
    const maxC = Math.max(a.lch.C, b.lch.C);

    const lightnessSimilarity = clamp01(1 - deltaL);
    const cSimilarity = chromaSimilarity(a.lch.C, b.lch.C);
    const toneSimilarity = Math.sqrt(lightnessSimilarity * cSimilarity);

    const hReliability = pairHueReliability(a.lch.C, b.lch.C);
    const hAngularSimilarity = Number.isFinite(deltaH)
      ? clamp01(1 - deltaH / 180)
      : null;
    const hEvidence = Number.isFinite(hAngularSimilarity)
      ? hReliability * (2 * hAngularSimilarity - 1)
      : 0;

    const aNeutrality = 1 - perColorHueReliability(a.lch.C);
    const bNeutrality = 1 - perColorHueReliability(b.lch.C);

    return {
      pair_key: [a.id, b.id].sort().join('||'),
      a: { id: a.id, hex: a.hex, lab: a.lab, lch: a.lch },
      b: { id: b.id, hex: b.hex, lab: b.lab, lch: b.lch },

      physical_relations: {
        delta_L: round(deltaL),
        delta_C: round(deltaC),
        circular_delta_H_degrees: Number.isFinite(deltaH) ? round(deltaH) : null,
        hue_chord: round(hueChord(a.lch.C, b.lch.C, deltaH)),
        min_chroma: round(minC),
        max_chroma: round(maxC),
        distance_cw_1_00: round(deltaEOk(a.lab, b.lab, 1.0)),
        distance_cw_1_18: round(deltaEOk(a.lab, b.lab, 1.18)),
      },

      perceptual_relations_provisional: {
        lightness_similarity: round(lightnessSimilarity),
        chroma_similarity: round(cSimilarity),
        tone_similarity: round(toneSimilarity),
        hue_angular_similarity: Number.isFinite(hAngularSimilarity)
          ? round(hAngularSimilarity)
          : null,
        hue_reliability: round(hReliability),
        hue_evidence_signed: round(hEvidence),
        neutrality_a: round(aNeutrality),
        neutrality_b: round(bNeutrality),
        neutrality_similarity: round(1 - Math.abs(aNeutrality - bNeutrality)),
      },

      coverage_features: {
        delta_L: round(deltaL),
        delta_C: round(deltaC),
        hue_chord: round(hueChord(a.lch.C, b.lch.C, deltaH)),
        min_chroma: round(minC),
        max_chroma: round(maxC),
      },
    };
  }

  function buildRelationGraph(modes) {
    if (!Array.isArray(modes)) {
      throw new Error('buildRelationGraph expects an array of modes.');
    }

    const nodes = modes.map((mode) => {
      const color = extractColor(mode);
      return {
        mode_id: color.id,
        centroid_hex: color.hex,
        centroid_lab: color.lab,
        centroid_lch: color.lch,
      };
    });

    const edges = [];
    for (let i = 0; i < modes.length; i += 1) {
      for (let j = i + 1; j < modes.length; j += 1) {
        edges.push(computePairRelation(modes[i], modes[j]));
      }
    }

    return {
      metadata: {
        name: 'YOYO Color Relation Graph',
        contract: CONTRACT.name,
        contract_version: CONTRACT.version,
        engine_scope: CONTRACT.engineScope,
        validation_scope: CONTRACT.validationScope,
        universality_status: CONTRACT.universalityStatus,
        clustering_performed: false,
        semantic_family_decision_performed: false,
      },
      node_count: nodes.length,
      edge_count: edges.length,
      nodes,
      edges,
    };
  }

  return Object.freeze({
    CONTRACT,
    circularHueDifference,
    deltaEOk,
    perColorHueReliability,
    pairHueReliability,
    hueChord,
    chromaSimilarity,
    computePairRelation,
    buildRelationGraph,
  });
});
