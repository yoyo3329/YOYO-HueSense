#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const FIRST = path.join(__dirname,'calibration_set_v0_human.json');
const SECOND = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname,'human_blind_retest_v0_4.json');

const REPORT = path.join(__dirname,'human_test_retest_report_v0_4.json');
const CANDIDATES = path.join(__dirname,'human_confirmed_candidates_v0_4.json');

function read(p){
  if(!fs.existsSync(p)){
    console.error(`❌ 找不到：${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
function mapById(arr){ return new Map((arr||[]).map(x=>[x.case_id,x])); }

const first=read(FIRST), second=read(SECOND);
const fm=mapById(first.cases), sm=mapById(second.cases);

let rows=[];

for(const [id,f] of fm.entries()){
  const old=f.human_label||{};
  const now=sm.get(id)?.human_retest_label||null;

  if(!now || !now.hue_applicability || !now.hue_relation || !now.tone_relation || !now.confidence){
    rows.push({case_id:id,status:'INCOMPLETE',gold_eligible:false,coverage_anchor:false});
    continue;
  }

  let hueStatus='NOT_COMPARABLE_V0_ONTOLOGY';

  if(old.hue_relation==='unreliable_low_chroma'){
    hueStatus=(now.hue_applicability==='low_chroma' && now.hue_relation==='not_applicable')
      ? 'CONSISTENT_LOW_CHROMA'
      : 'DISAGREEMENT';
  } else if(now.hue_applicability==='low_chroma'){
    hueStatus='ONTOLOGY_REFINED';
  } else if(now.hue_applicability==='review' || now.hue_relation==='review'){
    hueStatus='REVIEW';
  } else if(now.hue_applicability==='reliable'){
    hueStatus=old.hue_relation===now.hue_relation ? 'RELATION_CONSISTENT' : 'DISAGREEMENT';
  }

  const toneSame=old.tone_relation===now.tone_relation;
  const unresolved=now.hue_applicability==='review' || now.hue_relation==='review' || now.tone_relation==='review';
  const low=now.confidence==='low';

  let status='REVIEW_REQUIRED';
  if(!unresolved && !low){
    if((hueStatus==='RELATION_CONSISTENT' || hueStatus==='CONSISTENT_LOW_CHROMA') && toneSame){
      status='CONFIRMED_CANDIDATE';
    } else if(hueStatus==='ONTOLOGY_REFINED' && toneSame){
      status='ONTOLOGY_REFINED_CANDIDATE';
    }
  }

  rows.push({
    case_id:id,a:f.a,b:f.b,
    first_pass_label:old,
    second_human_label:now,
    comparison:{
      hue_status:hueStatus,
      tone_consistent:toneSame
    },
    status,
    gold_eligible:false,
    coverage_anchor:false
  });
}

const complete=rows.filter(r=>r.status!=='INCOMPLETE');
const summary={
  total:rows.length,
  complete:complete.length,
  confirmed_candidate:rows.filter(r=>r.status==='CONFIRMED_CANDIDATE').length,
  ontology_refined_candidate:rows.filter(r=>r.status==='ONTOLOGY_REFINED_CANDIDATE').length,
  review_required:rows.filter(r=>r.status==='REVIEW_REQUIRED').length,
  incomplete:rows.filter(r=>r.status==='INCOMPLETE').length,
  tone_exact:complete.filter(r=>r.comparison?.tone_consistent===true).length
};

fs.writeFileSync(REPORT,JSON.stringify({
  metadata:{
    name:'YOYO Human Test-Retest Report',
    version:'0.4.0',
    status:'human_consistency_only',
    policy:'No automatic Gold promotion.'
  },
  summary,cases:rows
},null,2)+'\n');

const confirmed=rows.filter(r=>
  r.status==='CONFIRMED_CANDIDATE' || r.status==='ONTOLOGY_REFINED_CANDIDATE'
).map(r=>({
  ...r,
  label_status:'HUMAN_CONFIRMED_CANDIDATE',
  gold_eligible:false,
  coverage_anchor:false,
  promotion_status:'AWAITING_TRAIN_HOLDOUT_SPLIT'
}));

fs.writeFileSync(CANDIDATES,JSON.stringify({
  metadata:{
    name:'YOYO Human Confirmed Candidates v0.4',
    version:'0.4.0',
    status:'NOT_GOLD',
    case_count:confirmed.length
  },
  cases:confirmed
},null,2)+'\n');

console.log('=== YOYO Human Test-Retest v0.4 ===');
console.log(`Complete                   : ${summary.complete}/${summary.total}`);
console.log(`Tone exact                 : ${summary.tone_exact}/${summary.complete}`);
console.log(`Confirmed candidate        : ${summary.confirmed_candidate}`);
console.log(`Ontology refined candidate : ${summary.ontology_refined_candidate}`);
console.log(`Review required            : ${summary.review_required}`);
console.log(`Incomplete                 : ${summary.incomplete}`);
console.log('');
console.log('Gold promoted              : 0');
console.log('Coverage anchors promoted  : 0');
console.log('');
console.log(`Report     : ${REPORT}`);
console.log(`Candidates : ${CANDIDATES}`);
