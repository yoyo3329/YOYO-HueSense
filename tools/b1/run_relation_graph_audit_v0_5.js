#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const GRAPH = path.join(__dirname, 'y2k_color_relation_graph_v0_5_candidate.json');
const OUTPUT = path.join(__dirname, 'relation_graph_audit_v0_5.json');

const g = JSON.parse(fs.readFileSync(GRAPH,'utf8'));

const hueApp = { reliable:0, low_chroma:0 };
const hueRel = { same_or_adjacent:0, different:0, not_applicable:0 };
const tone = { similar:0, similar_or_partial:0, different:0 };
let hueAppBoundary=0, hueRelBoundary=0, toneBoundary=0;
const boundaryExamples = { hue_applicability:[], hue_relation:[], tone:[] };

for (const e of g.edges) {
  const p = e.perceptual_relations_candidate_v0_5;
  hueApp[p.hue_applicability] = (hueApp[p.hue_applicability]||0)+1;
  hueRel[p.hue_relation] = (hueRel[p.hue_relation]||0)+1;
  tone[p.tone_relation] = (tone[p.tone_relation]||0)+1;

  if (p.hue_applicability_margin_chroma < 0.005) {
    hueAppBoundary += 1;
    if (boundaryExamples.hue_applicability.length < 20) boundaryExamples.hue_applicability.push(e.pair_key);
  }
  if (p.hue_relation_margin_degrees !== null && p.hue_relation_margin_degrees < 10) {
    hueRelBoundary += 1;
    if (boundaryExamples.hue_relation.length < 20) boundaryExamples.hue_relation.push(e.pair_key);
  }
  if (!p.tone_near_match && p.tone_different_margin < 0.05) {
    toneBoundary += 1;
    if (boundaryExamples.tone.length < 20) boundaryExamples.tone.push(e.pair_key);
  }
}

const out = {
  metadata: {
    name:'YOYO Relation Graph Audit v0.5',
    version:'0.5.0',
    status:'candidate_distribution_audit',
    source:path.basename(GRAPH),
    note:'Boundary counts are audit signals, not automatic errors.',
  },
  graph: { nodes:g.node_count, edges:g.edge_count },
  distributions: { hue_applicability:hueApp, hue_relation:hueRel, tone_relation:tone },
  boundary_audit: {
    hue_applicability_margin_lt_0_005: hueAppBoundary,
    hue_relation_margin_lt_10_degrees: hueRelBoundary,
    tone_different_margin_lt_0_05: toneBoundary,
    examples: boundaryExamples,
  },
};
fs.writeFileSync(OUTPUT,JSON.stringify(out,null,2)+'\n','utf8');

console.log('=== YOYO Relation Graph Audit v0.5 ===');
console.log(`Edges              : ${g.edge_count}`);
console.log(`Hue reliable       : ${hueApp.reliable}`);
console.log(`Hue low-chroma     : ${hueApp.low_chroma}`);
console.log(`Hue same/adjacent  : ${hueRel.same_or_adjacent}`);
console.log(`Hue different      : ${hueRel.different}`);
console.log(`Tone similar       : ${tone.similar}`);
console.log(`Tone partial       : ${tone.similar_or_partial}`);
console.log(`Tone different     : ${tone.different}`);
console.log(`Hue-app boundary   : ${hueAppBoundary}`);
console.log(`Hue-rel boundary   : ${hueRelBoundary}`);
console.log(`Tone boundary      : ${toneBoundary}`);
console.log(`Output: ${OUTPUT}`);
