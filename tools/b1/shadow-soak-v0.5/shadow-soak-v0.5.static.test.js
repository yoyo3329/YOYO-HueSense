'use strict';

const fs = require('fs');
const path = require('path');

const Contract = require('./shadow-result-contract.js');
const Lifecycle = require('./shadow-job-lifecycle.js');
const Plan = require('./shadow-soak-plan-v0.5.js');
const Analysis = require('./shadow-soak-analysis-v0.5.js');
const Mapper = require('./shadow-b1-real-mapper.js');

let pass = 0, total = 0;
function assert(c, m) { if (!c) throw new Error(m); }
function check(name, fn) {
  total++;
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { console.error(`FAIL  ${name} — ${e.message}`); process.exitCode = 1; }
}

const b1 = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'y2k_color_mvp_b1_observations.json'),
  'utf8'
));
const nodes = Mapper.flattenPaletteNodes(b1);

check('real B1 fixture provides exactly 120 nodes', () => {
  assert(nodes.length === 120, `got ${nodes.length}`);
});

check('soak plan contains exactly 500 jobs', () => {
  const jobs = Array.from({ length: Plan.TOTAL_JOBS }, (_, i) => Plan.describeJob(i + 1));
  assert(jobs.length === 500, `got ${jobs.length}`);
});

check('warm-up/formal split is exactly 50 + 450', () => {
  assert(Plan.WARMUP_JOBS === 50, 'warmup != 50');
  assert(Plan.FORMAL_JOBS === 450, 'formal != 450');
  assert(Plan.WARMUP_JOBS + Plan.FORMAL_JOBS === 500, 'split != 500');
});

check('phase counts sum to 500', () => {
  assert(Plan.PHASES.reduce((s, p) => s + p.count, 0) === 500, 'phase total mismatch');
});

check('expected status counts are 375 completed / 75 aborted / 50 stale', () => {
  const counts = { COMPLETED: 0, ABORTED: 0, STALE: 0 };
  for (let i = 1; i <= 500; i++) {
    const s = Plan.describeJob(i).expected_status;
    counts[s] = (counts[s] || 0) + 1;
  }
  assert(counts.COMPLETED === 375, `completed ${counts.COMPLETED}`);
  assert(counts.ABORTED === 75, `aborted ${counts.ABORTED}`);
  assert(counts.STALE === 50, `stale ${counts.STALE}`);
});

check('DELTA phase is 25 chains of 4 jobs and each job projects 30 nodes', () => {
  const jobs = [];
  for (let i = 251; i <= 350; i++) jobs.push(Plan.describeJob(i));
  assert(jobs.length === 100, 'delta count mismatch');
  assert(jobs.every(j => j.expected_projection_touches === 30), 'delta touches not 30');
  assert(jobs.filter(j => j.delta_step === 0).length === 25, 'delta chain count != 25');
});

check('checkpoints are exactly 50..500 every 50', () => {
  assert(
    JSON.stringify(Plan.CHECKPOINTS) === JSON.stringify([50,100,150,200,250,300,350,400,450,500]),
    `bad checkpoints: ${JSON.stringify(Plan.CHECKPOINTS)}`
  );
});

check('job release instrumentation fires after refs are cleared', () => {
  let event = null;
  const context = {
    schema_version: '0.1.0',
    request_id: 'test_req',
    job_id: 'test_job',
    generation: 1,
    view_instance_id: 'view',
    route_key_digest: 'route:test',
    query_digest: 'q:test',
    filter_digest: 'f:none',
    branch: 'A',
    page: 1,
    batch: {
      mode: 'FULL',
      start_index: 0,
      end_index_exclusive: 0,
      total_results_seen: 0,
      base_shadow_snapshot_id: null
    }
  };
  const job = Lifecycle.createShadowJob({
    context,
    resultsRef: nodes,
    onRelease: e => { event = e; }
  });
  job.release();
  assert(event, 'release event missing');
  assert(event.results_ref_cleared === true, 'resultsRef not cleared before event');
  assert(event.projection_cleared === true, 'projection not cleared before event');
});

check('memory warning requires growth + last5 monotonic + positive slope', () => {
  const cp = [50,100,150,200,250,300,350,400,450,500].map((job, i) => ({
    job_index: job,
    heap_used_bytes: 5 * 1024 * 1024 + i * 3 * 1024 * 1024
  }));
  const a = Analysis.analyzeMemory(cp);
  assert(a.gate_pass === false, 'synthetic obvious growth should warn/fail gate');
});

check('stable/sawtooth heap passes memory heuristic', () => {
  const vals = [5,7,6,8,6.5,8.5,7,8.8,7.2,8.9];
  const cp = vals.map((m, i) => ({
    job_index: (i + 1) * 50,
    heap_used_bytes: m * 1024 * 1024
  }));
  const a = Analysis.analyzeMemory(cp);
  assert(a.gate_pass === true, 'sawtooth heap incorrectly failed');
});

check('HTML does not load production app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script\s+src=["']([^"']+)["']/gi)].map(m => m[1]);
  assert(!srcs.some(s => /(?:^|\/)app\.js(?:$|\?)/i.test(s)), 'production app.js loaded');
});

check('harness does not append per-job DOM log nodes', () => {
  const js = fs.readFileSync(path.join(__dirname, 'shadow-soak-harness-v0.5.js'), 'utf8');
  assert(!js.includes('.appendChild('), 'appendChild found; possible per-job DOM growth');
  assert(!js.includes('insertAdjacentHTML'), 'insertAdjacentHTML found; possible DOM growth');
});

check('Fake Candidate remains explicitly TEST ONLY', () => {
  const Candidate = require('./shadow-fake-candidate.js');
  assert(Candidate.TEST_ONLY === true, 'candidate TEST_ONLY flag missing');
});

console.log(`\n${pass}/${total} Shadow Soak v0.5 static checks ${pass === total ? 'PASS' : 'FAIL'}.`);
if (pass !== total) process.exit(1);
