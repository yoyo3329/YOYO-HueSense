 'use strict';
const fs=require('fs'),path=require('path');
const run=path.resolve(process.argv[2]||'.');
const sum=JSON.parse(fs.readFileSync(path.join(run,'extractor_summary.json'),'utf8'));
const obs=JSON.parse(fs.readFileSync(path.join(run,'atomic_region_observations.json'),'utf8'));
const graph=JSON.parse(fs.readFileSync(path.join(run,'region_relationship_graph.json'),'utf8'));
const audit=JSON.parse(fs.readFileSync(path.join(run,'physical_audit.json'),'utf8'));
let p=0,t=0;function ck(c,m){t++;console.log((c?'PASS  ':'FAIL  ')+m);if(c)p++;}
const regs=obs.images.flatMap(x=>x.atomic_regions),edges=graph.images.flatMap(x=>x.edges);
ck(sum.images_processed===24,'24/24 images processed');
ck(sum.destructive_merges_executed===0,'zero destructive merges');
ck(graph.destructive_merges_executed===0,'region graph confirms no destructive merge');
ck(regs.every(r=>r.atomic===true&&r.immutable===true),'all atomic regions immutable');
ck(regs.every(r=>r.diagnostics.score_semantics==='HEURISTIC_SCORE_NOT_PROBABILITY'),'scores explicitly non-probabilistic');
ck(regs.every(r=>Number.isFinite(r.diagnostics.scale_stability_score)),'scale stability present');
ck(regs.every(r=>Number.isFinite(r.diagnostics.perturbation_stability_score)),'perturbation stability present');
ck(edges.every(e=>e.destructive_merge_executed===false),'relationship edges never execute merge');
ck(edges.every(e=>e.evidence.semantic_mask_agreement===null),'semantic truth not fabricated');
ck(sum.style_graph_built===false,'Style Graph not built');
ck(sum.semantic_truth_claim===false,'no semantic/object truth claim');
ck(audit.destructive_merges_executed===0,'physical audit preserves provenance');
ck(edges.length===0 || edges.some(e=>e.evidence.oklab_delta>0.01),'relationship color deltas are not globally collapsed to zero');
ck(edges.length===0 || edges.some(e=>e.evidence.palette_impact_score>0),'palette impact is not globally collapsed to zero');

console.log(`\n${p}/${t} v0.8-A.1.1 output gates ${p===t?'PASS':'FAIL'}.`);process.exit(p===t?0:1);
