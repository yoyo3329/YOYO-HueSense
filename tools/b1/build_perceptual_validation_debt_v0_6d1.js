#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const B=__dirname;
function read(f){const p=path.join(B,f);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null}
function fail(m){console.error('❌ '+m);process.exit(1)}
const hold=read('gold_holdout_regression_v0_5_1.json');
if(!hold) fail('gold_holdout_regression_v0_5_1.json missing — refusing to fabricate/fallback a holdout status.');
const s=hold.summary||{};
const tone=s.hard_score?.tone, hue=s.hard_score?.hue_relation_reliable, all=s.hard_score?.all_relevant_relations;
if(!tone||!hue) fail('holdout summary missing hard-score evidence');
const high=Number(s.contradictions?.high_confidence);
const out={
  metadata:{
    name:'YOYO Perceptual Validation Debt Register',
    version:'0.6D.1',
    status:'KNOWN_BLOCKER_RECORDED',
    source:'gold_holdout_regression_v0_5_1.json',
    validation_scope:hold.metadata?.validation_scope||'Y2K_BOUNDARY_STRESS_ONLY'
  },
  v0_5_candidate:{
    holdout_status:s.sanity_status||hold.metadata?.status||'UNKNOWN',
    tone:tone,
    hue_relation_reliable:hue,
    all_relevant_relations:all||null,
    high_confidence_contradictions:{count:high,total:s.hard_scorable??tone.total},
    production_eligible:false,
    interpretation:'FAILED_BOUNDARY_STRESS_REDESIGN_REQUIRED',
    blocks:{
      perceptual_candidate_promotion:true,
      live_perceptual_decision_authority:true,
      v0_6d_ingestion_infrastructure_closure:false,
      network_sandbox_engineering:false
    }
  },
  governance:{
    human_tone_hue_status:'PAUSED_PENDING_REDESIGN',
    holdout_may_be_reused_for_tuning:false,
    candidate_may_be_promoted:false,
    status_may_not_be_hidden_by_foundation_pass:true
  }
};
fs.writeFileSync(path.join(B,'perceptual_validation_debt_v0_6d1.json'),JSON.stringify(out,null,2)+'\n');
console.log('=== YOYO Perceptual Validation Debt v0.6D.1 ===');
console.log(`Holdout status                : ${out.v0_5_candidate.holdout_status}`);
console.log(`Tone                          : ${tone.correct}/${tone.total}`);
console.log(`Hue relation reliable         : ${hue.correct}/${hue.total}`);
console.log(`High-confidence contradictions: ${high}/${s.hard_scorable??tone.total}`);
console.log('Production promotion          : BLOCKED');
console.log('v0.6D ingestion closure       : NOT BLOCKED (scoped closure only)');
