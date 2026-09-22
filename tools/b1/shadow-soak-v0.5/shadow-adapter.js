'use strict';

/**
 * YOYO / HueSense — Shadow Adapter v0.3.0
 *
 * Contract boundary:
 * - receives explicit immutable context + raw result reference
 * - schedules AFTER production render opportunity
 * - builds minimal projection only inside deferred work
 * - runs non-authoritative Shadow runner
 * - never mutates production search results
 */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./shadow-result-contract.js') : root.YOYOShadowResultContract,
    typeof require === 'function' ? require('./shadow-job-lifecycle.js') : root.YOYOShadowJobLifecycle,
    typeof require === 'function' ? require('./shadow-projection.js') : root.YOYOShadowProjection
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract, Lifecycle, Projection) {
  const VERSION = '0.3.0';

  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  function createShadowAdapter({
    scheduler,
    runner,
    accessors,
    getCurrentContext,
    projectionOptions = {},
    jobHooks = null
  } = {}) {
    if (!scheduler || typeof scheduler.schedule !== 'function') {
      throw new Error('scheduler required');
    }
    if (!runner || typeof runner.run !== 'function') {
      throw new Error('runner required');
    }
    if (typeof getCurrentContext !== 'function') {
      throw new Error('getCurrentContext required');
    }

    let observationSequence = 0;

    function observe({
      context,
      resultsRef,
      externalSignal = null
    }) {
      Contract.assertContext(context);

      const expectedEnd = context.batch.end_index_exclusive;
      if (!Array.isArray(resultsRef) || resultsRef.length < expectedEnd) {
        return Promise.reject(
          new Error(`resultsRef must contain at least ${expectedEnd} entries`)
        );
      }

      const job = Lifecycle.createShadowJob({
        context,
        resultsRef,
        externalSignal,
        onRelease: jobHooks && typeof jobHooks.onRelease === 'function'
          ? jobHooks.onRelease
          : null
      });

      const sequence = ++observationSequence;

      return scheduler.schedule(job, async (runningJob) => {
        // First operation in actual work body.
        if (runningJob.signal.aborted || runningJob.released) {
          return Contract.createTerminalResult({
            candidate_version: runner.candidateVersion || 'unknown',
            runtime_mode: runner.mode || Contract.RUNTIME_MODE.OFF,
            context: runningJob.context,
            status: Contract.JOB_STATUS.ABORTED,
            error_code: 'ABORTED_AT_ADAPTER_ENTRY'
          });
        }

        const projectionStart = nowMs();
        const projected = Projection.createShadowProjection(
          runningJob,
          accessors,
          projectionOptions
        );
        const projectionMs = Math.max(0, nowMs() - projectionStart);

        if (runningJob.signal.aborted || runningJob.released) {
          return Contract.createTerminalResult({
            candidate_version: runner.candidateVersion || 'unknown',
            runtime_mode: runner.mode || Contract.RUNTIME_MODE.OFF,
            context: runningJob.context,
            status: Contract.JOB_STATUS.ABORTED,
            error_code: 'ABORTED_AFTER_PROJECTION'
          });
        }

        const result = await runner.run(projected, { signal: runningJob.signal });

        // Shadow Result is immutable from the adapter's perspective.
        if (result.status === Contract.JOB_STATUS.OK) {
          result.timing.projection_ms = projectionMs;
          result.timing.total_ms =
            projectionMs + (result.timing.compute_ms || 0);
        }

        Contract.assertShadowResult(result);

        return Object.freeze({
          adapter_version: VERSION,
          observation_sequence: sequence,
          shadow: result
        });
      });
    }

    function cancel(reason = 'ADAPTER_CANCEL') {
      return scheduler.cancelActive(reason);
    }

    function dispose() {
      scheduler.dispose();
    }

    return Object.freeze({
      version: VERSION,
      observe,
      cancel,
      dispose
    });
  }

  return Object.freeze({
    VERSION,
    createShadowAdapter
  });
});
