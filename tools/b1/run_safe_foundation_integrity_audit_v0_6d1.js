#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const B=__dirname;
function r(f){try{return JSON.parse(fs.readFileSync(path.join(B,f),'utf8'))}catch{return null}}
const checks=[];function c(id,pass,detail=null){checks.push({id,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'}  ${id}${detail?' — '+detail:''}`)}
const d=r('safe_foundation_integrity_audit_v0_6d.json');
const debt=r('perceptual_validation_debt_v0_6d1.json');
const line=r('calibration_lineage_manifest_v0_6c1.json');
const legacy=r('legacy_low_chroma_review_candidates_v0_6c1.json');
const net=r('network_sandbox_policy_v0_6d1.json');
const pkg=fs.readFileSync(path.join(B,'run_b1_status.js'),'utf8');
c('v0.6D prior integrity remains PASS',d?.metadata?.status==='PASS'&&d?.summary?.fail===0);
c('holdout debt evidence exists',!!debt);
c('v0.5 holdout explicitly failed boundary stress',debt?.v0_5_candidate?.holdout_status==='BOUNDARY_CONTRADICTION_FOUND');
c('v0.5 Tone score recorded as 2/9',debt?.v0_5_candidate?.tone?.correct===2&&debt?.v0_5_candidate?.tone?.total===9);
c('v0.5 reliable Hue recorded as 6/6',debt?.v0_5_candidate?.hue_relation_reliable?.correct===6&&debt?.v0_5_candidate?.hue_relation_reliable?.total===6);
c('v0.5 high-confidence contradictions recorded as 7/9',debt?.v0_5_candidate?.high_confidence_contradictions?.count===7&&debt?.v0_5_candidate?.high_confidence_contradictions?.total===9);
c('perceptual candidate promotion blocked',debt?.v0_5_candidate?.blocks?.perceptual_candidate_promotion===true);
c('v0.6D ingestion closure is scoped, not product readiness',debt?.v0_5_candidate?.blocks?.v0_6d_ingestion_infrastructure_closure===false);
c('legacy quarantine threshold is 0.01 heuristic',legacy?.metadata?.threshold===0.01&&legacy?.metadata?.threshold_role==='REVIEW_HEURISTIC_NOT_PRODUCTION');
const ids=(legacy?.cases||[]).map(x=>x.case_id).sort();
c('legacy quarantine has exactly five cases',ids.length===5,ids.join(','));
c('case_018 is intentionally outside the C<=0.01 review heuristic',!ids.includes('CAL_Y2K_018'));
const train=(line?.sources||[]).find(x=>x.file==='gold_train_candidate_v0_4.json');
const hold=(line?.sources||[]).find(x=>x.file==='gold_holdout_human_v0_5_2.json');
c('active train provenance remains AI-assisted human-approved',train?.authority==='HUMAN_APPROVED_AI_ASSISTED');
c('active train is not an independent holdout',train?.independent_holdout===false);
c('holdout authority remains independent at collection time',hold?.authority==='INDEPENDENT_AT_COLLECTION_TIME');
c('holdout remains training-ineligible',hold?.training_eligible===false);
c('network sandbox is replay-only for deterministic tests',net?.deterministic_tests?.network_access===false&&net?.deterministic_tests?.transport==='REPLAY_ONLY');
c('live capture is isolated',net?.live_capture?.isolated_from_deterministic_pipeline===true);
c('live capture cannot mutate frozen fixture',net?.live_capture?.may_mutate_existing_fixture===false);
c('network failure fixtures include 404/429/timeout/malformed',['HTTP_404','HTTP_429','TIMEOUT','MALFORMED_PAYLOAD'].every(x=>(net?.failure_fixtures||[]).includes(x)));
c('status script does not fabricate BOUNDARY_CONTRADICTION_FOUND fallback',!pkg.includes("||'BOUNDARY_CONTRADICTION_FOUND'")&&!pkg.includes('||\"BOUNDARY_CONTRADICTION_FOUND\"'));
const fail=checks.filter(x=>!x.pass).length;
const out={metadata:{name:'YOYO v0.6D.1 Governance / v0.6E Precondition Audit',version:'0.6D.1',status:fail?'FAIL':'PASS'},summary:{pass:checks.length-fail,total:checks.length,fail},checks};
fs.writeFileSync(path.join(B,'safe_foundation_integrity_audit_v0_6d1.json'),JSON.stringify(out,null,2)+'\n');
console.log(`\n${checks.length-fail}/${checks.length} checks ${fail?'FAIL':'PASS'}`);
if(fail)process.exit(1);
