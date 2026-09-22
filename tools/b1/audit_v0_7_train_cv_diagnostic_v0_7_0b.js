#!/usr/bin/env node
'use strict';
const U=require('./v0_7_common.js');

const train=U.read('v0_7_train_human.json');
const graph=U.read('y2k_color_relation_graph.json');
const cfg=U.read('perceptual_relation_candidate_config_v0_7.json');
const freeze=U.read('v0_7_candidate_freeze.json');
const em=U.edgeMap(graph);

const reliable=train.cases
  .filter(c=>c.human_label.hue_applicability==='reliable')
  .map(c=>({c,e:em.get(c.pair_key)}));

function macroRecall(truth,pred){
  const cls=[...new Set(truth)];
  return cls.reduce((s,k)=>{
    let n=0,ok=0;
    for(let i=0;i<truth.length;i++) if(truth[i]===k){n++;if(pred[i]===k)ok++}
    return s+(n?ok/n:0);
  },0)/cls.length;
}
function fitBinary(ds){
  const a=ds.map(x=>({x:x.e.physical_relations.circular_delta_H_degrees,y:x.c.human_label.hue_relation}));
  const vals=[...new Set(a.map(x=>x.x))].sort((x,y)=>x-y);
  const cuts=[vals[0]-1e-8,...vals.map((v,i)=>i<vals.length-1?(v+vals[i+1])/2:v+1e-8)];
  let best=null;
  for(const t of cuts){
    const p=a.map(z=>z.x<t?'same_or_adjacent':'different');
    const y=a.map(z=>z.y);
    const macro=macroRecall(y,p),exact=p.filter((x,i)=>x===y[i]).length/y.length;
    if(!best||macro>best.macro||(macro===best.macro&&exact>best.exact))best={t,macro,exact};
  }
  return best;
}
const truth=[],pred=[];
for(let i=0;i<reliable.length;i++){
  const sub=reliable.filter((_,j)=>j!==i);
  const f=fitBinary(sub);
  const x=reliable[i].e.physical_relations.circular_delta_H_degrees;
  truth.push(reliable[i].c.human_label.hue_relation);
  pred.push(x<f.t?'same_or_adjacent':'different');
}
const correct=pred.filter((p,i)=>p===truth[i]).length;
const corrected={correct,total:truth.length,exactRate:correct/truth.length,macroRecall:macroRecall(truth,pred)};
const stored=cfg.train_cross_validation?.hue_relation_reliable || null;

const out={
  metadata:{
    name:'YOYO v0.7 Train CV Diagnostic Correction',
    version:'0.7.0b',
    status:'DIAGNOSTIC_REPORTING_BUG_CONFIRMED',
    candidate_parameters_changed:false,
    candidate_freeze_changed:false,
    validation_predictions_changed:false
  },
  stored_cv:stored,
  corrected_reliable_only_loo:corrected,
  explanation:'The original LOO diagnostic counted low_chroma/not_applicable rows in the reliable Hue CV denominator. The fitted Hue threshold itself used reliableRows only, so candidate parameters and validation predictions are unchanged.',
  candidate_config_sha256:freeze.candidate_config_sha256
};
U.write('v0_7_train_cv_diagnostic_correction.json',out);
console.log(`Train CV diagnostic correction: stored ${stored?.correct}/${stored?.total}; corrected reliable-only ${corrected.correct}/${corrected.total}.`);
console.log('Candidate parameters changed: false');
