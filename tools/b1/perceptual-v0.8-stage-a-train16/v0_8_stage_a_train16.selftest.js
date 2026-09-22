'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.argv[2] || __dirname;
const TMP = path.join(__dirname, '_selftest_output');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const gen = spawnSync(
  process.execPath,
  [path.join(__dirname, 'prepare_v0_8_stage_a_train16.js'), ROOT, TMP],
  { encoding: 'utf8' }
);
process.stdout.write(gen.stdout || '');
process.stderr.write(gen.stderr || '');
if (gen.status !== 0) process.exit(gen.status || 1);

const q = JSON.parse(fs.readFileSync(path.join(TMP,'v0_8_stage_a_train_queue.json'),'utf8'));
const c = JSON.parse(fs.readFileSync(path.join(TMP,'v0_8_stage_a_train_commitment.json'),'utf8'));

let pass=0,total=0;
function assert(x,m){if(!x)throw new Error(m)}
function check(name,fn){
 total++;
 try{fn();pass++;console.log('PASS  '+name)}
 catch(e){console.error('FAIL  '+name+' — '+e.message);process.exitCode=1}
}

check('exactly 16 fresh Train cases selected',()=>assert(q.cases.length===16,'count '+q.cases.length));

check('strata are exactly 4/4/4/4',()=>{
 const counts={};
 for(const x of q.cases) counts[x.stratum]=(counts[x.stratum]||0)+1;
 for(const s of ['LOW_LOW','LOW_MIDHIGH','MEDIUM_MEDIUM','MIDHIGH_HIGH']){
   assert(counts[s]===4, s+'='+counts[s]);
 }
});

check('all selected pair keys are unique',()=>{
 const a=q.cases.map(x=>x.pair_key);
 assert(new Set(a).size===a.length,'duplicates');
});

check('retired labels/predictions were not used for selection',()=>{
 assert(q.metadata.historical_labels_used_for_selection===false,'historical labels used');
 assert(q.metadata.retired_v0_7_validation_labels_used_for_selection===false,'retired validation used');
 assert(q.metadata.candidate_predictions_used_for_selection===false,'predictions used');
});

check('historical pairs are exclusion-only',()=>{
 assert(q.metadata.historical_pairs_used_only_as_exclusion_keys===true,'not exclusion-only');
 assert(q.historical_exclusion.unique_pair_count>0,'no historical exclusions found');
});

check('independent validation is NOT materialized',()=>{
 assert(q.metadata.independent_validation_materialized===false,'validation leaked early');
 assert(c.policy.validation_not_materialized===true,'commitment disagrees');
});

check('human UI hides numeric physical features and model outputs',()=>{
 const b=spawnSync(
   process.execPath,
   [path.join(__dirname,'build_v0_8_stage_a_blind_lab.js'),
    path.join(TMP,'v0_8_stage_a_train_queue.json'),
    path.join(TMP,'lab.html')],
   {encoding:'utf8'}
 );
 if(b.status!==0) throw new Error(b.stderr||'lab build failed');
 const html=fs.readFileSync(path.join(TMP,'lab.html'),'utf8');
 assert(!/selection_features/i.test(html),'selection features visible');
 assert(!/physical\\s*:/i.test(html),'physical numeric object visible');
 assert(!/mode_id.*題目/i.test(html),'mode IDs visible in visible text');
 assert(!/candidate_prediction|shadow_score|predicted_chroma/i.test(html),'algorithm output visible');
});

check('commitment hashes queue before human labels',()=>{
 assert(c.metadata.committed_before_human_labels===true,'commitment timing invalid');
 assert(typeof c.queue_sha256==='string'&&c.queue_sha256.length===64,'queue hash invalid');
 assert(c.case_count===16,'commitment count invalid');
});

console.log(`\n${pass}/${total} v0.8 Stage A Train16 checks ${pass===total?'PASS':'FAIL'}.`);
if(pass!==total)process.exit(1);
