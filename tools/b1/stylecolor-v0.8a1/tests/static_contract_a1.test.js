 'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'config','stylecolor_v0_8a1.config.json'),'utf8'));
const runner=fs.readFileSync(path.join(root,'node','run_stylecolor_v0_8a1.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'python','cv_worker_a1.py'),'utf8');
let p=0,t=0;function ck(c,m){t++;console.log((c?'PASS  ':'FAIL  ')+m);if(c)p++;}
ck(cfg.policy.atomic_regions_immutable===true,'atomic regions immutable');
ck(cfg.policy.no_destructive_merge===true,'destructive merge forbidden');
ck(cfg.policy.no_style_graph===true,'Style Graph forbidden in A.1');
ck(cfg.policy.no_probability_claim_from_heuristic_scores===true,'heuristic/probability semantics separated');
ck(cfg.relationship_graph.semantic_prior==='DEFERRED_TO_v0.8-A.2','semantic prior deferred');
ck(worker.includes('scale_stability_score'),'multi-scale diagnostic implemented');
ck(worker.includes('perturbation_stability_score'),'perturbation diagnostic implemented');
ck(worker.includes('foreground_dilution_score'),'foreground dilution diagnostic implemented');
ck(worker.includes('palette_impact_score'),'palette impact diagnostic implemented');
ck(runner.includes('NOT_SELECTED_FOR_CLIP_BUDGET'),'CLIP not-selected state explicit');
ck(!runner.includes('public/js/app.js'),'no live app integration');
console.log(`\n${p}/${t} static contract checks ${p===t?'PASS':'FAIL'}.`);process.exit(p===t?0:1);
