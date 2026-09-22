'use strict';

const Contract = require('./shadow-result-contract.js');
const Lifecycle = require('./shadow-job-lifecycle.js');
const Projection = require('./shadow-projection.js');
const Scheduler = require('./shadow-scheduler.js');

let passed = 0;
let total = 0;

async function check(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name} — ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}

function assert(c, m) {
  if (!c) throw new Error(m);
}

function ctx(overrides = {}) {
  return {
    schema_version: '0.1.0',
    request_id: 'req_1',
    job_id: 'job_1',
    generation: 1,
    view_instance_id: 'view_search_1',
    route_key_digest: 'route:search',
    query_digest: 'query:y2k',
    filter_digest: 'filters:none',
    branch: 'A',
    page: 1,
    batch: {
      mode: 'FULL',
      start_index: 0,
      end_index_exclusive: 3,
      total_results_seen: 3,
      base_shadow_snapshot_id: null
    },
    ...overrides
  };
}

function makeResults(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `img_${i}`,
    clipScore: 0.8 - i / 1000,
    colorFeatures: {
      L: 0.2 + (i % 10) / 20,
      C: 0.03 + (i % 7) / 100,
      H: (i * 17) % 360
    },
    hugeUnusedPayload: 'x'.repeat(10)
  }));
}

function accessors(counter = null) {
  return {
    getResultId(raw, i) {
      if (counter) counter.calls++;
      return raw.id;
    },
    getProductionRank(raw, i) { return i + 1; },
    getClipScore(raw) { return raw.clipScore; },
    getPhysicalFeatures(raw) { return raw.colorFeatures; }
  };
}

function fakePlatform({ withIdle = true } = {}) {
  let id = 1;
  const raf = new Map();
  const idle = new Map();
  const timers = new Map();

  return {
    requestAnimationFrame(cb) {
      const x = id++;
      raf.set(x, cb);
      return x;
    },
    cancelAnimationFrame(x) { raf.delete(x); },

    requestIdleCallback: withIdle ? function (cb) {
      const x = id++;
      idle.set(x, cb);
      return x;
    } : null,

    cancelIdleCallback: withIdle ? function (x) { idle.delete(x); } : null,

    setTimeout(cb) {
      const x = id++;
      timers.set(x, cb);
      return x;
    },
    clearTimeout(x) { timers.delete(x); },

    isDocumentHidden() { return false; },

    flushOneRaf() {
      const entry = raf.entries().next().value;
      if (!entry) return false;
      const [x, cb] = entry;
      raf.delete(x);
      cb(0);
      return true;
    },
    flushOneIdle() {
      const entry = idle.entries().next().value;
      if (!entry) return false;
      const [x, cb] = entry;
      idle.delete(x);
      cb({ didTimeout: false, timeRemaining: () => 10 });
      return true;
    },
    flushOneTimer() {
      const entry = timers.entries().next().value;
      if (!entry) return false;
      const [x, cb] = entry;
      timers.delete(x);
      cb();
      return true;
    },
    pendingCounts() {
      return { raf: raf.size, idle: idle.size, timers: timers.size };
    }
  };
}

(async () => {
  await check('job keeps only a small frozen context snapshot, not cloned results', () => {
    const results = makeResults(3);
    const c = ctx();
    const job = Lifecycle.createShadowJob({ context: c, resultsRef: results });

    assert(job.resultsRef === results, 'resultsRef should be a reference before release');
    assert(job.context !== c, 'context should be a small cloned snapshot');
    assert(Object.isFrozen(job.context), 'context should be frozen');
    assert(Object.isFrozen(job.context.batch), 'batch should be frozen');

    job.release();
    assert(job.resultsRef === null, 'release must sever resultsRef');
  });

  await check('DELTA projection processes only the new index range', () => {
    const results = makeResults(330);
    const counter = { calls: 0 };

    const c = ctx({
      page: 11,
      batch: {
        mode: 'DELTA',
        start_index: 300,
        end_index_exclusive: 330,
        total_results_seen: 330,
        base_shadow_snapshot_id: 'snapshot_10'
      }
    });

    const job = Lifecycle.createShadowJob({ context: c, resultsRef: results });
    const projected = Projection.createShadowProjection(job, accessors(counter));

    assert(projected.items.length === 30, 'must project only 30 new items');
    assert(counter.calls === 30, `getResultId called ${counter.calls}, expected 30`);
    assert(projected.items[0].result_id === 'img_300', 'wrong DELTA start');
    assert(projected.items[29].result_id === 'img_329', 'wrong DELTA end');

    // Ensure unused raw fields are not copied.
    assert(!('hugeUnusedPayload' in projected.items[0]), 'raw payload leaked into projection');
    Contract.assertShadowInput(projected);
    job.release();
  });

  await check('abort/unmount releases resultsRef before queued work executes', async () => {
    const platform = fakePlatform();
    const results = makeResults(3);
    const job = Lifecycle.createShadowJob({ context: ctx(), resultsRef: results });

    let ran = false;
    const scheduler = Scheduler.createShadowScheduler({
      platform,
      getCurrentContext: () => ctx()
    });

    const promise = scheduler.schedule(job, async () => { ran = true; });

    job.abort('ROUTE_UNMOUNT');
    job.release();

    // Even if queued browser callbacks later wake up, no work may run.
    while (platform.flushOneRaf()) {}
    while (platform.flushOneIdle()) {}
    while (platform.flushOneTimer()) {}

    const result = await promise;
    assert(!ran, 'aborted job unexpectedly executed');
    assert(job.resultsRef === null, 'aborted job retained resultsRef');
    assert(result.status === Lifecycle.STATE.ABORTED, 'wrong abort result status');
  });

  await check('route/view generation mismatch becomes STALE before projection/work', async () => {
    const platform = fakePlatform();
    const job = Lifecycle.createShadowJob({
      context: ctx(),
      resultsRef: makeResults(3)
    });

    let ran = false;
    const scheduler = Scheduler.createShadowScheduler({
      platform,
      getCurrentContext: () => ({
        ...ctx(),
        generation: 2,
        view_instance_id: 'view_pdp_1',
        route_key_digest: 'route:pdp'
      })
    });

    const promise = scheduler.schedule(job, async () => { ran = true; });

    platform.flushOneRaf();
    platform.flushOneRaf();
    platform.flushOneIdle();

    const result = await promise;
    assert(!ran, 'stale route job executed');
    assert(result.status === Lifecycle.STATE.STALE, `expected STALE, got ${result.status}`);
    assert(job.resultsRef === null, 'stale job retained resultsRef');
  });

  await check('newer job supersedes and releases older queued job', async () => {
    const platform = fakePlatform();
    let current = ctx();

    const scheduler = Scheduler.createShadowScheduler({
      platform,
      getCurrentContext: () => current
    });

    const job1 = Lifecycle.createShadowJob({
      context: ctx({ job_id: 'job_old' }),
      resultsRef: makeResults(3)
    });
    const p1 = scheduler.schedule(job1, async () => 'old');

    current = ctx({
      request_id: 'req_2',
      job_id: 'job_new',
      generation: 2,
      view_instance_id: 'view_search_2'
    });
    const job2 = Lifecycle.createShadowJob({
      context: current,
      resultsRef: makeResults(3)
    });
    const p2 = scheduler.schedule(job2, async () => 'new');

    assert(job1.resultsRef === null, 'superseded job still retains results');
    assert(job1.released, 'superseded job not released');

    platform.flushOneRaf();
    platform.flushOneRaf();
    platform.flushOneIdle();

    const r1 = await p1;
    const r2 = await p2;

    assert(r1.status === Lifecycle.STATE.ABORTED, 'old job should abort');
    assert(r2.status === Lifecycle.STATE.COMPLETED, 'new job should complete');
    assert(job2.resultsRef === null, 'completed job should release resultsRef');
  });

  await check('idle-callback fallback works when requestIdleCallback is unavailable', async () => {
    const platform = fakePlatform({ withIdle: false });
    const job = Lifecycle.createShadowJob({ context: ctx(), resultsRef: makeResults(3) });

    let ran = false;
    const scheduler = Scheduler.createShadowScheduler({
      platform,
      getCurrentContext: () => ctx()
    });

    const promise = scheduler.schedule(job, async () => {
      ran = true;
      return 42;
    });

    platform.flushOneRaf();
    platform.flushOneRaf();

    const counts = platform.pendingCounts();
    assert(counts.timers === 1, 'expected setTimeout fallback after double rAF');

    platform.flushOneTimer();
    const result = await promise;

    assert(ran, 'fallback never executed work');
    assert(result.status === Lifecycle.STATE.COMPLETED, 'fallback work not completed');
    assert(result.value === 42, 'fallback work result lost');
  });

  await check('mid-projection cooperative abort stops further projection and releases cleanly', () => {
    const results = makeResults(50);
    const c = ctx({
      batch: {
        mode: 'FULL',
        start_index: 0,
        end_index_exclusive: 50,
        total_results_seen: 50,
        base_shadow_snapshot_id: null
      }
    });

    const job = Lifecycle.createShadowJob({ context: c, resultsRef: results });
    let calls = 0;

    const a = accessors();
    a.getResultId = (raw, i) => {
      calls++;
      if (i === 5) job.abort('TEST_ABORT_DURING_PROJECTION');
      return raw.id;
    };

    let threw = false;
    try {
      Projection.createShadowProjection(job, a, { checkAbortEvery: 1 });
    } catch (e) {
      threw = e instanceof Projection.ShadowJobCanceledError;
    }

    assert(threw, 'projection did not stop after cooperative abort');
    assert(calls <= 6, `projection kept processing after abort: ${calls} calls`);
    job.release();
    assert(job.resultsRef === null, 'mid-abort release failed');
  });

  await check('successful scheduled projection releases raw results after completion', async () => {
    const platform = fakePlatform();
    const c = ctx();
    const job = Lifecycle.createShadowJob({ context: c, resultsRef: makeResults(3) });

    const scheduler = Scheduler.createShadowScheduler({
      platform,
      getCurrentContext: () => ctx()
    });

    const promise = scheduler.schedule(job, async (j) => {
      const p = Projection.createShadowProjection(j, accessors());
      return p.items.map(x => x.result_id);
    });

    platform.flushOneRaf();
    platform.flushOneRaf();
    platform.flushOneIdle();

    const result = await promise;
    assert(result.status === Lifecycle.STATE.COMPLETED, 'job should complete');
    assert(result.value.length === 3, 'projection result missing');
    assert(job.resultsRef === null, 'completed job retained resultsRef');
    assert(job.projection === null, 'completed job retained projection');
  });

  console.log(`\n${passed}/${total} Shadow Lifecycle v0.2 checks ${passed === total ? 'PASS' : 'FAIL'}.`);
  if (passed !== total) process.exit(1);
})();
