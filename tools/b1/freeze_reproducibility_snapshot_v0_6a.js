#!/usr/bin/env node
'use strict'; const fs=require('fs'),path=require('path'),crypto=require('crypto'); const B=__dirname;
const files=['y2k_color_mvp_evaluation_set_v1.json','y2k_color_mvp_b1_observations.json','y2k_color_mvp_b2_aggregation.json','y2k_color_mvp_b3_hierarchy.json','y2k_color_relation_graph.json','color-relation-core.js','tone-core.js','gold_train_candidate_v0_4.json','gold_holdout_queue_v0_5.json','relation_formula_candidate_config_v0_5.json'];
const rows=[]; for(const f of files){const p=path.join(B,f); if(!fs.existsSync(p))continue;const buf=fs.readFileSync(p);rows.push({file:f,bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex')});}
const out={metadata:{name:'YOYO Reproducibility Snapshot',version:'0.6A',created_at:new Date().toISOString(),purpose:'Freeze deterministic inputs before further human calibration.'},files:rows};
fs.writeFileSync(path.join(B,'reproducibility_snapshot_v0_6a.json'),JSON.stringify(out,null,2)+'\n'); console.log(`Snapshot: ${rows.length} files hashed.`);
