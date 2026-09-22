'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'); let pass=0,total=0;function ck(c,m){total++;console.log((c?'PASS  ':'FAIL  ')+m);if(c)pass++;}
const cfg=JSON.parse(fs.readFileSync(path.join(root,'config','stylecolor_v0_8a.config.json'),'utf8'));
ck(cfg.policy.no_generic_corpus===true,'Generic Corpus disabled in v0.8-A');
ck(cfg.policy.no_style_lift===true,'Style Lift disabled in v0.8-A');
ck(cfg.policy.no_npmi===true,'NPMI disabled in v0.8-A');
ck(cfg.policy.no_style_graph===true,'Style Graph disabled in v0.8-A');
ck(cfg.policy.no_hard_style_filter===true,'hard style filter disabled');
ck(cfg.region_proposal.semantic_segmentation_claim===false,'SLIC does not falsely claim semantic segmentation');
ck(cfg.clip.hard_threshold===false,'CLIP has no hard style threshold');
const runner=fs.readFileSync(path.join(root,'node','run_stylecolor_v0_8a.js'),'utf8');
ck(!runner.includes('public/js/app.js'),'runner contains no live app integration path');
ck(runner.includes("style_classification:null"),'candidate schema keeps style_classification null');
console.log(`\n${pass}/${total} static contract checks ${pass===total?'PASS':'FAIL'}`);process.exit(pass===total?0:1);
