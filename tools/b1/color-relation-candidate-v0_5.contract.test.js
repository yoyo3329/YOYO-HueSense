'use strict';

const C = require('./color-relation-candidate-v0_5.js');
let pass=0, fail=0;
function test(name,fn){try{fn();console.log('PASS ',name);pass++;}catch(e){console.error('FAIL ',name,'—',e.message);fail++;}}
function assert(x,msg){if(!x)throw new Error(msg||'assertion failed');}
function mode(id,L,a,b,Cc,H){return {mode_id:id,physical:{centroid_hex:'#000000',centroid_lab:{L,a,b},centroid_lch:{L,C:Cc,H}}};}

test('candidate is explicitly not production-gate eligible',()=>{
  assert(C.CONTRACT.productionGateEligible===false);
  assert(C.CONTRACT.validationScope==='train_fit_only');
});

test('pair candidate relation is symmetric',()=>{
  const a=mode('a',0.5,0.05,0,0.05,0), b=mode('b',0.6,0,0.05,0.05,90);
  const ab=C.computePairRelation(a,b).perceptual_relations_candidate_v0_5;
  const ba=C.computePairRelation(b,a).perceptual_relations_candidate_v0_5;
  assert(ab.hue_applicability===ba.hue_applicability);
  assert(ab.hue_relation===ba.hue_relation);
  assert(ab.tone_relation===ba.tone_relation);
  assert(ab.tone_separation_score===ba.tone_separation_score);
});

test('low chroma makes hue relation not applicable',()=>{
  const a=mode('a',0.5,0.001,0,0.01,0), b=mode('b',0.5,0.1,0,0.1,160);
  const p=C.computePairRelation(a,b).perceptual_relations_candidate_v0_5;
  assert(p.hue_applicability==='low_chroma');
  assert(p.hue_relation==='not_applicable');
});

test('reliable hue uses 40 degree candidate boundary',()=>{
  const a=mode('a',0.5,0.1,0,0.1,0);
  const b=mode('b',0.5,0.1,0,0.1,39);
  const c=mode('c',0.5,0.1,0,0.1,41);
  assert(C.computePairRelation(a,b).perceptual_relations_candidate_v0_5.hue_relation==='same_or_adjacent');
  assert(C.computePairRelation(a,c).perceptual_relations_candidate_v0_5.hue_relation==='different');
});

test('tone similar requires both lightness and chroma proximity',()=>{
  const a=mode('a',0.5,0.05,0,0.05,0), b=mode('b',0.54,0.05,0,0.07,0);
  assert(C.computePairRelation(a,b).perceptual_relations_candidate_v0_5.tone_relation==='similar');
});

test('graph pair count remains n*(n-1)/2',()=>{
  const modes=[mode('a',0.2,0.05,0,0.05,0),mode('b',0.5,0,0.05,0.05,90),mode('c',0.8,-0.05,0,0.05,180)];
  const g=C.buildRelationGraph(modes);
  assert(g.edge_count===3);
});

console.log(`\n${pass}/${pass+fail} Color Relation Candidate v0.5 contract tests PASS.`);
if(fail)process.exit(1);
