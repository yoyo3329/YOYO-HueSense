#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HUMAN = path.join(__dirname, 'calibration_set_v0_human.json');
const AI = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'calibration_retest_v0_3_ai_completed.json');

const REPORT = path.join(__dirname, 'ai_vs_human_diagnostic_v0_3.json');
const QUEUE = path.join(__dirname, 'human_priority_retest_queue_v0_3.json');

function read(p){
  if(!fs.existsSync(p)){
    console.error(`❌ 找不到檔案：${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
function idx(arr){ return new Map((arr||[]).map(x=>[x.case_id,x])); }

const human = read(HUMAN);
const ai = read(AI);

const hm = idx(human.cases);
const am = idx(ai.cases);

const rows = [];

for (const [caseId, hcase] of hm.entries()){
  const acase = am.get(caseId);
  const h = hcase.human_label || {};
  const a = acase?.second_pass_label || null;

  if(!a){
    rows.push({
      case_id: caseId,
      status: 'AI_MISSING',
      priority: 1,
      reasons: ['ai_label_missing'],
      gold_eligible: false,
      coverage_anchor: false
    });
    continue;
  }

  const reasons = [];
  let priority = 3;

  const humanHueLegacy = h.hue_relation;
  const aiLowChroma = a.hue_applicability === 'low_chroma';

  if(aiLowChroma && humanHueLegacy !== 'unreliable_low_chroma'){
    reasons.push('AI_SUGGESTS_HUE_ONTOLOGY_REFINEMENT');
    priority = 1;
  }

  if(h.tone_relation !== a.tone_relation){
    reasons.push('HUMAN_AI_TONE_DISAGREEMENT');
    priority = 1;
  }

  if(a.confidence === 'medium' || a.confidence === 'low'){
    reasons.push('AI_NOT_HIGH_CONFIDENCE');
    priority = Math.min(priority, 2);
  }

  if(
    a.hue_applicability === 'reliable' &&
    (humanHueLegacy === 'same_or_adjacent' || humanHueLegacy === 'different') &&
    humanHueLegacy !== a.hue_relation
  ){
    reasons.push('HUMAN_AI_HUE_RELATION_DISAGREEMENT');
    priority = 1;
  }

  if(!reasons.length){
    reasons.push('HUMAN_AI_AGREEMENT_DIAGNOSTIC_ONLY');
  }

  rows.push({
    case_id: caseId,
    a: hcase.a,
    b: hcase.b,
    first_human_label: h,
    ai_label: a,
    diagnostic: {
      human_ai_tone_exact: h.tone_relation === a.tone_relation,
      ai_hue_applicability: a.hue_applicability,
      reliable_hue_relation_exact:
        a.hue_applicability === 'reliable' &&
        (humanHueLegacy === 'same_or_adjacent' || humanHueLegacy === 'different')
          ? humanHueLegacy === a.hue_relation
          : null
    },
    priority,
    reasons,
    label_status: 'DIAGNOSTIC_ONLY',
    gold_eligible: false,
    coverage_anchor: false
  });
}

const summary = {
  total: rows.length,
  tone_exact: rows.filter(r=>r.diagnostic?.human_ai_tone_exact===true).length,
  tone_disagreement: rows.filter(r=>r.diagnostic?.human_ai_tone_exact===false).length,
  ai_low_chroma: rows.filter(r=>r.diagnostic?.ai_hue_applicability==='low_chroma').length,
  ai_suggests_hue_ontology_refinement: rows.filter(r=>r.reasons?.includes('AI_SUGGESTS_HUE_ONTOLOGY_REFINEMENT')).length,
  reliable_hue_cases: rows.filter(r=>r.diagnostic?.reliable_hue_relation_exact!==null).length,
  reliable_hue_exact: rows.filter(r=>r.diagnostic?.reliable_hue_relation_exact===true).length,
  priority_1: rows.filter(r=>r.priority===1).length,
  priority_2: rows.filter(r=>r.priority===2).length,
  priority_3: rows.filter(r=>r.priority===3).length
};

fs.writeFileSync(REPORT, JSON.stringify({
  metadata:{
    name:'YOYO AI vs Human Diagnostic',
    version:'0.3.0',
    status:'DIAGNOSTIC_ONLY',
    policy:[
      'AI labels are not Human Gold.',
      'Human+AI agreement is not independent validation.',
      'This report must not tune or release the production engine directly.'
    ]
  },
  summary,
  cases: rows
}, null, 2) + '\n');

const sorted = [...rows].sort((x,y)=>x.priority-y.priority || x.case_id.localeCompare(y.case_id));

fs.writeFileSync(QUEUE, JSON.stringify({
  metadata:{
    name:'YOYO Human Priority Blind Retest Queue',
    version:'0.3.0',
    case_count:sorted.length,
    priority_policy:'Priority 1 = disagreement/ontology issue; Priority 2 = AI not high confidence; Priority 3 = agreement control cases.',
    blind_rule:'When rendered for human review, do not show first human label, AI label, reasons, or algorithm prediction.'
  },
  cases: sorted.map(r=>({
    case_id:r.case_id,
    source_style:'Y2K',
    a:r.a,
    b:r.b,
    review_priority:r.priority,
    second_pass_label:null
  }))
}, null, 2) + '\n');

console.log('=== YOYO AI Diagnostic Triage v0.3 ===');
console.log(`Total cases                        : ${summary.total}`);
console.log(`Tone exact                         : ${summary.tone_exact}/${summary.total}`);
console.log(`Tone disagreement                  : ${summary.tone_disagreement}`);
console.log(`AI low-chroma                      : ${summary.ai_low_chroma}`);
console.log(`Hue ontology refinement candidates : ${summary.ai_suggests_hue_ontology_refinement}`);
console.log(`Reliable Hue exact                 : ${summary.reliable_hue_exact}/${summary.reliable_hue_cases}`);
console.log(`Priority 1                         : ${summary.priority_1}`);
console.log(`Priority 2                         : ${summary.priority_2}`);
console.log(`Priority 3                         : ${summary.priority_3}`);
console.log('');
console.log('Gold promoted: 0');
console.log('Coverage anchors promoted: 0');
console.log('');
console.log(`Report: ${REPORT}`);
console.log(`Queue : ${QUEUE}`);
