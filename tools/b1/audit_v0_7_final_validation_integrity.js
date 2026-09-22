#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const U=require('./v0_7_common.js');
const B=__dirname;
const checks=[];
function c(id,pass,detail=''){checks.push({id,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'}  ${id}${detail?' — '+detail:''}`)}
const d=U.read('v0_7_validation_human.json');
const q=U.read('v0_7_validation_queue.json');
const commit=U.read('v0_7_validation_commitment.json');
const freeze=U.read('v0_7_candidate_freeze.json');
const report=U.read('v0_7_independent_validation_report.json');
const retire=U.read('v0_7_validation_retirement_manifest.json');
const train=U.read('v0_7_train_human.json');

const dp=d.cases.map(x=>x.pair_key);
const qp=q.cases.map(x=>x.pair_key);
const tp=new Set(train.cases.map(x=>x.pair_key));
c('validation authority DIRECT_HUMAN_BLIND',d.metadata?.authority==='DIRECT_HUMAN_BLIND');
c('validation AI assistance false',d.metadata?.ai_assistance===false);
c('validation algorithm outputs hidden',d.metadata?.algorithm_outputs_hidden===true);
c('validation has exactly 12 cases',d.cases.length===12);
c('validation pair order exactly matches materialized queue',JSON.stringify(dp)===JSON.stringify(qp));
c('validation pair digest matches pre-train commitment',U.sha([...dp].sort().join('\n'))===commit.validation_pair_digest);
c('train/validation overlap is zero',dp.every(x=>!tp.has(x)));
c('candidate config hash unchanged',U.fileSha('perceptual_relation_candidate_config_v0_7.json')===freeze.candidate_config_sha256);
c('candidate code hash unchanged',U.fileSha('perceptual-relation-candidate-v0_7.js')===freeze.candidate_code_sha256);
c('train labels hash unchanged',U.fileSha('v0_7_train_human.json')===freeze.train_labels_sha256);
c('validation exported after freeze',Date.parse(d.metadata.exported_at)>=Date.parse(freeze.frozen_at));
c('report says commitment verified',report.metadata?.validation_commitment_verified===true);
c('report says no validation retuning',report.metadata?.validation_labels_used_for_retuning===false);
c('report production gate remains false',report.metadata?.production_gate_eligible===false);
c('report universality remains UNVALIDATED',report.metadata?.universality_status==='UNVALIDATED');
c('retirement blocks training',retire.metadata?.training_eligible===false);
c('retirement blocks threshold tuning',retire.metadata?.threshold_tuning_eligible===false);
c('retirement blocks formula selection',retire.metadata?.formula_selection_eligible===false);
c('retirement blocks reuse as independent validation',retire.metadata?.future_independent_validation_eligible===false);

const gatePass=Object.values(report.gate_checks||{}).every(Boolean);
c('report status matches preregistered gate',
  report.metadata.status===(gatePass?'PILOT_PASS_NOT_PRODUCTION_READY':'PILOT_FAIL_REDESIGN_REQUIRED'));

const fail=checks.filter(x=>!x.pass).length;
const out={
  metadata:{name:'YOYO v0.7.0b Final Validation Integrity Audit',version:'0.7.0b',status:fail?'FAIL':'PASS'},
  summary:{pass:checks.length-fail,total:checks.length,fail},
  result_status:report.metadata.status,
  checks
};
U.write('v0_7_final_validation_integrity_audit.json',out);
console.log(`\n${checks.length-fail}/${checks.length} checks ${fail?'FAIL':'PASS'}`);
if(fail) process.exit(1);
