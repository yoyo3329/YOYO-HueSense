'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');

const root=process.argv[2]||__dirname;
const qPath=path.join(root,'v0_8_1_controlled_train_queue.json');
const mPath=path.join(root,'v0_8_1_controlled_presentation_manifest.json');
const cPath=path.join(root,'v0_8_1_controlled_train_commitment.json');

const q=JSON.parse(fs.readFileSync(qPath,'utf8'));
const m=JSON.parse(fs.readFileSync(mPath,'utf8'));
const c=JSON.parse(fs.readFileSync(cPath,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

let pass=0,total=0;
function ck(cond,msg){
 total++;
 console.log((cond?'PASS  ':'FAIL  ')+msg);
 if(cond)pass++;
}

ck(q.cases.length===16,'case_count = 16');
const counts={}; for(const x of q.cases)counts[x.stratum]=(counts[x.stratum]||0)+1;
for(const s of ['LOW_LOW','LOW_MIDHIGH','MEDIUM_MEDIUM','MIDHIGH_HIGH'])ck(counts[s]===4,`${s} = 4`);
ck(new Set(q.cases.map(x=>x.pair_key)).size===16,'pair keys unique');
ck(q.metadata.prior_pilot_pairs_explicitly_excluded===true,'prior pilot pairs explicitly excluded');
ck(q.gamut_audit.selected_cases_all_srgb_safe===true,'all selected stimuli sRGB-safe');
ck(q.metadata.max_same_stratum_run<=2,'sequence guard max run <= 2');
ck(q.presentation_contract.neutral_surround_hex==='#777777','neutral surround = #777777');
ck(q.presentation_contract.initial_adaptation_ms===5000,'initial adaptation = 5000ms');
ck(q.presentation_contract.inter_stimulus_ms===600,'inter-stimulus interval = 600ms');
ck(q.presentation_contract.optional_lightness_interference_flag===true,'lightness-interference flag enabled');
ck(q.metadata.candidate_predictions_used_for_selection===false,'candidate predictions not used');
ck(q.metadata.historical_labels_used_for_selection===false,'historical answers not used');
ck(q.metadata.independent_validation_materialized===false,'independent validation not materialized');
ck(sha(qPath)===c.queue_sha256,'queue commitment SHA-256 exact match');
ck(sha(mPath)===c.presentation_manifest_sha256,'presentation manifest SHA-256 exact match');

console.log(`\n${pass}/${total} controlled Train16 gates ${pass===total?'PASS':'FAIL'}.`);
process.exit(pass===total?0:1);
