'use strict';
const C = require('./selection-readiness-contract-v0_1.js');
let pass=0,total=0;
function t(name,fn){total++;try{fn();pass++;console.log('PASS ',name)}catch(e){console.error('FAIL ',name,'—',e.message)}}
function eq(a,b){if(a!==b)throw new Error(`${a} !== ${b}`)}
t('no references stays DATA_PENDING',()=>eq(C.evaluate({}).state,'DATA_PENDING'));
t('references without cache stays REFERENCES_CAPTURED',()=>eq(C.evaluate({reference_manifest_ready:true}).state,'REFERENCES_CAPTURED'));
t('complete cache without selection is PENDING_VISUAL_SELECTION',()=>eq(C.evaluate({reference_manifest_ready:true,cache_manifest_ready:true,cache_complete:true}).state,'PENDING_VISUAL_SELECTION'));
t('unknown selection provenance cannot promote',()=>eq(C.evaluate({reference_manifest_ready:true,cache_manifest_ready:true,cache_complete:true,selection_provenance:'AUTO_MAGIC',evaluation_set_ready:true,reference_audit_pass:true}).state,'PENDING_VISUAL_SELECTION'));
t('CLIP-ranked selection can reach DATA_READY without Tone/Hue human calibration',()=>eq(C.evaluate({reference_manifest_ready:true,cache_manifest_ready:true,cache_complete:true,selection_provenance:'CLIP_RANKED_FIXED_SET',evaluation_set_ready:true,reference_audit_pass:true}).state,'DATA_READY'));
t('selection without evaluation set is SELECTION_READY',()=>eq(C.evaluate({reference_manifest_ready:true,cache_manifest_ready:true,cache_complete:true,selection_provenance:'CLIP_RANKED_FIXED_SET',evaluation_set_ready:false,reference_audit_pass:true}).state,'SELECTION_READY'));
t('failed reference audit prevents DATA_READY',()=>eq(C.evaluate({reference_manifest_ready:true,cache_manifest_ready:true,cache_complete:true,selection_provenance:'CLIP_RANKED_FIXED_SET',evaluation_set_ready:true,reference_audit_pass:false}).state,'SELECTION_READY'));
console.log(`\n${pass}/${total} SelectionReadiness contract tests ${pass===total?'PASS':'FAIL'}.`);
if(pass!==total)process.exit(1);
