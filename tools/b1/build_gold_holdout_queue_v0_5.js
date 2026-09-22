#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const GRAPH = path.join(__dirname,'y2k_color_relation_graph_v0_5_candidate.json');
const TRAIN = path.join(__dirname,'gold_train_candidate_v0_4.json');
const OUTPUT = path.join(__dirname,'gold_holdout_queue_v0_5.json');

const g=JSON.parse(fs.readFileSync(GRAPH,'utf8'));
const t=JSON.parse(fs.readFileSync(TRAIN,'utf8'));
const trainKeys=new Set(t.cases.map(c=>[c.a.mode_id,c.b.mode_id].sort().join('||')));
const pool=g.edges.filter(e=>!trainKeys.has(e.pair_key));

const selected=[];
const usedPairs=new Set();
const modeCount=new Map();
function canUse(e){
  if(usedPairs.has(e.pair_key)) return false;
  return [e.a.id,e.b.id].every(id=>(modeCount.get(id)||0)<2);
}
function add(e,category){
  selected.push({e,category}); usedPairs.add(e.pair_key);
  [e.a.id,e.b.id].forEach(id=>modeCount.set(id,(modeCount.get(id)||0)+1));
}
function take(candidates,n,category,predicate=()=>true){
  let count=0;
  for(const e of candidates){
    if(count>=n) break;
    if(!predicate(e)||!canUse(e)) continue;
    add(e,category);count++;
  }
  return count;
}

// 3 Hue applicability boundary cases: at least one on each side of C=0.03 if possible.
const happ=[...pool].sort((a,b)=>a.perceptual_relations_candidate_v0_5.hue_applicability_margin_chroma-b.perceptual_relations_candidate_v0_5.hue_applicability_margin_chroma);
take(happ,1,'hue_applicability_boundary',e=>e.perceptual_relations_candidate_v0_5.hue_applicability==='low_chroma');
take(happ,1,'hue_applicability_boundary',e=>e.perceptual_relations_candidate_v0_5.hue_applicability==='reliable');
take(happ,1,'hue_applicability_boundary');

// 3 Hue relation cases: one below 40°, one above 40°, then nearest remaining.
const hrel=pool.filter(e=>e.perceptual_relations_candidate_v0_5.hue_applicability==='reliable')
  .sort((a,b)=>a.perceptual_relations_candidate_v0_5.hue_relation_margin_degrees-b.perceptual_relations_candidate_v0_5.hue_relation_margin_degrees);
take(hrel,1,'hue_relation_boundary',e=>e.perceptual_relations_candidate_v0_5.hue_relation==='same_or_adjacent');
take(hrel,1,'hue_relation_boundary',e=>e.perceptual_relations_candidate_v0_5.hue_relation==='different');
take(hrel,1,'hue_relation_boundary');

// 3 Tone separation cases: one each side of 0.54 and one nearest remaining.
const tone=pool.filter(e=>!e.perceptual_relations_candidate_v0_5.tone_near_match)
  .sort((a,b)=>a.perceptual_relations_candidate_v0_5.tone_different_margin-b.perceptual_relations_candidate_v0_5.tone_different_margin);
take(tone,1,'tone_boundary',e=>e.perceptual_relations_candidate_v0_5.tone_relation==='similar_or_partial');
take(tone,1,'tone_boundary',e=>e.perceptual_relations_candidate_v0_5.tone_relation==='different');
take(tone,1,'tone_boundary');

const out={
  metadata:{
    name:'YOYO Independent Holdout Queue v0.5',version:'0.5.0',status:'UNLABELED_HOLDOUT_CANDIDATES',
    case_count:selected.length,
    selection:'Stratified boundary sampling: 3 hue-applicability, 3 hue-relation, 3 tone; excludes all training pairs; max 2 appearances per mode.',
    hard_rule:'During human labeling do not show candidate prediction, old labels, AI labels, L/C/H, HEX, priority, or boundary category.',
    note:'These cases remain non-Gold until independently labeled by a human.'
  },
  cases:selected.map((x,i)=>({
    case_id:`HOLDOUT_Y2K_${String(i+1).padStart(3,'0')}`,
    source_style:'Y2K',
    a:{mode_id:x.e.a.id,hex:x.e.a.hex,lch:x.e.a.lch},
    b:{mode_id:x.e.b.id,hex:x.e.b.hex,lch:x.e.b.lch},
    label_status:'UNLABELED_HOLDOUT',
    human_label:null
  }))
};
fs.writeFileSync(OUTPUT,JSON.stringify(out,null,2)+'\n','utf8');
console.log('=== YOYO Holdout Queue v0.5 ===');
console.log(`Cases: ${selected.length}`);
console.log(`Output: ${OUTPUT}`);
