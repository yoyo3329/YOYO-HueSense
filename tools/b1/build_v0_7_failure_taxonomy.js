#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const U=require('./v0_7_common.js');
const hold=U.read('gold_holdout_regression_v0_5_1.json');
const graph=U.read('y2k_color_relation_graph.json');const em=U.edgeMap(graph);
if(hold.summary?.sanity_status!=='BOUNDARY_CONTRADICTION_FOUND')throw new Error('Expected retired v0.5 boundary contradiction evidence.');
const buckets={TONE_OVER_SEPARATION:[],TONE_UNDER_SEPARATION:[],TONE_PARTIAL_MISMATCH:[],HUE_APPLICABILITY_OVERCLAIM:[],HUE_APPLICABILITY_UNDERCLAIM:[],HUE_RELATION_MISMATCH_RELIABLE:[],COMPOUNDED_ERROR:[]};
for(const r of hold.rows||[]){if(!r.hard_score_included)continue;const e=em.get(r.pair_key);const feat=e?.physical_relations||{};let err=0;
  const h=r.human,p=r.predicted;
  if(h.tone_relation!==p.tone_relation){err++;let k='TONE_PARTIAL_MISMATCH';if(h.tone_relation==='similar'&&p.tone_relation==='different')k='TONE_OVER_SEPARATION';else if(h.tone_relation==='different'&&p.tone_relation!=='different')k='TONE_UNDER_SEPARATION';buckets[k].push({case_id:r.case_id,pair_key:r.pair_key,delta_L:feat.delta_L,delta_C:feat.delta_C,min_chroma:feat.min_chroma,human:h.tone_relation,predicted:p.tone_relation});}
  if(h.hue_applicability!==p.hue_applicability){err++;const k=h.hue_applicability==='low_chroma'&&p.hue_applicability==='reliable'?'HUE_APPLICABILITY_OVERCLAIM':'HUE_APPLICABILITY_UNDERCLAIM';buckets[k].push({case_id:r.case_id,pair_key:r.pair_key,min_chroma:feat.min_chroma,human:h.hue_applicability,predicted:p.hue_applicability});}
  if(h.hue_applicability==='reliable'&&h.hue_relation!==p.hue_relation){err++;buckets.HUE_RELATION_MISMATCH_RELIABLE.push({case_id:r.case_id,pair_key:r.pair_key,delta_H:feat.circular_delta_H_degrees,human:h.hue_relation,predicted:p.hue_relation});}
  if(err>1)buckets.COMPOUNDED_ERROR.push({case_id:r.case_id,pair_key:r.pair_key,error_dimensions:err});
}
const out={metadata:{name:'YOYO v0.7-A Retired Holdout Failure Taxonomy',version:'0.7.0',status:'DIAGNOSTIC_ONLY',source:'gold_holdout_regression_v0_5_1.json',source_scope:'Y2K_BOUNDARY_STRESS_ONLY',allowed_use:'FAILURE_TAXONOMY_ONLY',forbidden_use:['THRESHOLD_TUNING','FORMULA_SELECTION','V0_7_VALIDATION','PRODUCTION_SCORE']},holdout_summary:hold.summary,taxonomy:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,{count:v.length,cases:v}])),general_observations:[
  'Tone errors occur in both over-separation and under-separation directions; a one-direction threshold correction is not justified by this holdout.',
  'Reliable-hue relation itself had no mismatch in the reliable subset, while hue applicability still produced errors; these should remain separate subproblems.',
  'High-confidence contradictions show that threshold-margin confidence from v0.5 is not trustworthy enough for production authority.'
],anti_overfit_notice:'Case rows are retained only as diagnostic evidence. v0.7 fitting code is forbidden from importing this file or the retired holdout.'};
U.write('v0_7_failure_taxonomy.json',out);console.log('=== v0.7-A Failure Taxonomy ===');for(const [k,v] of Object.entries(buckets))console.log(`${k.padEnd(34)} ${v.length}`);console.log('Use: DIAGNOSTIC ONLY. No tuning permitted.');
