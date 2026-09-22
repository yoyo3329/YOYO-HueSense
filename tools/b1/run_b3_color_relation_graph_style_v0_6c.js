'use strict';

const fs = require('fs');
const path = require('path');
const Core = require('./color-relation-core-standalone-v0_6c.js');

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const INPUT = path.resolve(__dirname, argValue('--input', 'y2k_color_mvp_b3_hierarchy.json'));
const OUTPUT = path.resolve(__dirname, argValue('--output', 'y2k_color_relation_graph.json'));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const b3 = readJSON(INPUT);
  if (!Array.isArray(b3.modes)) {
    throw new Error('Expected input.modes array.');
  }

  const graph = Core.buildRelationGraph(b3.modes);

  graph.metadata.source_file = path.basename(INPUT);
  graph.metadata.source_step = b3?.metadata?.step || null;
  graph.metadata.source_profile_version = b3?.metadata?.version || null;
  graph.metadata.generated_by = 'run_b3_color_relation_graph.js';
  graph.metadata.relation_semantics = {
    physical_relations: 'objective/deterministic',
    perceptual_relations_provisional: 'provisional formulas; must be calibrated before production gating',
    coverage_features: 'objective pair feature vector for calibration coverage experiments',
  };

  const evidenceById = new Map(
    b3.modes.map((m) => [
      m.mode_id,
      {
        evidence_tier: m?.classification?.evidence_tier || null,
        scope: m?.classification?.scope || null,
        role_candidates: m?.classification?.role_candidates || null,
        stability_grade: m?.robustness?.stability_grade || null,
        weighted_mass: m?.physical?.weighted_mass ?? null,
        image_support: m?.physical?.image_support ?? null,
      },
    ]),
  );

  graph.nodes = graph.nodes.map((node) => ({
    ...node,
    evidence: evidenceById.get(node.mode_id) || null,
  }));

  fs.writeFileSync(OUTPUT, JSON.stringify(graph, null, 2) + '\n', 'utf8');

  console.log('=== YOYO B3 Color Relation Graph ===');
  console.log(`Input : ${INPUT}`);
  console.log(`Nodes : ${graph.node_count}`);
  console.log(`Edges : ${graph.edge_count}`);
  console.log(`Expected pairs: ${graph.node_count * (graph.node_count - 1) / 2}`);
  console.log(`Output: ${OUTPUT}`);

  if (graph.edge_count !== graph.node_count * (graph.node_count - 1) / 2) {
    throw new Error('Pair count invariant failed.');
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
