'use strict';

(function () {
  const C = window.YOYOShadowResultContract;
  const Lifecycle = window.YOYOShadowJobLifecycle;
  const Scheduler = window.YOYOShadowScheduler;
  const Runner = window.YOYOShadowRunner;
  const Adapter = window.YOYOShadowAdapter;
  const Candidate = window.YOYOShadowFakeCandidate;
  const Mapper = window.YOYOShadowB1Mapper;
  const Plan = window.YOYOShadowSoakPlan;
  const Analysis = window.YOYOShadowSoakAnalysis;
  const B1 = window.YOYO_B1_REAL_OBSERVATIONS;

  const $ = id => document.getElementById(id);

  const state = {
    nodes: [],
    sourceSummary: null,
    report: null,
    running: false,
    stopRequested: false,
    visibilityInterrupted: false,

    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,

    releaseEvents: 0,
    releaseRefFailures: 0,
    releaseProjectionFailures: 0,

    currentTouches: 0,
    touchMismatches: 0,
    schedulerActiveAfterCycleFailures: 0,

    statusCounts: {
      COMPLETED: 0,
      ABORTED: 0,
      STALE: 0,
      ERROR: 0,
      OTHER: 0
    },

    checkpoints: [],
    phaseData: {},
    baseline120: [],
    recovery120: [],

    currentContextRef: { value: null },
    scheduler: null,
    runner: null,
    adapter: null,

    deltaBaseSnapshotId: null,
    domBaseline: null,
    sourceFingerprintBefore: null
  };

  function now() {
    return performance.now();
  }

  function mb(bytes) {
    return bytes == null ? 'unsupported' : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function heapUsed() {
    const m = performance && performance.memory;
    return m && Number.isFinite(m.usedJSHeapSize)
      ? m.usedJSHeapSize
      : null;
  }

  function harnessDomCount() {
    const root = $('soak-root');
    return root ? root.getElementsByTagName('*').length : null;
  }

  function fingerprintNodes(nodes) {
    // Compact immutable-data fingerprint for harness safety.
    let h = 2166136261 >>> 0;
    for (const x of nodes) {
      const s = [
        x.id,
        x.productionRank,
        x.clipScore,
        x.colorFeatures.L,
        x.colorFeatures.C,
        x.colorFeatures.H
      ].join('|');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function makeContext(jobDesc) {
    const i = jobDesc.job_index;
    return {
      schema_version: '0.1.0',
      request_id: `soak_req_${i}`,
      job_id: `soak_job_${i}`,
      generation: i,
      view_instance_id: `soak_search_view_${i}`,
      route_key_digest: 'route:shadow-soak-v05',
      query_digest: 'fixture:y2k-b1-real',
      filter_digest: 'fixture:none',
      branch: 'A',
      page:
        jobDesc.phase === 'DELTA_STRESS'
          ? jobDesc.delta_cycle
          : 1,
      batch: {
        ...jobDesc.batch,
        base_shadow_snapshot_id:
          jobDesc.batch.mode === 'DELTA'
            ? state.deltaBaseSnapshotId
            : null
      }
    };
  }

  function ensurePhaseBucket(phase) {
    if (!state.phaseData[phase]) {
      state.phaseData[phase] = {
        jobs: 0,
        completed: 0,
        aborted: 0,
        stale: 0,
        error: 0,
        wall_ms: [],
        shadow_total_ms: [],
        projection_ms: [],
        compute_ms: [],
        touches: 0,
        touch_mismatches: 0,
        long_task_start_count: state.longTaskCount
      };
    }
    return state.phaseData[phase];
  }

  function setupLongTaskObserver() {
    if (!('PerformanceObserver' in window)) {
      $('longtask-status').textContent = 'PerformanceObserver unavailable';
      return;
    }

    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes('longtask')) {
        $('longtask-status').textContent = 'Long Task API unsupported';
        return;
      }

      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          state.longTaskCount++;
          state.longTaskTotalMs += entry.duration;
          state.longTaskMaxMs = Math.max(state.longTaskMaxMs, entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      $('longtask-status').textContent = 'Long Task API active';
    } catch (e) {
      $('longtask-status').textContent = `Long Task API unavailable: ${e.message}`;
    }
  }

  function buildRuntime() {
    state.currentContextRef = { value: null };

    state.scheduler = Scheduler.createShadowScheduler({
      getCurrentContext: () => state.currentContextRef.value
    });

    state.runner = Runner.createShadowRunner({
      mode: 'LOCAL',
      candidate: Candidate,
      candidateVersion: Candidate.VERSION
    });

    const accessors = {
      getResultId(x) {
        state.currentTouches++;
        return x.id;
      },
      getProductionRank: x => x.productionRank,
      getClipScore: x => x.clipScore,
      getPhysicalFeatures: x => x.colorFeatures
    };

    state.adapter = Adapter.createShadowAdapter({
      scheduler: state.scheduler,
      runner: state.runner,
      accessors,
      getCurrentContext: () => state.currentContextRef.value,
      projectionOptions: { checkAbortEvery: 4 },

      // Tiny release telemetry only; no job object retained.
      jobHooks: {
        onRelease(event) {
          state.releaseEvents++;
          if (!event.results_ref_cleared) state.releaseRefFailures++;
          if (!event.projection_cleared) state.releaseProjectionFailures++;
        }
      }
    });
  }

  function resetMetrics() {
    state.report = null;
    state.stopRequested = false;
    state.visibilityInterrupted = false;

    state.longTaskCount = 0;
    state.longTaskTotalMs = 0;
    state.longTaskMaxMs = 0;

    state.releaseEvents = 0;
    state.releaseRefFailures = 0;
    state.releaseProjectionFailures = 0;

    state.currentTouches = 0;
    state.touchMismatches = 0;
    state.schedulerActiveAfterCycleFailures = 0;

    state.statusCounts = {
      COMPLETED: 0,
      ABORTED: 0,
      STALE: 0,
      ERROR: 0,
      OTHER: 0
    };

    state.checkpoints = [];
    state.phaseData = {};
    state.baseline120 = [];
    state.recovery120 = [];
    state.deltaBaseSnapshotId = null;
    state.domBaseline = harnessDomCount();
    state.sourceFingerprintBefore = fingerprintNodes(state.nodes);
  }

  function updateProgress(jobIndex, phase) {
    const pct = (jobIndex / Plan.TOTAL_JOBS) * 100;
    $('progress-bar').style.width = `${pct.toFixed(1)}%`;
    $('progress-label').textContent =
      `${jobIndex} / ${Plan.TOTAL_JOBS} — ${phase}`;
    $('heap-now').textContent = mb(heapUsed());
  }

  async function settleForCheckpoint() {
    await new Promise(resolve => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 100 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  async function takeCheckpoint(jobIndex) {
    await settleForCheckpoint();

    const cp = {
      job_index: jobIndex,
      heap_used_bytes: heapUsed(),
      harness_dom_nodes: harnessDomCount(),
      long_tasks_cumulative: state.longTaskCount,
      release_events_cumulative: state.releaseEvents,
      release_ref_failures_cumulative: state.releaseRefFailures,
      active_job: state.scheduler.getActiveJob() ? 'YES' : 'NO',
      status_counts_cumulative: { ...state.statusCounts }
    };

    state.checkpoints.push(cp);

    // UI remains constant-size: overwrite existing text only.
    $('checkpoint-now').textContent =
      `Checkpoint ${jobIndex}: heap ${mb(cp.heap_used_bytes)}, ` +
      `long tasks ${cp.long_tasks_cumulative}, active job ${cp.active_job}`;
  }

  function recordStatus(status) {
    if (status === Lifecycle.STATE.COMPLETED) state.statusCounts.COMPLETED++;
    else if (status === Lifecycle.STATE.ABORTED) state.statusCounts.ABORTED++;
    else if (status === Lifecycle.STATE.STALE) state.statusCounts.STALE++;
    else if (status === Lifecycle.STATE.ERROR) state.statusCounts.ERROR++;
    else state.statusCounts.OTHER++;
  }

  async function executeJob(jobDesc) {
    const phase = ensurePhaseBucket(jobDesc.phase);
    phase.jobs++;

    state.currentTouches = 0;

    const context = makeContext(jobDesc);
    state.currentContextRef.value = context;

    const wall0 = now();
    let out;

    if (jobDesc.kind === 'ABORT') {
      const controller = new AbortController();
      const p = state.adapter.observe({
        context,
        resultsRef: state.nodes,
        externalSignal: controller.signal
      });

      controller.abort('SOAK_ABORT_STORM');
      out = await p;

    } else if (jobDesc.kind === 'ROUTE_STALE') {
      const p = state.adapter.observe({
        context,
        resultsRef: state.nodes
      });

      // Simulate SPA navigation before deferred Shadow execution.
      state.currentContextRef.value = {
        ...context,
        request_id: `${context.request_id}_pdp`,
        job_id: `${context.job_id}_pdp`,
        generation: context.generation + 100000,
        view_instance_id: `pdp_${context.generation}`,
        route_key_digest: 'route:pdp-soak'
      };

      out = await p;

    } else {
      out = await state.adapter.observe({
        context,
        resultsRef: state.nodes
      });
    }

    const wallMs = now() - wall0;
    const status = out.status;

    recordStatus(status);

    if (status === Lifecycle.STATE.COMPLETED) phase.completed++;
    else if (status === Lifecycle.STATE.ABORTED) phase.aborted++;
    else if (status === Lifecycle.STATE.STALE) phase.stale++;
    else phase.error++;

    phase.wall_ms.push(wallMs);
    phase.touches += state.currentTouches;

    if (state.currentTouches !== jobDesc.expected_projection_touches) {
      state.touchMismatches++;
      phase.touch_mismatches++;
    }

    if (state.scheduler.getActiveJob() !== null) {
      state.schedulerActiveAfterCycleFailures++;
    }

    if (status !== jobDesc.expected_status) {
      phase.error++;
    }

    if (status === Lifecycle.STATE.COMPLETED && out.value?.shadow) {
      const shadow = out.value.shadow;

      phase.shadow_total_ms.push(shadow.timing.total_ms || 0);
      phase.projection_ms.push(shadow.timing.projection_ms || 0);
      phase.compute_ms.push(shadow.timing.compute_ms || 0);

      if (
        jobDesc.phase === 'NORMAL' &&
        jobDesc.node_count === 120 &&
        jobDesc.measured
      ) {
        state.baseline120.push(shadow.timing.total_ms || 0);
      }

      if (jobDesc.phase === 'RECOVERY') {
        state.recovery120.push(shadow.timing.total_ms || 0);
      }

      if (jobDesc.phase === 'DELTA_STRESS') {
        state.deltaBaseSnapshotId = shadow.shadow_snapshot_id;
      }
    }

    return out;
  }

  function summarizePhases() {
    const out = {};
    for (const [phase, d] of Object.entries(state.phaseData)) {
      out[phase] = {
        jobs: d.jobs,
        completed: d.completed,
        aborted: d.aborted,
        stale: d.stale,
        error: d.error,
        wall_ms: Analysis.summarize(d.wall_ms),
        shadow_total_ms: Analysis.summarize(d.shadow_total_ms),
        projection_ms: Analysis.summarize(d.projection_ms),
        compute_ms: Analysis.summarize(d.compute_ms),
        projection_touches: d.touches,
        touch_mismatches: d.touch_mismatches,
        long_tasks_during_phase:
          state.longTaskCount - d.long_task_start_count
      };
    }
    return out;
  }

  function evaluateGates() {
    const memory = Analysis.analyzeMemory(state.checkpoints);
    const recovery = Analysis.evaluateRecovery(
      state.baseline120,
      state.recovery120
    );

    const domCounts = state.checkpoints
      .map(c => c.harness_dom_nodes)
      .filter(Number.isFinite);

    const domDrift = domCounts.length
      ? Math.max(...domCounts) - Math.min(...domCounts)
      : null;

    const expected = Plan.EXPECTED_STATUS_COUNTS;

    const checks = {
      visibility_not_interrupted: !state.visibilityInterrupted,
      all_500_jobs_released:
        state.releaseEvents === Plan.TOTAL_JOBS,
      release_results_ref_failures_zero:
        state.releaseRefFailures === 0,
      release_projection_failures_zero:
        state.releaseProjectionFailures === 0,
      scheduler_active_after_cycle_failures_zero:
        state.schedulerActiveAfterCycleFailures === 0,
      projection_touch_mismatches_zero:
        state.touchMismatches === 0,
      status_completed_exact:
        state.statusCounts.COMPLETED === expected.COMPLETED,
      status_aborted_exact:
        state.statusCounts.ABORTED === expected.ABORTED,
      status_stale_exact:
        state.statusCounts.STALE === expected.STALE,
      status_error_zero:
        state.statusCounts.ERROR === expected.ERROR &&
        state.statusCounts.OTHER === 0,
      long_tasks_zero:
        state.longTaskCount <= Analysis.GATES.long_tasks_max,
      recovery_latency_pass:
        recovery.gate_pass,
      memory_trend_no_unbounded_signal:
        memory.gate_pass,
      harness_dom_node_drift_zero:
        domDrift != null &&
        domDrift <= Analysis.GATES.harness_dom_node_drift_max,
      source_data_unchanged:
        fingerprintNodes(state.nodes) === state.sourceFingerprintBefore
    };

    const pass = Object.values(checks).every(Boolean);

    return {
      overall_status: pass
        ? 'PASS_STOP_SHADOW_INFRA_EXPANSION'
        : (
          state.visibilityInterrupted
            ? 'INVALID_RETRY_KEEP_TAB_VISIBLE'
            : 'CHECK_REQUIRED'
        ),
      checks,
      recovery,
      memory,
      harness_dom_node_drift: domDrift
    };
  }

  function makeReport(gates) {
    return {
      metadata: {
        name: 'YOYO Shadow Soak Test v0.5',
        version: '0.5.0',
        run_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
        platform: navigator.platform || null,
        browser_real_runtime: true,
        production_runtime_touched: false,
        shadow_authority: 'NONE',
        candidate: Candidate.VERSION,
        candidate_role: 'TEST_ONLY_PIPELINE_CANDIDATE',
        scientific_perceptual_evidence: false,
        harness_logging_policy:
          'constant-size UI during run; no per-job DOM log; aggregated report only'
      },

      plan: {
        total_jobs: Plan.TOTAL_JOBS,
        warmup_jobs: Plan.WARMUP_JOBS,
        formal_jobs: Plan.FORMAL_JOBS,
        checkpoint_every: Plan.CHECKPOINT_EVERY,
        phases: Plan.PHASES,
        expected_status_counts: Plan.EXPECTED_STATUS_COUNTS
      },

      source: state.sourceSummary,

      observed: {
        status_counts: { ...state.statusCounts },
        release_events: state.releaseEvents,
        release_ref_failures: state.releaseRefFailures,
        release_projection_failures: state.releaseProjectionFailures,
        scheduler_active_after_cycle_failures:
          state.schedulerActiveAfterCycleFailures,
        projection_touch_mismatches: state.touchMismatches,

        long_tasks: {
          count: state.longTaskCount,
          total_duration_ms: state.longTaskTotalMs,
          max_duration_ms: state.longTaskMaxMs
        }
      },

      checkpoints: state.checkpoints,
      phase_summary: summarizePhases(),

      performance: {
        baseline_normal_120:
          Analysis.summarize(state.baseline120),
        recovery_120:
          Analysis.summarize(state.recovery120)
      },

      gates
    };
  }

  function renderFinal(report) {
    $('final-status').textContent = report.gates.overall_status;
    $('final-status').className =
      report.gates.overall_status === 'PASS_STOP_SHADOW_INFRA_EXPANSION'
        ? 'pass'
        : 'fail';

    $('summary').textContent = JSON.stringify({
      overall_status: report.gates.overall_status,
      status_counts: report.observed.status_counts,
      release_events: report.observed.release_events,
      release_ref_failures: report.observed.release_ref_failures,
      active_after_cycle_failures:
        report.observed.scheduler_active_after_cycle_failures,
      touch_mismatches:
        report.observed.projection_touch_mismatches,
      long_tasks: report.observed.long_tasks,
      baseline_120: report.performance.baseline_normal_120,
      recovery_120: report.performance.recovery_120,
      memory: report.gates.memory,
      harness_dom_node_drift:
        report.gates.harness_dom_node_drift,
      checks: report.gates.checks
    }, null, 2);

    const body = $('checkpoint-body');
    body.innerHTML = report.checkpoints.map(c => `
      <tr>
        <td>${c.job_index}</td>
        <td>${mb(c.heap_used_bytes)}</td>
        <td>${c.harness_dom_nodes}</td>
        <td>${c.long_tasks_cumulative}</td>
        <td>${c.release_events_cumulative}</td>
        <td>${c.active_job}</td>
      </tr>
    `).join('');
  }

  function saveReport(report) {
    state.report = report;
    try {
      localStorage.setItem(
        'YOYO_SHADOW_SOAK_V05_LAST_REPORT',
        JSON.stringify(report)
      );
    } catch (_) {}
  }

  function downloadReport() {
    if (!state.report) return;
    const blob = new Blob(
      [JSON.stringify(state.report, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YOYO_shadow_soak_v0_5_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function runSoak() {
    if (state.running) return;
    if (document.visibilityState === 'hidden') {
      $('run-status').textContent =
        '請先讓這個分頁保持在前景，再開始測試。';
      $('run-status').className = 'fail';
      return;
    }

    state.running = true;
    resetMetrics();
    buildRuntime();

    $('run-btn').disabled = true;
    $('stop-btn').disabled = false;
    $('download-btn').disabled = true;
    $('progress-bar').style.width = '0%';
    $('final-status').textContent = 'RUNNING';
    $('final-status').className = 'ready';
    $('run-status').textContent =
      '測試進行中：請保持此分頁在前景，不要切換分頁。';

    try {
      for (let i = 1; i <= Plan.TOTAL_JOBS; i++) {
        if (state.stopRequested || state.visibilityInterrupted) break;

        const desc = Plan.describeJob(i);
        await executeJob(desc);

        if ((i % 5) === 0 || i === 1) {
          updateProgress(i, desc.phase);
        }

        if ((i % Plan.CHECKPOINT_EVERY) === 0) {
          await takeCheckpoint(i);
        }
      }

      if (state.stopRequested && !state.visibilityInterrupted) {
        state.adapter.cancel('USER_STOP');
      }

      // Make sure no active scheduler job survives the test boundary.
      state.adapter.dispose();

      if (
        !state.stopRequested &&
        !state.visibilityInterrupted &&
        state.checkpoints.length === 10
      ) {
        const gates = evaluateGates();
        const report = makeReport(gates);
        renderFinal(report);
        saveReport(report);
        $('download-btn').disabled = false;

        $('run-status').textContent =
          gates.overall_status === 'PASS_STOP_SHADOW_INFRA_EXPANSION'
            ? 'PASS：500-job Soak 完成。可以停止擴建 Shadow 基礎設施。'
            : '測試完成，但有 Gate 未通過；請下載 JSON 進一步分析。';

      } else {
        $('final-status').textContent = state.visibilityInterrupted
          ? 'INVALID_RETRY_KEEP_TAB_VISIBLE'
          : 'STOPPED';
        $('final-status').className = 'fail';
        $('run-status').textContent = state.visibilityInterrupted
          ? '測試期間分頁曾離開前景，結果無效。請保持分頁在前景後重跑。'
          : '測試已手動停止。';
      }

    } catch (e) {
      try { state.adapter.dispose(); } catch (_) {}
      $('final-status').textContent = 'FAIL_EXCEPTION';
      $('final-status').className = 'fail';
      $('run-status').textContent = `FAIL：${e.message}`;
      $('summary').textContent = e.stack || e.message;

    } finally {
      state.running = false;
      $('run-btn').disabled = false;
      $('stop-btn').disabled = true;
    }
  }

  function stopSoak() {
    if (!state.running) return;
    state.stopRequested = true;
    try { state.adapter.cancel('USER_STOP'); } catch (_) {}
  }

  function init() {
    if (!B1 || !Array.isArray(B1.items)) {
      $('run-status').textContent = 'B1 fixture missing.';
      $('run-status').className = 'fail';
      return;
    }

    state.nodes = Mapper.flattenPaletteNodes(B1);
    state.sourceSummary = Mapper.summarize(B1, state.nodes);

    $('fixture-info').textContent =
      `${state.sourceSummary.source_images} B1 images / ` +
      `${state.sourceSummary.palette_nodes} real OKLCH nodes / ` +
      `${state.sourceSummary.observation_errors} observation errors`;

    $('environment').textContent = navigator.userAgent;
    setupLongTaskObserver();

    document.addEventListener('visibilitychange', () => {
      if (state.running && document.visibilityState === 'hidden') {
        state.visibilityInterrupted = true;
        state.stopRequested = true;
        try { state.adapter.cancel('VISIBILITY_HIDDEN'); } catch (_) {}
      }
    });

    $('run-btn').addEventListener('click', runSoak);
    $('stop-btn').addEventListener('click', stopSoak);
    $('download-btn').addEventListener('click', downloadReport);

    $('run-status').textContent =
      'READY：請保持此分頁在前景，按「Run 500-Job Soak Test」。';
    $('run-status').className = 'ready';
  }

  window.addEventListener('DOMContentLoaded', init);
})();
