#!/usr/bin/env node
'use strict';
const C=require('./perceptual-label-contract-v0_2.js');let p=0,t=0;
function test(n,f){t++;try{f();console.log('PASS ',n);p++}catch(e){console.error('FAIL ',n,'—',e.message);process.exitCode=1}}
function mustReject(x){let ok=false;try{C.validateLabel(x)}catch(_){ok=true}if(!ok)throw Error('invalid label accepted')}
const good={hue_applicability:'low_chroma',hue_relation:'not_applicable',tone_relation:'similar',confidence:'high'};
test('low_chroma + not_applicable accepted',()=>C.validateLabel(good));
test('low_chroma + different rejected',()=>mustReject({...good,hue_relation:'different'}));
test('low_chroma + same_or_adjacent rejected',()=>mustReject({...good,hue_relation:'same_or_adjacent'}));
test('reliable + not_applicable rejected',()=>mustReject({...good,hue_applicability:'reliable'}));
test('reliable + different accepted',()=>C.validateLabel({...good,hue_applicability:'reliable',hue_relation:'different'}));
test('review applicability requires review relation',()=>mustReject({...good,hue_applicability:'review',hue_relation:'not_applicable'}));
test('legacy label without hue_applicability is detected, not auto-mutated',()=>{const c={case_id:'legacy',human_label:{hue_relation:'different',tone_relation:'different',confidence:'high'}};if(!C.isLegacyCase(c))throw Error('legacy case not detected');if(C.CONTRACT.legacy_raw_mutation_allowed!==false)throw Error('legacy mutation unexpectedly allowed')});
test('numeric features never auto-relabel labels',()=>{if(C.CONTRACT.auto_relabel_from_numeric_features!==false)throw Error('numeric auto-relabel enabled')});
console.log(`\n${p}/${t} PerceptualLabel contract tests PASS.`);if(p!==t)process.exit(1);
