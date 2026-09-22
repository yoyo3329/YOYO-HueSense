#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Candidate = require('./color-relation-candidate-v0_5.js');

const INPUT = path.join(__dirname, 'y2k_color_mvp_b3_hierarchy.json');
const OUTPUT = path.join(__dirname, 'y2k_color_relation_graph_v0_5_candidate.json');

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const src = read(INPUT);
const sourceModes = src.modes || src.hierarchy?.modes || src.nodes;
if (!Array.isArray(sourceModes)) throw new Error('Could not find modes[] in B3 hierarchy.');

const graph = Candidate.buildRelationGraph(sourceModes);

// Carry B3 evidence metadata onto nodes without affecting relation math.
const evidenceMap = new Map(sourceModes.map(m => [m.mode_id || m.id, {
  evidence_tier: m?.classification?.evidence_tier || null,
  scope: m?.classification?.scope || null,
  role_candidates: m?.classification?.role_candidates || null,
  stability_grade: m?.robustness?.stability_grade || null,
  weighted_mass: m?.physical?.weighted_mass ?? null,
  image_support: m?.physical?.image_support ?? null,
}]));

graph.nodes = graph.nodes.map(n => ({ ...n, evidence: evidenceMap.get(n.mode_id) || null }));
graph.metadata.source_file = path.basename(INPUT);
graph.metadata.generated_by = path.basename(__filename);

fs.writeFileSync(OUTPUT, JSON.stringify(graph, null, 2) + '\n', 'utf8');

console.log('=== YOYO B3 Color Relation Graph v0.5 Candidate ===');
console.log(`Nodes : ${graph.node_count}`);
console.log(`Edges : ${graph.edge_count}`);
console.log(`Expected pairs: ${(graph.node_count * (graph.node_count - 1))/2}`);
console.log(`Output: ${OUTPUT}`);
