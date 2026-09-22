#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');

const TRAIN=path.join(__dirname,'gold_train_candidate_v0_4.json');
const BASE=path.join(__dirname,'y2k_color_relation_graph.json');
const CAND=path.join(__dirname,'y2k_color_relation_graph_v0_5_candidate.json');
const OUT=path.join(__dirname,'relation_baseline_vs_candidate_v0_5.json');

function read(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function key(a,b){return [a,b].sort().join('||');}

const train=read(TRAIN), base=read(BASE), cand=read(CAND);
const bm=new Map(base.edges.map(e=>[e.pair_key,e]));
const cm=new Map(cand.edges.map(e=>[e.pair_key,e]));

function decodeOld(e){
  const rel=e.perceptual_relations_provisional;
  const dh=e.physical_relations.circular_delta_H_degrees;
  let hueApplicability, hueRelation;
  if(rel.hue_reliability<0.15){
    hueApplicability='low_chroma'; hueRelation='not_applicable';
  }else{
    hueApplicability='reliable';
    if(dh<=60) hueRelation='same_or_adjacent';
    else if(dh>=90) hueRelation='different';
    else hueRelation='review';
  }
  const t=rel.tone_similarity;
  const toneRelation=t>=0.65?'similar':t>=0.45?'similar_or_partial':'different';
  return {hue_applicability:hueApplicability,hue_relation:hueRelation,tone_relation:toneRelation};
}

const rows=[];
for(const c of train.cases){
  const k=key(c.a.mode_id,c.b.mode_id);
  const truth=c.human_retest_label;
  const old=decodeOld(bm.get(k));
  const next=cm.get(k).perceptual_relations_candidate_v0_5;
  rows.push({case_id:c.case_id,pair_key:k,truth,baseline:old,candidate:{
    hue_applicability:next.hue_applicability,
    hue_relation:next.hue_relation,
    tone_relation:next.tone_relation,
  }});
}

function metrics(which){
  let ha=0,hr=0,hrt=0,tone=0,all=0;
  for(const r of rows){
    const p=r[which], y=r.truth;
    const a=p.hue_applicability===y.hue_applicability;
    const h=p.hue_relation===y.hue_relation;
    const t=p.tone_relation===y.tone_relation;
    if(a)ha++;
    if(y.hue_applicability==='reliable'){hrt++;if(h)hr++;}
    if(t)tone++;
    if(a&&h&&t)all++;
  }
  return {hue_applicability:{correct:ha,total:rows.length},hue_relation_reliable:{correct:hr,total:hrt},tone:{correct:tone,total:rows.length},all:{correct:all,total:rows.length}};
}

const out={
  metadata:{
    name:'YOYO Baseline vs Candidate Train Comparison',version:'0.5.0',status:'TRAIN_COMPARISON_ONLY',
    warning:'Both baseline and candidate are evaluated on the same 20 human-approved training cases. This is not independent validation.'
  },
  baseline_decoder:{hue_reliability_unreliable_below:0.15,same_max_delta_h:60,different_min_delta_h:90,tone_similar_min:0.65,tone_partial_min:0.45},
  summary:{baseline:metrics('baseline'),candidate:metrics('candidate')},
  rows,
};
fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log('=== YOYO Baseline vs Candidate v0.5 ===');
console.log('Baseline :',JSON.stringify(out.summary.baseline));
console.log('Candidate:',JSON.stringify(out.summary.candidate));
console.log('⚠ TRAIN COMPARISON ONLY');
console.log(`Output: ${OUT}`);
