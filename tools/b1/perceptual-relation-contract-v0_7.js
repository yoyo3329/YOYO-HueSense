'use strict';

const CONTRACT = Object.freeze({
  name: 'YOYO Perceptual Relation Contract',
  version: '0.7.0',
  scope: 'Y2K_REDESIGN_PILOT',
  universality_status: 'UNVALIDATED',
  production_gate_eligible: false,
  inputs: Object.freeze([
    'delta_L','delta_C','circular_delta_H_degrees','hue_chord','min_chroma','max_chroma'
  ]),
  outputs: Object.freeze({
    lightness_relation: ['similar','similar_or_partial','different','review'],
    chroma_relation: ['similar','similar_or_partial','different','review'],
    hue_applicability: ['low_chroma','reliable','review'],
    hue_relation: ['same_or_adjacent','different','not_applicable','review'],
    tone_relation: ['similar','similar_or_partial','different','review'],
    confidence: ['high','medium','low']
  }),
  research_discipline: Object.freeze({
    retired_holdout_for_taxonomy_only: true,
    retired_holdout_for_threshold_tuning: false,
    retired_holdout_for_formula_selection: false,
    retired_holdout_for_v0_7_validation: false,
    mode_specific_rules_forbidden: true,
    case_specific_rules_forbidden: true,
    validation_labels_visible_before_candidate_freeze: false,
    validation_may_retune_candidate: false,
    direct_human_required_for_new_gold: true,
    ai_or_algorithm_agreement_is_gold: false,
    candidate_confidence_before_independent_validation: 'UNVALIDATED_ONLY'
  }),
  preregistered_pilot_gate: Object.freeze({
    validation_scope: 'Y2K_INDEPENDENT_VALIDATION_PILOT',
    min_complete_cases: 12,
    min_lightness_exact_rate: 0.75,
    min_chroma_exact_rate: 0.75,
    min_tone_exact_rate: 0.75,
    min_hue_applicability_exact_rate: 0.75,
    min_reliable_hue_cases: 4,
    min_reliable_hue_exact_rate: 0.80,
    min_all_relevant_exact_rate: 0.60,
    max_high_confidence_all_relation_contradictions: 2,
    automatic_production_promotion: false,
    note: 'Pilot gate is pre-registered before new human labels. Passing it is not production readiness or universality validation.'
  })
});

function assert(c,m){if(!c)throw new Error(m)}
function validateHumanLabel(y){
  assert(y && typeof y==='object','human label required');
  for(const k of ['lightness_relation','chroma_relation','hue_applicability','hue_relation','tone_relation','confidence']){
    assert(CONTRACT.outputs[k].includes(y[k]), `invalid ${k}: ${y[k]}`);
  }
  if(y.hue_applicability==='low_chroma') assert(y.hue_relation==='not_applicable','low_chroma requires not_applicable hue_relation');
  if(y.hue_applicability==='reliable') assert(['same_or_adjacent','different'].includes(y.hue_relation),'reliable hue requires comparable relation');
  if(y.hue_applicability==='review') assert(y.hue_relation==='review','review hue applicability requires review hue relation');
  return true;
}
function assertDirectHumanDataset(d, expectedRole){
  assert(d?.metadata?.authority==='DIRECT_HUMAN_BLIND','authority must be DIRECT_HUMAN_BLIND');
  assert(d?.metadata?.ai_assistance===false,'AI assistance must be false');
  assert(d?.metadata?.algorithm_outputs_hidden===true,'algorithm outputs must be hidden');
  if(expectedRole) assert(d?.metadata?.role===expectedRole,`role must be ${expectedRole}`);
  assert(Array.isArray(d?.cases)&&d.cases.length>0,'cases required');
  for(const c of d.cases) validateHumanLabel(c.human_label);
  return true;
}
module.exports=Object.freeze({CONTRACT,validateHumanLabel,assertDirectHumanDataset});
