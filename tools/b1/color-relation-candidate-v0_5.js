'use strict';

/**
 * YOYO Color Relation Candidate v0.5.0
 *
 * IMPORTANT:
 * - This is a CALIBRATION CANDIDATE, not the production contract.
 * - Parameters were calibrated on HUMAN_APPROVED_AI_ASSISTED Y2K training cases.
 * - No independent GOLD_HOLDOUT has been evaluated yet.
 * - Physical relation math remains delegated to the stable v0.1 core.
 */

const Base = require('./color-relation-core.js');

const CONTRACT = Object.freeze({
  name: 'YOYO Color Relation Candidate Contract',
  version: '0.5.0-candidate',
  engineScope: 'style_agnostic_formula',
  calibrationScope: 'Y2K_human_approved_train',
  validationScope: 'train_fit_only',
  holdoutStatus: 'missing_independent_holdout',
  universalityStatus: 'unvalidated',
  productionGateEligible: false,
  provenance: 'human-approved AI-assisted labels; not independent blind holdout',
  parameters: Object.freeze({
    hue: Object.freeze({
      minChromaReliable: 0.03,
      sameOrAdjacentMaxDeltaHDegrees: 40,
    }),
    tone: Object.freeze({
      similarMaxDeltaL: 0.06,
      similarMaxDeltaC: 0.033,
      interactionWeight: 4.0,
      differentThreshold: 0.54,
      formula: 'deltaL + interactionWeight * sqrt(deltaL * deltaC)',
    }),
  }),
});

function round(value, digits = 8) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function computeCandidateFromPhysical(physical) {
  const p = physical;
  const hp = CONTRACT.parameters.hue;
  const tp = CONTRACT.parameters.tone;

  const minC = p.min_chroma;
  const deltaH = p.circular_delta_H_degrees;
  const deltaL = p.delta_L;
  const deltaC = p.delta_C;

  const hueApplicability = minC < hp.minChromaReliable
    ? 'low_chroma'
    : 'reliable';

  let hueRelation = 'not_applicable';
  if (hueApplicability === 'reliable' && Number.isFinite(deltaH)) {
    hueRelation = deltaH <= hp.sameOrAdjacentMaxDeltaHDegrees
      ? 'same_or_adjacent'
      : 'different';
  }

  const toneNearMatch = (
    deltaL <= tp.similarMaxDeltaL &&
    deltaC <= tp.similarMaxDeltaC
  );

  const toneSeparationScore = deltaL + tp.interactionWeight * Math.sqrt(Math.max(0, deltaL * deltaC));

  let toneRelation;
  if (toneNearMatch) {
    toneRelation = 'similar';
  } else if (toneSeparationScore >= tp.differentThreshold) {
    toneRelation = 'different';
  } else {
    toneRelation = 'similar_or_partial';
  }

  return {
    hue_applicability: hueApplicability,
    hue_relation: hueRelation,
    hue_applicability_margin_chroma: round(Math.abs(minC - hp.minChromaReliable)),
    hue_relation_margin_degrees: hueApplicability === 'reliable' && Number.isFinite(deltaH)
      ? round(Math.abs(deltaH - hp.sameOrAdjacentMaxDeltaHDegrees))
      : null,
    tone_relation: toneRelation,
    tone_near_match: toneNearMatch,
    tone_separation_score: round(toneSeparationScore),
    tone_different_margin: round(Math.abs(toneSeparationScore - tp.differentThreshold)),
    parameters: {
      hue_min_chroma_reliable: hp.minChromaReliable,
      hue_same_or_adjacent_max_delta_h_degrees: hp.sameOrAdjacentMaxDeltaHDegrees,
      tone_similar_max_delta_l: tp.similarMaxDeltaL,
      tone_similar_max_delta_c: tp.similarMaxDeltaC,
      tone_interaction_weight: tp.interactionWeight,
      tone_different_threshold: tp.differentThreshold,
    },
  };
}

function computePairRelation(modeA, modeB) {
  const base = Base.computePairRelation(modeA, modeB);
  return {
    ...base,
    perceptual_relations_candidate_v0_5: computeCandidateFromPhysical(base.physical_relations),
  };
}

function buildRelationGraph(modes) {
  const nodes = modes.map((mode) => {
    const base = Base.computePairRelation(mode, mode);
    return {
      mode_id: base.a.id,
      centroid_hex: base.a.hex,
      centroid_lab: base.a.lab,
      centroid_lch: base.a.lch,
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
      name: 'YOYO Color Relation Graph v0.5 Candidate',
      contract: CONTRACT.name,
      contract_version: CONTRACT.version,
      engine_scope: CONTRACT.engineScope,
      calibration_scope: CONTRACT.calibrationScope,
      validation_scope: CONTRACT.validationScope,
      holdout_status: CONTRACT.holdoutStatus,
      universality_status: CONTRACT.universalityStatus,
      production_gate_eligible: false,
      clustering_performed: false,
      semantic_family_decision_performed: false,
    },
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
  };
}

module.exports = Object.freeze({
  CONTRACT,
  computeCandidateFromPhysical,
  computePairRelation,
  buildRelationGraph,
});
