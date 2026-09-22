'use strict';

const Contract = require('./shadow-result-contract.js');
const Lifecycle = require('./shadow-job-lifecycle.js');
const Scheduler = require('./shadow-scheduler.js');
const Runner = require('./shadow-runner.js');
const Adapter = require('./shadow-adapter.js');
const Candidate = require('./shadow-fake-candidate.js');

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

function makeContext({
  request = 'req_1',
  job = 'job_1',
  generation = 1,
  page = 1,
  start = 0,
  end = 30,
  mode = 'FULL',
  base = null,
  view = 'search_1',
  route = 'route:search'
} = {}) {
  return {
    schema_version: '0.1.0',
    request_id: request,
    job_id: job,
    generation,
    view_instance_id: view,
    route_key_digest: route,
    query_digest: 'q:y2k',
    filter_digest: 'f:none',
    branch: 'A',
    page,
    batch: {
      mode,
      start_index: start,
      end_index_exclusive: end,
      total_results_seen: end,
      base_shadow_snapshot_id: base
    }
  };
}

function makeResults(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `img_${String(i).padStart(4, '0')}`,
    productionRank: i + 1,
    clipScore: 0.45 + ((i * 7) % 50) / 100,
    colorFeatures: {
      L: 0.15 + ((i * 11) % 70) / 100,
      C: 0.01 + ((i * 13) % 20) / 100,
      H: (i * 29) % 360
    },
    provider: 'synthetic',
    rawPayloadThatMustNeverReachShadow: 'SECRET_RAW_' + i
  }));
}

const accessors = {
  getResultId: x => x.id,
  getProductionRank: x => x.productionRank,
  getClipScore: x => x.clipScore,
  getPhysicalFeatures: x => x.colorFeatures
};

function immediatePlatform() {
  let id = 0;
  return {
    requestAnimationFrame(cb) { cb(0); return ++id; },
    cancelAnimationFrame() {},
    requestIdleCallback(cb) { cb({ didTimeout: false, timeRemaining: () => 50 }); return ++id; },
    cancelIdleCallback() {},
    setTimeout(cb) { cb(); return ++id; },
    clearTimeout() {},
    isDocumentHidden() { return false; }
  };
}

function delayedPlatform() {
  let id = 1;
  const raf = new Map();
  const idle = new Map();
  return {
    requestAnimationFrame(cb) { const x = id++; raf.set(x, cb); return x; },
    cancelAnimationFrame(x) { raf.delete(x); },
    requestIdleCallback(cb) { const x = id++; idle.set(x, cb); return x; },
    cancelIdleCallback(x) { idle.delete(x); },
    setTimeout(cb) { const x = id++; setImmediate(cb); return x; },
    clearTimeout() {},
    isDocumentHidden() { return false; },
    flushRaf() {
      const e = raf.entries().next().value;
      if (!e) return false;
      raf.delete(e[0]); e[1](0); return true;
    },
    flushIdle() {
      const e = idle.entries().next().value;
      if (!e) return false;
      idle.delete(e[0]); e[1]({ didTimeout: false, timeRemaining: () => 50 }); return true;
    }
  };
}

function createStack({ currentRef, platform = immediatePlatform(), mode = 'LOCAL' }) {
  const scheduler = Scheduler.createShadowScheduler({
    platform,
    getCurrentContext: () => currentRef.value
  });

  const runner = Runner.createShadowRunner({
    mode,
    candidate: mode === 'LOCAL' ? Candidate : null,
    candidateVersion: Candidate.VERSION
  });

  const adapter = Adapter.createShadowAdapter({
    scheduler,
    runner,
    accessors,
    getCurrentContext: () => currentRef.value,
    projectionOptions: { checkAbortEvery: 4 }
  });

  return { scheduler, runner, adapter };
}

(async () => {
  await check('end-to-end LOCAL pipeline returns authority NONE', async () => {
    const context = makeContext({ end: 30 });
    const currentRef = { value: context };
    const results = makeResults(30);
    const original = JSON.stringify(results);

    const { adapter } = createStack({ currentRef });
    const out = await adapter.observe({ context, resultsRef: results });

    assert(out.status === Lifecycle.STATE.COMPLETED, `scheduler status ${out.status}`);
    assert(out.value.shadow.authority === 'NONE', 'authority escalated');
    assert(out.value.shadow.status === 'OK', 'shadow result not OK');
    assert(out.value.shadow.items.length === 30, 'wrong item count');
    assert(JSON.stringify(results) === original, 'production results were mutated');
  });

  await check('fake candidate is deterministic for identical input', async () => {
    const contextA = makeContext({ request: 'req_same', job: 'job_same', end: 30 });
    const currentA = { value: contextA };
    const results = makeResults(30);

    const stackA = createStack({ currentRef: currentA });
    const a = await stackA.adapter.observe({ context: contextA, resultsRef: results });

    const contextB = makeContext({ request: 'req_same', job: 'job_same', end: 30 });
    const currentB = { value: contextB };
    const stackB = createStack({ currentRef: currentB });
    const b = await stackB.adapter.observe({ context: contextB, resultsRef: results });

    const stripTiming = x => ({
      snapshot: x.value.shadow.shadow_snapshot_id,
      items: x.value.shadow.items
    });

    assert(
      JSON.stringify(stripTiming(a)) === JSON.stringify(stripTiming(b)),
      'deterministic candidate changed outputs'
    );
  });

  await check('ABSTAIN items never receive a shadow rank', async () => {
    const context = makeContext({ end: 60 });
    const currentRef = { value: context };
    const { adapter } = createStack({ currentRef });

    const out = await adapter.observe({
      context,
      resultsRef: makeResults(60)
    });

    for (const row of out.value.shadow.items) {
      if (row.decision === 'ABSTAIN') {
        assert(row.shadow_rank === null, 'ABSTAIN received a rank');
      }
    }
  });

  await check('DELTA batch processes only newly appended items', async () => {
    const results = makeResults(120);
    let accessCount = 0;
    const countingAccessors = {
      getResultId(x) { accessCount++; return x.id; },
      getProductionRank: x => x.productionRank,
      getClipScore: x => x.clipScore,
      getPhysicalFeatures: x => x.colorFeatures
    };

    const context = makeContext({
      page: 4,
      start: 90,
      end: 120,
      mode: 'DELTA',
      base: 'shadow_snapshot_3'
    });
    const currentRef = { value: context };

    const scheduler = Scheduler.createShadowScheduler({
      platform: immediatePlatform(),
      getCurrentContext: () => currentRef.value
    });
    const runner = Runner.createShadowRunner({
      mode: 'LOCAL',
      candidate: Candidate,
      candidateVersion: Candidate.VERSION
    });
    const adapter = Adapter.createShadowAdapter({
      scheduler,
      runner,
      accessors: countingAccessors,
      getCurrentContext: () => currentRef.value
    });

    const out = await adapter.observe({ context, resultsRef: results });

    assert(out.value.shadow.items.length === 30, 'DELTA did not return 30 items');
    assert(accessCount === 30, `DELTA touched ${accessCount} items instead of 30`);
    assert(out.value.shadow.items[0].result_id === 'img_0090', 'wrong delta start');
  });

  await check('route change before deferred execution blocks candidate work', async () => {
    const context = makeContext({ end: 30 });
    const currentRef = { value: context };
    const platform = delayedPlatform();
    const { adapter } = createStack({ currentRef, platform });

    const promise = adapter.observe({ context, resultsRef: makeResults(30) });

    // User navigates away before Shadow wakes.
    currentRef.value = makeContext({
      request: 'req_pdp',
      job: 'job_pdp',
      generation: 2,
      end: 0,
      view: 'pdp_1',
      route: 'route:pdp'
    });

    platform.flushRaf();
    platform.flushRaf();
    platform.flushIdle();

    const out = await promise;
    assert(out.status === Lifecycle.STATE.STALE, `expected STALE, got ${out.status}`);
  });

  await check('OFF runner produces DISABLED shadow output, never ranking authority', async () => {
    const context = makeContext({ end: 30 });
    const currentRef = { value: context };
    const { adapter } = createStack({ currentRef, mode: 'OFF' });

    const out = await adapter.observe({ context, resultsRef: makeResults(30) });
    assert(out.value.shadow.status === 'DISABLED', 'OFF mode did not disable');
    assert(out.value.shadow.authority === 'NONE', 'OFF authority invalid');
    assert(out.value.shadow.items.length === 0, 'OFF should not produce rankings');
  });

  await check('WORKER mode is intentionally blocked in v0.3', async () => {
    let threw = false;
    try {
      Runner.createShadowRunner({
        mode: 'WORKER',
        candidate: Candidate
      });
    } catch (e) {
      threw = /not enabled/i.test(e.message);
    }
    assert(threw, 'WORKER mode unexpectedly activated');
  });

  await check('Shadow projection does not expose raw provider payload', async () => {
    const context = makeContext({ end: 30 });
    const currentRef = { value: context };
    const { adapter } = createStack({ currentRef });

    const out = await adapter.observe({ context, resultsRef: makeResults(30) });
    const serialized = JSON.stringify(out.value.shadow);

    assert(!serialized.includes('SECRET_RAW_'), 'raw provider payload leaked into shadow result');
    assert(!serialized.includes('rawPayloadThatMustNeverReachShadow'), 'raw field name leaked');
  });

  console.log(`\n${passed}/${total} Shadow Pipeline v0.3 checks ${passed === total ? 'PASS' : 'FAIL'}.`);
  if (passed !== total) process.exit(1);
})();
