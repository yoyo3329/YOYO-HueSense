'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowSoakAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '0.5.0';

  const GATES = Object.freeze({
    recovery_p95_absolute_ms: 4,
    recovery_p99_absolute_ms: 8,
    recovery_relative_multiplier: 3,
    recovery_relative_floor_p95_ms: 2,
    recovery_relative_floor_p99_ms: 4,

    memory_growth_fail_bytes: 20 * 1024 * 1024,
    memory_slope_fail_bytes_per_job: 20 * 1024,

    harness_dom_node_drift_max: 0,
    long_tasks_max: 0
  });

  function percentile(values, p) {
    if (!values || !values.length) return null;
    const a = [...values].sort((x, y) => x - y);
    const i = Math.max(0, Math.min(a.length - 1, Math.ceil(p * a.length) - 1));
    return a[i];
  }

  function summarize(values) {
    if (!values || !values.length) {
      return { samples: 0, p50: null, p95: null, p99: null, max: null };
    }
    return {
      samples: values.length,
      p50: percentile(values, 0.50),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      max: Math.max(...values)
    };
  }

  function linearSlope(points) {
    if (!points || points.length < 2) return null;
    const n = points.length;
    const meanX = points.reduce((s, p) => s + p.x, 0) / n;
    const meanY = points.reduce((s, p) => s + p.y, 0) / n;

    let num = 0, den = 0;
    for (const p of points) {
      const dx = p.x - meanX;
      num += dx * (p.y - meanY);
      den += dx * dx;
    }
    return den === 0 ? 0 : num / den;
  }

  function analyzeMemory(checkpoints) {
    const usable = checkpoints
      .filter(c => Number.isFinite(c.heap_used_bytes))
      .map(c => ({ job: c.job_index, heap: c.heap_used_bytes }));

    if (usable.length < 4) {
      return {
        supported: false,
        status: 'UNSUPPORTED_OR_INSUFFICIENT',
        gate_pass: true,
        note: 'Heap trend is advisory when performance.memory is unavailable.'
      };
    }

    const start = usable[0];
    const end = usable[usable.length - 1];
    const growth = end.heap - start.heap;

    const last5 = usable.slice(-5);
    const strictIncreaseLast5 =
      last5.length === 5 &&
      last5.every((p, i) => i === 0 || p.heap > last5[i - 1].heap);

    const slope = linearSlope(
      usable.map(p => ({ x: p.job, y: p.heap }))
    );

    const suspicious =
      growth > GATES.memory_growth_fail_bytes &&
      strictIncreaseLast5 &&
      slope != null &&
      slope > GATES.memory_slope_fail_bytes_per_job;

    return {
      supported: true,
      status: suspicious
        ? 'WARN_POSSIBLE_UNBOUNDED_GROWTH'
        : 'PASS_NO_UNBOUNDED_GROWTH_SIGNAL',
      gate_pass: !suspicious,
      start_job: start.job,
      start_heap_bytes: start.heap,
      end_job: end.job,
      end_heap_bytes: end.heap,
      growth_bytes: growth,
      strict_increase_last5: strictIncreaseLast5,
      slope_bytes_per_job: slope,
      thresholds: {
        growth_fail_bytes: GATES.memory_growth_fail_bytes,
        slope_fail_bytes_per_job: GATES.memory_slope_fail_bytes_per_job,
        requires_strict_increase_last5: true
      }
    };
  }

  function evaluateRecovery(baseline120, recovery120) {
    const b = summarize(baseline120);
    const r = summarize(recovery120);

    if (!b.samples || !r.samples) {
      return {
        gate_pass: false,
        status: 'INSUFFICIENT_DATA',
        baseline: b,
        recovery: r
      };
    }

    const relativeP95Limit = Math.max(
      GATES.recovery_relative_floor_p95_ms,
      b.p95 * GATES.recovery_relative_multiplier
    );
    const relativeP99Limit = Math.max(
      GATES.recovery_relative_floor_p99_ms,
      b.p99 * GATES.recovery_relative_multiplier
    );

    const checks = {
      absolute_p95:
        r.p95 <= GATES.recovery_p95_absolute_ms,
      absolute_p99:
        r.p99 <= GATES.recovery_p99_absolute_ms,
      relative_p95:
        r.p95 <= relativeP95Limit,
      relative_p99:
        r.p99 <= relativeP99Limit
    };

    return {
      gate_pass: Object.values(checks).every(Boolean),
      status: Object.values(checks).every(Boolean)
        ? 'PASS'
        : 'FAIL_RECOVERY_LATENCY_REGRESSION',
      baseline: b,
      recovery: r,
      checks,
      limits: {
        absolute_p95_ms: GATES.recovery_p95_absolute_ms,
        absolute_p99_ms: GATES.recovery_p99_absolute_ms,
        relative_p95_ms: relativeP95Limit,
        relative_p99_ms: relativeP99Limit
      }
    };
  }

  return Object.freeze({
    VERSION,
    GATES,
    percentile,
    summarize,
    linearSlope,
    analyzeMemory,
    evaluateRecovery
  });
});
