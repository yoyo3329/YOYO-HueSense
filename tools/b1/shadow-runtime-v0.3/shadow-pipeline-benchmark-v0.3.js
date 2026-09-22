'use strict';

const { performance } = require('perf_hooks');
const Contract = require('./shadow-result-contract.js');
const Lifecycle = require('./shadow-job-lifecycle.js');
const Scheduler = require('./shadow-scheduler.js');
const Runner = require('./shadow-runner.js');
const Adapter = require('./shadow-adapter.js');
const Candidate = require('./shadow-fake-candidate.js');

function makeContext(n, seq) {
  return {
    schema_version: '0.1.0',
    request_id: `bench_req_${seq}`,
    job_id: `bench_job_${seq}`,
    generation: seq,
    view_instance_id: `bench_view_${seq}`,
    route_key_digest: 'route:bench',
    query_digest: 'q:bench',
    filter_digest: 'f:none',
    branch: 'A',
    page: 1,
    batch: {
      mode: 'FULL',
      start_index: 0,
      end_index_exclusive: n,
      total_results_seen: n,
      base_shadow_snapshot_id: null
    }
  };
}

function makeResults(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `img_${i}`,
    productionRank: i + 1,
    clipScore: 0.4 + ((i * 7) % 55) / 100,
    colorFeatures: {
      L: 0.12 + ((i * 11) % 76) / 100,
      C: 0.01 + ((i * 13) % 20) / 100,
      H: (i * 29) % 360
    }
  }));
}

const accessors = {
  getResultId: x => x.id,
  getProductionRank: x => x.productionRank,
  getClipScore: x => x.clipScore,
  getPhysicalFeatures: x => x.colorFeatures
};

function immediatePlatform() {
  return {
    requestAnimationFrame(cb) { cb(0); return 1; },
    cancelAnimationFrame() {},
    requestIdleCallback(cb) { cb({ didTimeout: false, timeRemaining: () => 50 }); return 1; },
    cancelIdleCallback() {},
    setTimeout(cb) { cb(); return 1; },
    clearTimeout() {},
    isDocumentHidden() { return false; }
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

async function bench(n, runs = 120) {
  const times = [];
  const results = makeResults(n);

  for (let i = 1; i <= runs; i++) {
    const context = makeContext(n, i);
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
      accessors,
      getCurrentContext: () => currentRef.value
    });

    const t0 = performance.now();
    const out = await adapter.observe({ context, resultsRef: results });
    const dt = performance.now() - t0;

    if (out.status !== Lifecycle.STATE.COMPLETED ||
        out.value.shadow.status !== Contract.JOB_STATUS.OK) {
      throw new Error('benchmark pipeline did not complete');
    }

    // First 20 are warmup; still exercise the exact same code.
    if (i > 20) times.push(dt);
  }

  times.sort((a, b) => a - b);

  return {
    items: n,
    samples: times.length,
    p50_ms: Number(percentile(times, 0.50).toFixed(4)),
    p95_ms: Number(percentile(times, 0.95).toFixed(4)),
    max_ms: Number(times[times.length - 1].toFixed(4))
  };
}

(async () => {
  const rows = [];
  for (const n of [30, 60, 120]) {
    rows.push(await bench(n));
  }

  const report = {
    metadata: {
      name: 'YOYO Shadow Pipeline v0.3 Node Microbenchmark',
      version: '0.3.0',
      environment: 'Node.js local synthetic benchmark',
      browser_claim: false,
      note: 'This is a development microbenchmark only. It does not prove Chrome/Safari/mobile performance.'
    },
    rows
  };

  require('fs').writeFileSync(
    'shadow-pipeline-benchmark-v0.3.json',
    JSON.stringify(report, null, 2) + '\n'
  );

  console.log('=== Shadow Pipeline v0.3 Node Microbenchmark ===');
  for (const r of rows) {
    console.log(
      `${String(r.items).padStart(3)} items  p50=${r.p50_ms.toFixed(4)}ms  ` +
      `p95=${r.p95_ms.toFixed(4)}ms  max=${r.max_ms.toFixed(4)}ms`
    );
  }
  console.log('\nDevelopment microbenchmark only; not a browser/Safari/mobile performance claim.');
})();
