'use strict';
const C=require('./perceptual-relation-contract-v0_7.js');
let p=0,t=0;function test(n,f){t++;try{f();p++;console.log('PASS ',n)}catch(e){console.error('FAIL ',n,'—',e.message)}}
function throws(f){let ok=false;try{f()}catch{ok=true}if(!ok)throw new Error('expected rejection')}
const good={lightness_relation:'similar',chroma_relation:'similar_or_partial',hue_applicability:'low_chroma',hue_relation:'not_applicable',tone_relation:'similar',confidence:'high'};
test('decomposed human label accepted',()=>C.validateHumanLabel(good));
test('low-chroma cannot carry comparable hue label',()=>throws(()=>C.validateHumanLabel({...good,hue_relation:'different'})));
test('reliable hue must carry comparable hue relation',()=>throws(()=>C.validateHumanLabel({...good,hue_applicability:'reliable',hue_relation:'not_applicable'})));
test('retired holdout cannot tune v0.7',()=>{if(C.CONTRACT.research_discipline.retired_holdout_for_threshold_tuning!==false)throw new Error('retired holdout tuning allowed')});
test('validation cannot retune frozen candidate',()=>{if(C.CONTRACT.research_discipline.validation_may_retune_candidate!==false)throw new Error('validation retune allowed')});
test('mode/case-specific rules forbidden',()=>{if(!C.CONTRACT.research_discipline.mode_specific_rules_forbidden||!C.CONTRACT.research_discipline.case_specific_rules_forbidden)throw new Error('special cases allowed')});
test('new Gold requires direct human',()=>{if(!C.CONTRACT.research_discipline.direct_human_required_for_new_gold||C.CONTRACT.research_discipline.ai_or_algorithm_agreement_is_gold)throw new Error('gold purity broken')});
test('pilot gate is pre-registered and never auto-promotes production',()=>{if(C.CONTRACT.preregistered_pilot_gate.automatic_production_promotion!==false)throw new Error('auto promotion allowed')});
console.log(`\n${p}/${t} PerceptualRelation v0.7 contract tests ${p===t?'PASS':'FAIL'}.`);if(p!==t)process.exit(1);
