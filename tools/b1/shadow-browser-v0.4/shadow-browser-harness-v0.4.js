'use strict';
(function () {
  const C = window.YOYOShadowResultContract;
  const Lifecycle = window.YOYOShadowJobLifecycle;
  const Scheduler = window.YOYOShadowScheduler;
  const Runner = window.YOYOShadowRunner;
  const Adapter = window.YOYOShadowAdapter;
  const Candidate = window.YOYOShadowFakeCandidate;
  const Mapper = window.YOYOShadowB1Mapper;
  const B1 = window.YOYO_B1_REAL_OBSERVATIONS;
  const $ = id => document.getElementById(id);

  const state = {
    nodes: [],
    sourceSummary: null,
    latestReport: null,
    longTasks: [],
    longTaskObserver: null,
    runCounter: 0
  };

  const now = () => performance.now();

  function pctl(values, p) {
    if (!values.length) return null;
    const a = [...values].sort((x, y) => x - y);
    const idx = Math.max(0, Math.min(a.length - 1, Math.ceil(p * a.length) - 1));
    return a[idx];
  }

  function stats(values) {
    if (!values.length) return { samples: 0, p50: null, p95: null, max: null };
    return {
      samples: values.length,
      p50: pctl(values, 0.50),
      p95: pctl(values, 0.95),
      max: Math.max(...values)
    };
  }

  const fmtMs = v => v == null ? '—' : `${v.toFixed(3)} ms`;

  function makeContext(count, seq) {
    return {
      schema_version: '0.1.0',
      request_id: `browser_req_${seq}`,
      job_id: `browser_job_${seq}`,
      generation: seq,
      view_instance_id: `browser_search_view_${seq}`,
      route_key_digest: 'route:shadow-browser-v04',
      query_digest: 'fixture:y2k-b1-real',
      filter_digest: 'fixture:none',
      branch: 'A',
      page: 1,
      batch: {
        mode: 'FULL',
        start_index: 0,
        end_index_exclusive: count,
        total_results_seen: count,
        base_shadow_snapshot_id: null
      }
    };
  }

  function makeStack(currentRef, customAccessors = Mapper.accessors) {
    const scheduler = Scheduler.createShadowScheduler({
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
      accessors: customAccessors,
      getCurrentContext: () => currentRef.value,
      projectionOptions: { checkAbortEvery: 4 }
    });
    return { scheduler, runner, adapter };
  }

  function renderSourceSummary() {
    const s = state.sourceSummary;
    $('source-summary').innerHTML = `
      <div class="metric"><b>${s.source_images}</b><span>B1 images</span></div>
      <div class="metric"><b>${s.palette_nodes}</b><span>real palette nodes</span></div>
      <div class="metric"><b>${s.decoded_pixel_images}</b><span>decoded-pixel analyses</span></div>
      <div class="metric"><b>${s.observation_errors}</b><span>observation errors</span></div>`;
  }

  function setupLongTaskObserver() {
    if (!('PerformanceObserver' in window)) {
      $('longtask-status').textContent = 'PerformanceObserver unavailable';
      return;
    }
    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes('longtask')) {
        $('longtask-status').textContent = 'Long Task API unsupported in this browser';
        return;
      }
      state.longTaskObserver = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          state.longTasks.push({ startTime: e.startTime, duration: e.duration });
        }
      });
      state.longTaskObserver.observe({ type: 'longtask', buffered: true });
      $('longtask-status').textContent = 'Long Task API active';
    } catch (e) {
      $('longtask-status').textContent = `Long Task observer unavailable: ${e.message}`;
    }
  }

  function memoryDiagnostic() {
    const m = performance && performance.memory;
    if (!m) {
      return {
        supported: false,
        note: 'performance.memory unavailable; expected outside some Chromium builds.'
      };
    }
    return {
      supported: true,
      usedJSHeapSize: m.usedJSHeapSize,
      totalJSHeapSize: m.totalJSHeapSize,
      jsHeapSizeLimit: m.jsHeapSizeLimit
    };
  }

  async function runOne(count, seq) {
    const context = makeContext(count, seq);
    const currentRef = { value: context };
    const { adapter } = makeStack(currentRef);
    const raw = state.nodes.slice(0, count);

    const wall0 = now();
    const out = await adapter.observe({ context, resultsRef: raw });
    const wallMs = now() - wall0;

    if (out.status !== Lifecycle.STATE.COMPLETED) {
      throw new Error(`Scheduler did not complete: ${out.status}`);
    }
    if (!out.value?.shadow || out.value.shadow.status !== C.JOB_STATUS.OK) {
      throw new Error('Shadow result was not OK');
    }
    if (out.value.shadow.authority !== C.AUTHORITY.NONE) {
      throw new Error('Shadow authority escalated');
    }

    return {
      wall_ms: wallMs,
      projection_ms: out.value.shadow.timing.projection_ms || 0,
      compute_ms: out.value.shadow.timing.compute_ms || 0,
      shadow_total_ms: out.value.shadow.timing.total_ms || 0,
      abstain_count: out.value.shadow.items.filter(x => x.decision === 'ABSTAIN').length
    };
  }

  async function benchmarkSize(count, warmup = 4, measured = 16) {
    const projection = [], compute = [], shadowTotal = [], wall = [], abstain = [];
    const longBefore = state.longTasks.length;

    for (let i = 0; i < warmup + measured; i++) {
      const r = await runOne(count, ++state.runCounter);
      if (i >= warmup) {
        projection.push(r.projection_ms);
        compute.push(r.compute_ms);
        shadowTotal.push(r.shadow_total_ms);
        wall.push(r.wall_ms);
        abstain.push(r.abstain_count);
      }
    }

    return {
      items: count,
      samples: measured,
      projection_ms: stats(projection),
      compute_ms: stats(compute),
      shadow_total_ms: stats(shadowTotal),
      scheduled_wall_ms: stats(wall),
      abstain_count: stats(abstain),
      long_tasks_during_run: state.longTasks.length - longBefore
    };
  }

  async function runRouteAbortTest() {
    const count = 30;
    const context = makeContext(count, ++state.runCounter);
    const currentRef = { value: context };
    const { adapter } = makeStack(currentRef);

    const p = adapter.observe({ context, resultsRef: state.nodes.slice(0, count) });

    currentRef.value = {
      ...makeContext(0, ++state.runCounter),
      request_id: 'route_changed_request',
      job_id: 'route_changed_job',
      generation: context.generation + 1000,
      view_instance_id: 'pdp_view_simulated',
      route_key_digest: 'route:pdp-simulated'
    };

    const out = await p;
    return {
      pass: out.status === Lifecycle.STATE.STALE,
      observed_status: out.status,
      expected_status: Lifecycle.STATE.STALE
    };
  }

  async function runDeltaTest() {
    let touches = 0;
    const accessors = {
      getResultId(x) { touches++; return x.id; },
      getProductionRank: x => x.productionRank,
      getClipScore: x => x.clipScore,
      getPhysicalFeatures: x => x.colorFeatures
    };

    const context = {
      ...makeContext(120, ++state.runCounter),
      page: 4,
      batch: {
        mode: 'DELTA',
        start_index: 90,
        end_index_exclusive: 120,
        total_results_seen: 120,
        base_shadow_snapshot_id: 'browser_real_b1_snapshot_90'
      }
    };

    const currentRef = { value: context };
    const { adapter } = makeStack(currentRef, accessors);
    const out = await adapter.observe({ context, resultsRef: state.nodes });
    const shadow = out.value?.shadow;

    return {
      pass:
        out.status === Lifecycle.STATE.COMPLETED &&
        shadow &&
        shadow.items.length === 30 &&
        touches === 30,
      touches,
      returned_items: shadow ? shadow.items.length : null,
      expected_touches: 30
    };
  }

  async function runRetentionTest() {
    let currentCtx = makeContext(0, ++state.runCounter);
    const scheduler = Scheduler.createShadowScheduler({
      getCurrentContext: () => currentCtx
    });

    const jobs = [];
    const large = Array.from({ length: 500 }, (_, i) => ({
      id: `ret_${i}`,
      payload: 'x'.repeat(2048)
    }));

    for (let i = 0; i < 20; i++) {
      currentCtx = {
        ...makeContext(0, ++state.runCounter),
        request_id: `retain_req_${i}`,
        job_id: `retain_job_${i}`,
        generation: i + 1,
        view_instance_id: `retain_view_${i}`
      };
      const job = Lifecycle.createShadowJob({
        context: currentCtx,
        resultsRef: large
      });
      jobs.push(job);
      scheduler.schedule(job, async () => null);
    }

    scheduler.dispose();
    const retained = jobs.filter(j => j.resultsRef !== null).length;

    return {
      pass: retained === 0 && scheduler.getActiveJob() === null,
      jobs_created: jobs.length,
      jobs_retaining_resultsRef_after_dispose: retained,
      active_job_after_dispose: scheduler.getActiveJob() ? 'YES' : 'NO'
    };
  }

  function renderBenchmark(rows) {
    const body = $('bench-body');
    body.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.items}</td>
        <td>${fmtMs(r.projection_ms.p50)} / ${fmtMs(r.projection_ms.p95)}</td>
        <td>${fmtMs(r.compute_ms.p50)} / ${fmtMs(r.compute_ms.p95)}</td>
        <td>${fmtMs(r.shadow_total_ms.p50)} / ${fmtMs(r.shadow_total_ms.p95)}</td>
        <td>${fmtMs(r.scheduled_wall_ms.p50)} / ${fmtMs(r.scheduled_wall_ms.p95)}</td>
        <td>${r.long_tasks_during_run}</td>`;
      body.appendChild(tr);
    }
  }

  function saveReport(report) {
    state.latestReport = report;
    try {
      localStorage.setItem('YOYO_SHADOW_BROWSER_V04_LAST_REPORT', JSON.stringify(report));
    } catch (_) {}
  }

  function downloadReport() {
    if (!state.latestReport) return;
    const blob = new Blob([JSON.stringify(state.latestReport, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YOYO_shadow_browser_v0_4_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function runAll() {
    const button = $('run-all');
    button.disabled = true;
    button.textContent = 'Running…';
    $('run-status').textContent = 'Browser tests running. Production search is not involved.';
    $('run-status').className = 'ready';
    state.longTasks.length = 0;

    try {
      const memoryBefore = memoryDiagnostic();
      const routeAbort = await runRouteAbortTest();
      const delta = await runDeltaTest();
      const retention = await runRetentionTest();

      const rows = [];
      for (const count of [30, 60, 120]) rows.push(await benchmarkSize(count));

      const memoryAfter = memoryDiagnostic();
      const report = {
        metadata: {
          name: 'YOYO Shadow Browser Harness v0.4',
          version: '0.4.0',
          run_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
          platform: navigator.platform || null,
          browser_real_runtime: true,
          production_runtime_touched: false,
          shadow_authority: 'NONE',
          candidate: Candidate.VERSION,
          candidate_role: 'TEST_ONLY_PIPELINE_CANDIDATE',
          scientific_perceptual_evidence: false
        },
        source: state.sourceSummary,
        lifecycle_checks: {
          route_abort: routeAbort,
          delta_processing: delta,
          closure_retention: retention
        },
        benchmark: rows,
        browser_diagnostics: {
          long_task_api_status: $('longtask-status').textContent,
          long_tasks_observed_total: state.longTasks.length,
          memory_before: memoryBefore,
          memory_after: memoryAfter
        }
      };

      renderBenchmark(rows);
      $('diagnostics').textContent = JSON.stringify(report, null, 2);
      saveReport(report);

      const allPass = routeAbort.pass && delta.pass && retention.pass;
      $('run-status').textContent = allPass
        ? 'PASS — Browser lifecycle checks passed. Benchmark captured.'
        : 'CHECK REQUIRED — One or more lifecycle checks failed.';
      $('run-status').className = allPass ? 'pass' : 'fail';
    } catch (e) {
      $('run-status').textContent = `FAIL — ${e.message}`;
      $('run-status').className = 'fail';
      $('diagnostics').textContent = JSON.stringify(
        { error: e.stack || e.message },
        null,
        2
      );
    } finally {
      button.disabled = false;
      button.textContent = 'Run Browser Harness';
    }
  }

  function init() {
    if (!B1 || !Array.isArray(B1.items)) {
      $('run-status').textContent = 'FAIL — bundled B1 observations missing.';
      $('run-status').className = 'fail';
      return;
    }

    state.nodes = Mapper.flattenPaletteNodes(B1);
    state.sourceSummary = Mapper.summarize(B1, state.nodes);
    renderSourceSummary();
    setupLongTaskObserver();

    $('environment').textContent =
      `${navigator.userAgent}\n\n` +
      `Fixture: ${state.sourceSummary.source_images} images / ` +
      `${state.sourceSummary.palette_nodes} palette nodes`;

    $('run-all').addEventListener('click', runAll);
    $('download-report').addEventListener('click', downloadReport);

    if (state.nodes.length >= 120) {
      $('run-status').textContent =
        'READY — real B1 fixture loaded. Click “Run Browser Harness”.';
      $('run-status').className = 'ready';
    } else {
      $('run-status').textContent =
        `BLOCKED — expected 120 B1 palette nodes, found ${state.nodes.length}.`;
      $('run-status').className = 'fail';
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
