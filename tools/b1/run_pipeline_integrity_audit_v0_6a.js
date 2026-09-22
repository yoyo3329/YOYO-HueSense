#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const B=__dirname;
const checks=[]; let failed=0;
function ok(name,cond,detail=''){ checks.push({name,pass:!!cond,detail}); if(!cond) failed++; console.log(`${cond?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`); }
function read(name){ const p=path.join(B,name); ok(`file exists: ${name}`,fs.existsSync(p)); if(!fs.existsSync(p)) return null; try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){ok(`JSON parse: ${name}`,false,e.message);return null}}
function finite(v){return typeof v==='number'&&Number.isFinite(v)}
function pairKey(a,b){return [a,b].sort().join('||')}
console.log('=== YOYO Deterministic Integrity Audit v0.6A ===');
const b1=read('y2k_color_mvp_b1_observations.json');
const b2=read('y2k_color_mvp_b2_aggregation.json');
const b3=read('y2k_color_mvp_b3_hierarchy.json');
const g=read('y2k_color_relation_graph.json');
const cg=read('y2k_color_relation_graph_v0_5_candidate.json');
const train=read('gold_train_candidate_v0_4.json');
const holdq=read('gold_holdout_queue_v0_5.json');
const ai=read('calibration_retest_v0_3_ai_completed.json');

if(b1) ok('B1 fixed evaluation count = 24',Array.isArray(b1.items)&&b1.items.length===24,`got ${b1.items?.length}`);
if(b2) ok('B2 physical modes = 53',Array.isArray(b2.color_modes)&&b2.color_modes.length===53,`got ${b2.color_modes?.length}`);
if(b3) ok('B3-A modes = 53',Array.isArray(b3.modes)&&b3.modes.length===53,`got ${b3.modes?.length}`);

function auditGraph(label,graph){
 if(!graph) return;
 const nodes=graph.nodes||[], edges=graph.edges||[];
 const ids=new Set(nodes.map(n=>n.id||n.mode_id));
 ok(`${label}: node count self-consistent`,graph.node_count===nodes.length,`${graph.node_count}/${nodes.length}`);
 ok(`${label}: edge count self-consistent`,graph.edge_count===edges.length,`${graph.edge_count}/${edges.length}`);
 ok(`${label}: complete pair count n(n-1)/2`,edges.length===nodes.length*(nodes.length-1)/2,`got ${edges.length}`);
 ok(`${label}: unique node ids`,ids.size===nodes.length);
 const pairs=new Set(); let dup=0,self=0,missing=0,badNum=0;
 for(const e of edges){
   const a=e.a?.id,b=e.b?.id; const k=pairKey(a,b); if(pairs.has(k))dup++; pairs.add(k); if(a===b)self++; if(!ids.has(a)||!ids.has(b))missing++;
   const p=e.physical_relations||{}; for(const x of ['delta_L','delta_C','hue_chord','min_chroma','max_chroma']) if(!finite(p[x])) badNum++;
 }
 ok(`${label}: no duplicate pairs`,dup===0,`duplicates=${dup}`);
 ok(`${label}: no self edges`,self===0,`self=${self}`);
 ok(`${label}: every edge references existing nodes`,missing===0,`missing=${missing}`);
 ok(`${label}: physical relation numbers finite`,badNum===0,`bad=${badNum}`);
}
auditGraph('base relation graph',g); auditGraph('v0.5 candidate graph',cg);
if(g&&cg){
 ok('candidate graph preserves node count',g.nodes.length===cg.nodes.length);
 ok('candidate graph preserves edge count',g.edges.length===cg.edges.length);
 const bp=new Set(g.edges.map(e=>e.pair_key)); const cp=new Set(cg.edges.map(e=>e.pair_key));
 ok('candidate graph preserves exact pair universe',bp.size===cp.size&&[...bp].every(x=>cp.has(x)));
}
if(train&&holdq){
 const tr=new Set((train.cases||[]).map(c=>pairKey(c.a.mode_id,c.b.mode_id)));
 const ho=new Set((holdq.cases||[]).map(c=>pairKey(c.a.mode_id,c.b.mode_id)));
 const overlap=[...ho].filter(x=>tr.has(x));
 ok('Train / v0.5 holdout pair overlap = 0',overlap.length===0,`overlap=${overlap.length}`);
 ok('Train has 20 cases',(train.cases||[]).length===20,`got ${(train.cases||[]).length}`);
 ok('Holdout queue has 9 cases',(holdq.cases||[]).length===9,`got ${(holdq.cases||[]).length}`);
}
if(ai){
 const status=String(ai.metadata?.status||'').toLowerCase();
 ok('AI retest provenance remains explicitly AI',status.includes('ai')||String(ai.metadata?.label_source||'').toLowerCase().includes('gpt'),`status=${ai.metadata?.status}`);
}
const report={metadata:{name:'YOYO Deterministic Integrity Audit',version:'0.6A',status:failed?'FAIL':'PASS',note:'No human semantic judgment is performed by this audit.'},summary:{checks:checks.length,passed:checks.length-failed,failed},checks};
fs.writeFileSync(path.join(B,'pipeline_integrity_audit_v0_6a.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\n${failed?'❌':'✅'} ${checks.length-failed}/${checks.length} checks PASS`); if(failed)process.exit(1);
