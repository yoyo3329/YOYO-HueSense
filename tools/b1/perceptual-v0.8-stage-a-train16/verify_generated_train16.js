'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.argv[2]||__dirname;
const qPath=path.join(root,'v0_8_stage_a_train_queue.json');
const cPath=path.join(root,'v0_8_stage_a_train_commitment.json');
const q=JSON.parse(fs.readFileSync(qPath,'utf8'));
const c=JSON.parse(fs.readFileSync(cPath,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

let ok=true;
function ck(cond,msg){
 console.log((cond?'PASS  ':'FAIL  ')+msg);
 if(!cond)ok=false;
}
ck(q.cases.length===16,'case_count = 16');
const counts={};
for(const x of q.cases)counts[x.stratum]=(counts[x.stratum]||0)+1;
for(const s of ['LOW_LOW','LOW_MIDHIGH','MEDIUM_MEDIUM','MIDHIGH_HIGH'])ck(counts[s]===4,`${s} = 4`);
ck(new Set(q.cases.map(x=>x.pair_key)).size===16,'pair keys unique');
ck(q.metadata.candidate_predictions_used_for_selection===false,'candidate predictions not used');
ck(q.metadata.retired_v0_7_validation_labels_used_for_selection===false,'retired v0.7 labels not used');
ck(q.metadata.independent_validation_materialized===false,'independent validation not materialized');
ck(sha(qPath)===c.queue_sha256,'queue commitment SHA-256 exact match');
console.log(ok?'\n7/7 generated Train16 gates PASS.':'\nGenerated Train16 gate FAIL.');
process.exit(ok?0:1);
