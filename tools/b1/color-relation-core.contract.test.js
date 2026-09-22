'use strict';

const assert = require('assert');
const Core = require('./color-relation-core.js');

function mode(id, L, C, H, a = 0, b = 0) {
  return {
    mode_id: id,
    physical: {
      centroid_hex: '#808080',
      centroid_lab: { L, a, b },
      centroid_lch: { L, C, H },
    },
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

test('contract is style-agnostic and universality not overclaimed', () => {
  assert.strictEqual(Core.CONTRACT.engineScope, 'style_agnostic');
  assert.strictEqual(Core.CONTRACT.validationScope, 'Y2K_only');
  assert.strictEqual(Core.CONTRACT.universalityStatus, 'unvalidated');
});

test('pair relation is symmetric', () => {
  const a = mode('a', 0.5, 0.08, 20, 0.05, 0.03);
  const b = mode('b', 0.6, 0.12, 300, 0.03, -0.08);
  const ab = Core.computePairRelation(a, b);
  const ba = Core.computePairRelation(b, a);
  assert.deepStrictEqual(ab.physical_relations, ba.physical_relations);
  assert.deepStrictEqual(ab.perceptual_relations_provisional, ba.perceptual_relations_provisional);
});

test('circular hue difference uses shortest arc', () => {
  assert.strictEqual(Core.circularHueDifference(350, 10), 20);
  assert.strictEqual(Core.circularHueDifference(10, 190), 180);
});

test('low chroma strongly suppresses hue reliability', () => {
  const low = Core.pairHueReliability(0.0055, 0.035);
  const high = Core.pairHueReliability(0.08, 0.10);
  assert.ok(low < 0.1, `expected low reliability, got ${low}`);
  assert.ok(high > 0.95, `expected high reliability, got ${high}`);
});

test('hue chord is small if one side is nearly achromatic', () => {
  const weak = Core.hueChord(0.001, 0.12, 170);
  const strong = Core.hueChord(0.12, 0.12, 170);
  assert.ok(weak < strong * 0.2);
});

test('same chroma gives chroma similarity 1', () => {
  assert.ok(Math.abs(Core.chromaSimilarity(0.1, 0.1) - 1) < 1e-12);
});

test('all provisional similarities remain bounded', () => {
  const r = Core.computePairRelation(
    mode('a', 0.05, 0.001, 10, 0.001, 0),
    mode('b', 0.95, 0.30, 200, -0.2, 0.1),
  );

  for (const [key, value] of Object.entries(r.perceptual_relations_provisional)) {
    if (key === 'hue_evidence_signed') {
      assert.ok(value >= -1 && value <= 1, `${key} out of range: ${value}`);
    } else if (value !== null) {
      assert.ok(value >= 0 && value <= 1, `${key} out of range: ${value}`);
    }
  }
});

test('graph pair count is n*(n-1)/2', () => {
  const modes = [
    mode('a', 0.2, 0.02, 10),
    mode('b', 0.4, 0.04, 20),
    mode('c', 0.6, 0.06, 30),
    mode('d', 0.8, 0.08, 40),
  ];
  const graph = Core.buildRelationGraph(modes);
  assert.strictEqual(graph.edge_count, 6);
});

console.log(`\n${passed}/8 ColorRelationCore contract tests PASS.`);
