#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const B=__dirname;
function r(f){try{return JSON.parse(fs.readFileSync(path.join(B,f),'utf8'))}catch{return null}}
function w(f,x){fs.writeFileSync(path.join(B,f),JSON.stringify(x,null,2)+'\n')}
const old=r('project_state_manifest_v0_6d.json');
const debt=r('perceptual_validation_debt_v0_6d1.json');
const n=r('network_sandbox_policy_v0_6d1.json');
if(!old)throw new Error('project_state_manifest_v0_6d.json missing');
if(!debt)throw new Error('perceptual_validation_debt_v0_6d1.json missing');
const m=JSON.parse(JSON.stringify(old));
m.manifest_version='0.6D.1';
m.current_phase='v0.6D_SCOPED_CLOSED_v0.6E_PRECONDITIONS_READY';
m.updated_at=new Date().toISOString();
m.summary='v0.6D ingestion infrastructure is CLOSED in scope. Perceptual Relation v0.5 failed Y2K boundary-stress holdout and remains a production blocker. v0.6E may proceed only through isolated capture/replay engineering; no DATA_READY promise before an accepted selection gate passes.';
m.product_readiness={
  overall_ready:false,
  ingestion_infrastructure:'PASS_SCOPED_CLOSED',
  perceptual_relation:'FAILED_BOUNDARY_STRESS_REDESIGN_REQUIRED',
  live_runtime:'OFF'
};
m.calibration=m.calibration||{};
m.calibration.human_calibration_status='PAUSED_PENDING_REDESIGN';
m.calibration.v0_5_holdout_status=debt.v0_5_candidate.holdout_status;
m.calibration.v0_5_tone_score=debt.v0_5_candidate.tone;
m.calibration.v0_5_hue_reliable_score=debt.v0_5_candidate.hue_relation_reliable;
m.calibration.v0_5_high_confidence_contradictions=debt.v0_5_candidate.high_confidence_contradictions;
m.calibration.v0_5_perceptual_candidate_status='FAILED_BOUNDARY_STRESS_REDESIGN_REQUIRED';
m.v0_6e_entry={
  engineering_preparation_allowed:true,
  live_network_capture_allowed_only_in_isolated_capture_job:true,
  deterministic_tests_live_network:false,
  deterministic_transport:'REPLAY_ONLY',
  quiet_luxury_after_fetch_max_without_selection:'PENDING_VISUAL_SELECTION',
  data_ready_may_be_claimed_only_after_accepted_selection_provenance:true,
  accepted_selection_provenance:['CLIP_RANKED_FIXED_SET','LEGACY_FIXED_EVALUATION_SET'],
  human_tone_hue_required_for_reference_selection:false,
  note:'Visual selection/CLIP selection is a reference-selection gate and is distinct from Tone/Hue human calibration.'
};
m.next_actions={
  automatic_engineering:'v0.6E PREP may build an isolated real-capture adapter plus frozen replay fixtures. Do not couple live network to deterministic tests. Do not claim Quiet Luxury DATA_READY until accepted selection provenance + evaluation set + reference audit pass.',
  human:'Perceptual Relation v0.5 failed the Y2K boundary-stress holdout (Tone 2/9; 7/9 high-confidence contradictions). v0.6 Tone/Hue work is PAUSED_PENDING_REDESIGN, not merely unstarted.',
  cross_style:'Quiet Luxury may move through REFERENCES_CAPTURED/CACHE_READY/PENDING_VISUAL_SELECTION. DATA_READY requires accepted selection provenance.'
};
w('project_state_manifest_v0_6d1.json',m);
console.log('Built project_state_manifest_v0_6d1.json');
