'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowSoakPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '0.5.0';

  const PHASES = Object.freeze([
    Object.freeze({
      id: 'WARMUP',
      start: 1,
      end: 50,
      count: 50,
      measured: false,
      description: 'JIT / cache stabilization'
    }),
    Object.freeze({
      id: 'NORMAL',
      start: 51,
      end: 250,
      count: 200,
      measured: true,
      description: '30 / 60 / 120 nodes alternating'
    }),
    Object.freeze({
      id: 'DELTA_STRESS',
      start: 251,
      end: 350,
      count: 100,
      measured: true,
      description: '25 cycles of FULL30 -> DELTA60 -> DELTA90 -> DELTA120'
    }),
    Object.freeze({
      id: 'ABORT_STORM',
      start: 351,
      end: 425,
      count: 75,
      measured: true,
      description: 'Immediate external abort before deferred Shadow work'
    }),
    Object.freeze({
      id: 'ROUTE_STORM',
      start: 426,
      end: 475,
      count: 50,
      measured: true,
      description: 'SPA route/view identity changes before deferred execution'
    }),
    Object.freeze({
      id: 'RECOVERY',
      start: 476,
      end: 500,
      count: 25,
      measured: true,
      description: 'Normal 120-node workload after storms'
    })
  ]);

  const TOTAL_JOBS = 500;
  const WARMUP_JOBS = 50;
  const FORMAL_JOBS = 450;
  const CHECKPOINT_EVERY = 50;
  const CHECKPOINTS = Object.freeze(
    Array.from({ length: 10 }, (_, i) => (i + 1) * CHECKPOINT_EVERY)
  );

  const EXPECTED_STATUS_COUNTS = Object.freeze({
    COMPLETED: 375,
    ABORTED: 75,
    STALE: 50,
    ERROR: 0
  });

  function phaseForJob(jobIndex) {
    if (!Number.isInteger(jobIndex) || jobIndex < 1 || jobIndex > TOTAL_JOBS) {
      throw new Error(`jobIndex out of range: ${jobIndex}`);
    }
    return PHASES.find(p => jobIndex >= p.start && jobIndex <= p.end);
  }

  function describeJob(jobIndex) {
    const phase = phaseForJob(jobIndex);
    const local = jobIndex - phase.start;

    if (phase.id === 'WARMUP' || phase.id === 'NORMAL') {
      const nodeCount = [30, 60, 120][local % 3];
      return {
        job_index: jobIndex,
        phase: phase.id,
        measured: phase.measured,
        kind: 'NORMAL',
        expected_status: 'COMPLETED',
        node_count: nodeCount,
        expected_projection_touches: nodeCount,
        batch: {
          mode: 'FULL',
          start_index: 0,
          end_index_exclusive: nodeCount,
          total_results_seen: nodeCount
        }
      };
    }

    if (phase.id === 'DELTA_STRESS') {
      const step = local % 4;
      const end = [30, 60, 90, 120][step];
      const start = step === 0 ? 0 : end - 30;

      return {
        job_index: jobIndex,
        phase: phase.id,
        measured: true,
        kind: step === 0 ? 'DELTA_CHAIN_FULL' : 'DELTA',
        expected_status: 'COMPLETED',
        node_count: 30,
        expected_projection_touches: 30,
        delta_cycle: Math.floor(local / 4) + 1,
        delta_step: step,
        batch: {
          mode: step === 0 ? 'FULL' : 'DELTA',
          start_index: start,
          end_index_exclusive: end,
          total_results_seen: end
        }
      };
    }

    if (phase.id === 'ABORT_STORM') {
      return {
        job_index: jobIndex,
        phase: phase.id,
        measured: true,
        kind: 'ABORT',
        expected_status: 'ABORTED',
        node_count: 120,
        expected_projection_touches: 0,
        batch: {
          mode: 'FULL',
          start_index: 0,
          end_index_exclusive: 120,
          total_results_seen: 120
        }
      };
    }

    if (phase.id === 'ROUTE_STORM') {
      return {
        job_index: jobIndex,
        phase: phase.id,
        measured: true,
        kind: 'ROUTE_STALE',
        expected_status: 'STALE',
        node_count: 120,
        expected_projection_touches: 0,
        batch: {
          mode: 'FULL',
          start_index: 0,
          end_index_exclusive: 120,
          total_results_seen: 120
        }
      };
    }

    if (phase.id === 'RECOVERY') {
      return {
        job_index: jobIndex,
        phase: phase.id,
        measured: true,
        kind: 'RECOVERY',
        expected_status: 'COMPLETED',
        node_count: 120,
        expected_projection_touches: 120,
        batch: {
          mode: 'FULL',
          start_index: 0,
          end_index_exclusive: 120,
          total_results_seen: 120
        }
      };
    }

    throw new Error(`Unknown phase: ${phase.id}`);
  }

  return Object.freeze({
    VERSION,
    PHASES,
    TOTAL_JOBS,
    WARMUP_JOBS,
    FORMAL_JOBS,
    CHECKPOINT_EVERY,
    CHECKPOINTS,
    EXPECTED_STATUS_COUNTS,
    phaseForJob,
    describeJob
  });
});
