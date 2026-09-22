'use strict';

/**
 * YOYO / HueSense — Shadow Runner v0.3.0
 *
 * Execution abstraction.
 * v0.3 supports OFF and LOCAL.
 * WORKER is reserved and intentionally not activated yet.
 */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./shadow-result-contract.js') : root.YOYOShadowResultContract
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract) {
  const VERSION = '0.3.0';

  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  function hash32(input) {
    // Deterministic non-cryptographic snapshot id; identity only, not security.
    let h = 2166136261 >>> 0;
    const s = String(input);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function makeSnapshotId(candidateVersion, context, items) {
    const identity = [
      candidateVersion,
      context.request_id,
      context.job_id,
      context.generation,
      context.view_instance_id,
      context.batch.mode,
      context.batch.start_index,
      context.batch.end_index_exclusive,
      ...items.map(x => `${x.result_id}:${x.shadow_rank ?? 'A'}:${x.shadow_score ?? 'N'}`)
    ].join('|');

    return `shadow_${hash32(identity)}`;
  }

  function createShadowRunner({
    mode = Contract.RUNTIME_MODE.OFF,
    candidate = null,
    candidateVersion = null
  } = {}) {
    if (!Object.values(Contract.RUNTIME_MODE).includes(mode)) {
      throw new Error(`Invalid runner mode: ${mode}`);
    }

    if (mode === Contract.RUNTIME_MODE.LOCAL) {
      if (!candidate || typeof candidate.run !== 'function') {
        throw new Error('LOCAL mode requires candidate.run(projectedInput)');
      }
    }

    if (mode === Contract.RUNTIME_MODE.WORKER) {
      throw new Error('WORKER mode is reserved but intentionally not enabled in v0.3');
    }

    const resolvedCandidateVersion =
      candidateVersion ||
      (candidate && candidate.VERSION) ||
      'none';

    async function run(projectedInput, { signal = null } = {}) {
      Contract.assertShadowInput(projectedInput);

      if (signal && signal.aborted) {
        return Contract.createTerminalResult({
          candidate_version: resolvedCandidateVersion,
          runtime_mode: mode,
          context: projectedInput.context,
          status: Contract.JOB_STATUS.ABORTED,
          error_code: 'ABORTED_BEFORE_RUN'
        });
      }

      if (mode === Contract.RUNTIME_MODE.OFF) {
        return Contract.createTerminalResult({
          candidate_version: resolvedCandidateVersion,
          runtime_mode: mode,
          context: projectedInput.context,
          status: Contract.JOB_STATUS.DISABLED
        });
      }

      const started = nowMs();

      let items;
      try {
        items = await candidate.run(projectedInput, { signal });
      } catch (error) {
        return Contract.createTerminalResult({
          candidate_version: resolvedCandidateVersion,
          runtime_mode: mode,
          context: projectedInput.context,
          status: Contract.JOB_STATUS.ERROR,
          error_code: error && error.code ? String(error.code) : 'CANDIDATE_ERROR'
        });
      }

      if (signal && signal.aborted) {
        return Contract.createTerminalResult({
          candidate_version: resolvedCandidateVersion,
          runtime_mode: mode,
          context: projectedInput.context,
          status: Contract.JOB_STATUS.ABORTED,
          error_code: 'ABORTED_AFTER_RUN'
        });
      }

      const computeMs = Math.max(0, nowMs() - started);

      const result = {
        schema_version: Contract.VERSION,
        candidate_version: resolvedCandidateVersion,
        runtime_mode: mode,
        authority: Contract.AUTHORITY.NONE,
        context: projectedInput.context,
        status: Contract.JOB_STATUS.OK,
        shadow_snapshot_id: makeSnapshotId(
          resolvedCandidateVersion,
          projectedInput.context,
          items
        ),
        timing: {
          projection_ms: null,
          compute_ms: computeMs,
          total_ms: computeMs,
          timeout_kind: Contract.TIMEOUT_KIND.NONE
        },
        error_code: null,
        items
      };

      Contract.assertShadowResult(result);
      return result;
    }

    return Object.freeze({
      version: VERSION,
      mode,
      candidateVersion: resolvedCandidateVersion,
      run
    });
  }

  return Object.freeze({
    VERSION,
    createShadowRunner
  });
});
