'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, total = 0;
function assert(c, m) { if (!c) throw new Error(m); }
function check(name, fn) {
  total++;
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { console.error(`FAIL  ${name} — ${e.message}`); process.exitCode = 1; }
}

const val = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'retired_v0_7_validation_human.json'), 'utf8'
));
const policy = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'v0_8_stage_a_policy.json'), 'utf8'
));
const builder = fs.readFileSync(
  path.join(__dirname, 'build_v0_8_failure_taxonomy_chroma.js'), 'utf8'
);

check('retired validation has exactly 12 cases', () => {
  assert(val.cases.length === 12, `got ${val.cases.length}`);
});

check('retired validation authority is preserved as direct-human blind historical evidence', () => {
  assert(val.metadata.authority === 'DIRECT_HUMAN_BLIND', 'authority changed');
  assert(val.metadata.ai_assistance === false, 'ai_assistance changed');
  assert(val.metadata.algorithm_outputs_hidden === true, 'blinding changed');
});

check('retired validation is explicitly failure-taxonomy-only', () => {
  assert(
    val.metadata.retirement.allowed_use.length === 1 &&
    val.metadata.retirement.allowed_use[0] === 'FAILURE_TAXONOMY_ONLY',
    'retired use policy invalid'
  );
});

check('retired validation is forbidden for training/tuning/model selection', () => {
  const f = new Set(val.metadata.retirement.forbidden_use);
  for (const x of ['TRAINING','THRESHOLD_TUNING','FORMULA_SELECTION','MODEL_SELECTION','INDEPENDENT_VALIDATION_REUSE']) {
    assert(f.has(x), `missing forbidden use ${x}`);
  }
});

check('Stage A freezes hue/hue applicability/lightness baseline', () => {
  assert(policy.frozen_axes_for_stage_a_round_1.hue_relation === 'FROZEN', 'Hue not frozen');
  assert(policy.frozen_axes_for_stage_a_round_1.hue_applicability === 'FROZEN', 'Hue applicability not frozen');
  assert(policy.frozen_axes_for_stage_a_round_1.lightness_relation === 'FROZEN_BASELINE', 'Lightness not frozen');
});

check('Chroma is the only primary redesign axis in Stage A round 1', () => {
  assert(policy.frozen_axes_for_stage_a_round_1.chroma_relation === 'PRIMARY_REDESIGN_AXIS', 'Chroma axis invalid');
});

check('complexity budget forbids case/mode/style-specific rules', () => {
  const f = new Set(policy.complexity_budget.forbidden);
  assert(f.has('case_id_specific_rules'), 'case-specific not forbidden');
  assert(f.has('mode_id_specific_rules'), 'mode-specific not forbidden');
  assert(f.has('style_specific_rules'), 'style-specific not forbidden');
  assert(f.has('Y2K_specific_rules'), 'Y2K-specific not forbidden');
});

check('taxonomy builder contains no numeric tuning threshold generation', () => {
  assert(!/optimi[sz]e|grid.?search|best.?threshold|fit.?threshold/i.test(builder), 'tuning logic found');
});

check('taxonomy builder only classifies prediction vs retired human label', () => {
  assert(builder.includes('CHROMA_OVER_SEPARATION'), 'over-separation taxonomy missing');
  assert(builder.includes('CHROMA_UNDER_SEPARATION'), 'under-separation taxonomy missing');
  assert(builder.includes("thresholds_generated: false"), 'threshold guard missing');
  assert(builder.includes("model_selected: false"), 'model-selection guard missing');
});

check('fresh Stage A train target remains 12-16 direct-human blind', () => {
  assert(policy.fresh_stage_a_train_target.includes('12-16'), 'fresh train size changed');
  assert(policy.fresh_stage_a_train_target.includes('DIRECT_HUMAN_BLIND'), 'authority missing');
});

console.log(`\n${pass}/${total} v0.8 Stage A Prep checks ${pass === total ? 'PASS' : 'FAIL'}.`);
if (pass !== total) process.exit(1);
