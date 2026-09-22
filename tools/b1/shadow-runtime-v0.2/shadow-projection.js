'use strict';

/**
 * YOYO / HueSense — Shadow Projection v0.2.0
 *
 * Converts ONLY the requested FULL/DELTA range into the v0.1 minimal contract.
 * No deep clone, no DOM/framework state, no re-processing old infinite-scroll pages.
 */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./shadow-result-contract.js') : root.YOYOShadowResultContract
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowProjection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract) {
  const VERSION = '0.2.0';

  class ShadowJobCanceledError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'ShadowJobCanceledError';
      this.code = code || 'SHADOW_JOB_CANCELED';
    }
  }

  function assert(c, m) {
    if (!c) throw new Error(m);
  }

  function checkAlive(job) {
    if (!job || job.released || job.signal.aborted || !job.resultsRef) {
      throw new ShadowJobCanceledError('Shadow job is no longer runnable');
    }
  }

  function normalizePhysicalFeatures(raw) {
    assert(raw && typeof raw === 'object', 'physical features accessor returned no data');

    const L = Number(raw.L);
    const C = Number(raw.C);
    const H = raw.H == null ? null : Number(raw.H);

    return { L, C, H };
  }

  /**
   * Accessors deliberately keep this module independent of current app.js field names.
   */
  function createShadowProjection(job, accessors, options = {}) {
    checkAlive(job); // first executable safety check

    const {
      getResultId,
      getProductionRank,
      getClipScore,
      getPhysicalFeatures
    } = accessors || {};

    assert(typeof getResultId === 'function', 'getResultId accessor required');
    assert(typeof getProductionRank === 'function', 'getProductionRank accessor required');
    assert(typeof getClipScore === 'function', 'getClipScore accessor required');
    assert(typeof getPhysicalFeatures === 'function', 'getPhysicalFeatures accessor required');

    const checkEvery = Math.max(1, Number(options.checkAbortEvery || 8));
    const { start_index: start, end_index_exclusive: end } = job.context.batch;
    const ref = job.resultsRef;

    assert(end <= ref.length,
      `batch end ${end} exceeds resultsRef length ${ref.length}`);

    const items = new Array(end - start);
    let outIndex = 0;

    for (let i = start; i < end; i++, outIndex++) {
      if ((outIndex % checkEvery) === 0) checkAlive(job);

      const raw = ref[i];
      const item = {
        result_id: String(getResultId(raw, i)),
        production_rank: Number(getProductionRank(raw, i)),
        clip_score: (() => {
          const v = getClipScore(raw, i);
          return v == null ? null : Number(v);
        })(),
        physical_features: normalizePhysicalFeatures(getPhysicalFeatures(raw, i))
      };

      Contract.assertProjectedItem(item);
      items[outIndex] = item;
    }

    checkAlive(job);

    const projected = {
      context: job.context,
      items
    };

    Contract.assertShadowInput(projected);
    job.projection = projected;
    return projected;
  }

  return Object.freeze({
    VERSION,
    ShadowJobCanceledError,
    createShadowProjection
  });
});
