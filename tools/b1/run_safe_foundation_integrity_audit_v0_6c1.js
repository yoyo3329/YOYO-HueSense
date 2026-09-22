#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const B=__dirname;const checks=[];
function read(f){try{return JSON.parse(fs.readFileSync(path.join(B,f),'utf8'))}catch{return null}}
function ex(f){return fs.existsSync(path.join(B,f))}
function ck(name,ok,detail=''){checks.push({name,pass:!!ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`)}
const baseAudit=read('safe_foundation_integrity_audit_v0_6c.json');
const line=read('calibration_lineage_manifest_v0_6c1.json');
const reg=read('cross_style_dataset_registry_v0_6c1.json');
['perceptual-label-contract-v0_2.js','perceptual-label-contract.contract.test.js','audit_calibration_lineage_v0_6c1.js','calibration_guard_policy_v0_6c1.json','build_cross_style_registry_v0_6c1.js'].forEach(f=>ck(`file exists: ${f}`,ex(f)));
ck('base v0.6C integrity PASS',baseAudit?.metadata?.status==='PASS');
ck('calibration lineage audit PASS with legacy quarantine',line?.metadata?.status==='PASS_WITH_LEGACY_QUARANTINE');
ck('legacy first-pass dataset remains historical-only',line?.sources?.find(x=>x.file==='calibration_set_v0_human.json')?.authority==='HISTORICAL_ONLY');
ck('legacy first-pass dataset is not cross-style eligible',line?.sources?.find(x=>x.file==='calibration_set_v0_human.json')?.cross_style_calibration_eligible===false);
ck('legacy raw is immutable',line?.sources?.find(x=>x.file==='calibration_set_v0_human.json')?.immutable===true);
ck('active v0.4 train satisfies new perceptual label schema',line?.invariants?.active_train_schema_pass===true);
ck('v0.5.2 holdout satisfies new perceptual label schema',line?.invariants?.holdout_schema_pass===true);
ck('holdout is not reused as training',line?.invariants?.holdout_reused_as_train===false);
ck('numeric features cannot auto-relabel humans',line?.invariants?.numeric_auto_relabel===false);
ck('legacy low-chroma inconsistencies are quarantined, not silently changed',(line?.legacy_review_candidates?.length||0)>0,`candidates=${line?.legacy_review_candidates?.length||0}`);
ck('cross-style structural registry v0.6C.1 built',reg?.metadata?.version==='0.6C.1');
ck('cross-style registry still makes no validation claim',reg?.metadata?.validation_claim==='NONE_CROSS_STYLE_YET');
ck('cross-style registry references perceptual label contract',reg?.metadata?.calibration_label_contract?.name==='YOYO Perceptual Label Contract'&&reg?.metadata?.calibration_label_contract?.version==='0.2.0');
ck('legacy calibration source explicitly quarantined in cross-style registry',reg?.metadata?.legacy_calibration_source==='QUARANTINED_HISTORICAL_ONLY');
const pass=checks.every(c=>c.pass),out={metadata:{name:'YOYO Safe Foundation Integrity Audit v0.6C.1',version:'0.6C.1',status:pass?'PASS':'FAIL'},summary:{checks:checks.length,passed:checks.filter(x=>x.pass).length},checks};
fs.writeFileSync(path.join(B,'safe_foundation_integrity_audit_v0_6c1.json'),JSON.stringify(out,null,2)+'\n');console.log(`\n${pass?'✅':'❌'} ${out.summary.passed}/${out.summary.checks} checks ${pass?'PASS':'not passed'}`);if(!pass)process.exit(1);
