'use strict';
const fs=require('fs'),path=require('path');
const run=path.resolve(process.argv[2]||'.');
let ok=0,total=0; function ck(c,m){total++;console.log((c?'PASS  ':'FAIL  ')+m);if(c)ok++;}
const must=['run_manifest.json','source_manifest.json','region_observations.json','style_color_candidates.json','extractor_summary.json','audit.html'];
for(const f of must)ck(fs.existsSync(path.join(run,f)),`file exists: ${f}`);
if(fs.existsSync(path.join(run,'extractor_summary.json'))){const s=JSON.parse(fs.readFileSync(path.join(run,'extractor_summary.json'),'utf8'));ck(s.images_processed>0,'at least one image processed');ck(s.regions_total>0,'regions produced');ck(s.candidates_total>0,'color candidates produced');ck(s.hard_style_classifications===0,'no hard STYLE/NOT_STYLE classifications');ck(s.semantic_segmentation_claim===false,'no false semantic segmentation claim');}
ck(!fs.existsSync(path.join(run,'app.js')),'production app.js not copied into run');
console.log(`\n${ok}/${total} output gates ${ok===total?'PASS':'FAIL'}`);process.exit(ok===total?0:1);
