#!/usr/bin/env node
'use strict';

const fs=require('fs'),path=require('path');
const U=require('./v0_7_common.js');
const C=require('./perceptual-relation-contract-v0_7.js');

const src=process.argv[2];
if(!src) throw new Error('Usage: node verify_and_import_v0_7_validation.js <validation-json>');
if(!fs.existsSync(src)) throw new Error(`Validation JSON not found: ${src}`);

const d=JSON.parse(fs.readFileSync(src,'utf8'));
C.assertDirectHumanDataset(d,'INDEPENDENT_VALIDATION');
if(d.cases.length!==12) throw new Error('Expected exactly 12 validation cases');

const freeze=U.read('v0_7_candidate_freeze.json');
const q=U.read('v0_7_validation_queue.json');
const commit=U.read('v0_7_validation_commitment.json');

if(U.fileSha('perceptual_relation_candidate_config_v0_7.json')!==freeze.candidate_config_sha256)
  throw new Error('Candidate config hash differs from freeze');
if(U.fileSha('perceptual-relation-candidate-v0_7.js')!==freeze.candidate_code_sha256)
  throw new Error('Candidate code hash differs from freeze');
if(U.fileSha('v0_7_train_human.json')!==freeze.train_labels_sha256)
  throw new Error('Train labels hash differs from freeze');

const qDigest=U.sha(q.cases.map(x=>x.pair_key).sort().join('\n'));
const dDigest=U.sha(d.cases.map(x=>x.pair_key).sort().join('\n'));
if(qDigest!==commit.validation_pair_digest) throw new Error('Local validation queue != pre-train commitment');
if(dDigest!==commit.validation_pair_digest) throw new Error('Uploaded validation JSON != pre-train commitment');

for(let i=0;i<12;i++){
  const a=d.cases[i],b=q.cases[i];
  if(a.case_id!==b.case_id||a.pair_key!==b.pair_key||
     a.a?.mode_id!==b.a?.mode_id||a.b?.mode_id!==b.b?.mode_id||
     a.a?.hex!==b.a?.hex||a.b?.hex!==b.b?.hex)
    throw new Error(`Exact validation case mismatch at index ${i}`);
}

if(Date.parse(d.metadata.exported_at)<Date.parse(freeze.frozen_at))
  throw new Error('Validation export predates candidate freeze');

const target=path.join(__dirname,'v0_7_validation_human.json');
if(fs.existsSync(target)){
  const oldSha=U.fileSha('v0_7_validation_human.json');
  const newSha=U.sha(fs.readFileSync(src));
  if(oldSha!==newSha) throw new Error('A different validation human file already exists; refusing overwrite');
  console.log('Validation JSON already imported with identical SHA-256; preserving.');
}else{
  fs.copyFileSync(src,target);
  console.log('Validation JSON commitment verified and imported.');
}
console.log(`Validation SHA-256: ${U.fileSha('v0_7_validation_human.json')}`);
