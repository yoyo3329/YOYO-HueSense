'use strict';

/**
 * YOYO / HueSense — Shadow Job Lifecycle v0.2.0
 *
 * Owns job identity, cancellation, stale detection and reference cleanup.
 * It never ranks production results and never touches app.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowJobLifecycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '0.2.0';

  const STATE = Object.freeze({
    CREATED: 'CREATED',
    SCHEDULED: 'SCHEDULED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    ABORTED: 'ABORTED',
    STALE: 'STALE',
    TIMEOUT: 'TIMEOUT',
    ERROR: 'ERROR',
    RELEASED: 'RELEASED'
  });

  const TERMINAL = new Set([
    STATE.COMPLETED,
    STATE.ABORTED,
    STATE.STALE,
    STATE.TIMEOUT,
    STATE.ERROR,
    STATE.RELEASED
  ]);

  function assert(c, m) {
    if (!c) throw new Error(m);
  }

  function deepFreezeSmall(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const k of Object.keys(value)) deepFreezeSmall(value[k]);
    return value;
  }

  function cloneSmallContext(ctx) {
    // Context is intentionally tiny. Clone only the small contract object,
    // never the search results.
    return {
      ...ctx,
      batch: { ...ctx.batch }
    };
  }

  function createAbortController() {
    if (typeof AbortController === 'function') return new AbortController();

    // Minimal fallback for very old runtimes.
    let aborted = false;
    let reason;
    const listeners = new Set();
    return {
      signal: {
        get aborted() { return aborted; },
        get reason() { return reason; },
        addEventListener(type, fn) {
          if (type === 'abort') listeners.add(fn);
        },
        removeEventListener(type, fn) {
          if (type === 'abort') listeners.delete(fn);
        }
      },
      abort(r) {
        if (aborted) return;
        aborted = true;
        reason = r;
        for (const fn of [...listeners]) {
          try { fn({ type: 'abort' }); } catch (_) {}
        }
        listeners.clear();
      }
    };
  }

  function createShadowJob({
    context,
    resultsRef,
    externalSignal = null,
    now = () => Date.now()
  }) {
    assert(context && typeof context === 'object', 'context required');
    assert(Array.isArray(resultsRef), 'resultsRef must be an array reference');

    const controller = createAbortController();
    const frozenContext = deepFreezeSmall(cloneSmallContext(context));
    const cleanups = new Set();

    let state = STATE.CREATED;
    let stateBeforeRelease = null;
    let released = false;
    let externalAbortHandler = null;
    let startedAt = null;
    let endedAt = null;
    let errorCode = null;

    const job = {
      version: VERSION,
      context: frozenContext,
      controller,
      signal: controller.signal,
      resultsRef,
      projection: null,

      get state() { return state; },
      get stateBeforeRelease() { return stateBeforeRelease; },
      get released() { return released; },
      get startedAt() { return startedAt; },
      get endedAt() { return endedAt; },
      get errorCode() { return errorCode; },

      registerCleanup(fn) {
        assert(typeof fn === 'function', 'cleanup must be a function');
        if (released) {
          try { fn(); } catch (_) {}
          return () => {};
        }
        cleanups.add(fn);
        return () => cleanups.delete(fn);
      },

      markScheduled() {
        if (released || TERMINAL.has(state)) return false;
        state = STATE.SCHEDULED;
        return true;
      },

      markRunning() {
        if (released || controller.signal.aborted || TERMINAL.has(state)) return false;
        state = STATE.RUNNING;
        if (startedAt == null) startedAt = now();
        return true;
      },

      markCompleted() {
        if (released || controller.signal.aborted) return false;
        state = STATE.COMPLETED;
        endedAt = now();
        return true;
      },

      abort(reason = 'ABORTED') {
        if (released || TERMINAL.has(state)) return false;
        state = STATE.ABORTED;
        errorCode = String(reason || 'ABORTED');
        endedAt = now();
        controller.abort(errorCode);
        return true;
      },

      markStale(reason = 'STALE_CONTEXT') {
        if (released || TERMINAL.has(state)) return false;
        state = STATE.STALE;
        errorCode = String(reason || 'STALE_CONTEXT');
        endedAt = now();
        controller.abort(errorCode);
        return true;
      },

      markTimeout(reason = 'JOB_TIMEOUT') {
        if (released || TERMINAL.has(state)) return false;
        state = STATE.TIMEOUT;
        errorCode = String(reason || 'JOB_TIMEOUT');
        endedAt = now();
        controller.abort(errorCode);
        return true;
      },

      markError(reason = 'SHADOW_ERROR') {
        if (released || TERMINAL.has(state)) return false;
        state = STATE.ERROR;
        errorCode = String(reason || 'SHADOW_ERROR');
        endedAt = now();
        controller.abort(errorCode);
        return true;
      },

      /**
       * Compare the small immutable snapshot with current SPA/search context.
       * Returns true only when this job still belongs to the current view.
       */
      isFresh(current) {
        if (!current) return false;
        return (
          current.generation === frozenContext.generation &&
          current.view_instance_id === frozenContext.view_instance_id &&
          current.route_key_digest === frozenContext.route_key_digest &&
          current.request_id === frozenContext.request_id
        );
      },

      /**
       * Critical memory-safety operation.
       * Cancels registered handles/listeners and severs large references.
       */
      release() {
        if (released) return false;

        stateBeforeRelease = state;

        for (const fn of [...cleanups]) {
          try { fn(); } catch (_) {}
        }
        cleanups.clear();

        if (externalSignal && externalAbortHandler &&
            typeof externalSignal.removeEventListener === 'function') {
          externalSignal.removeEventListener('abort', externalAbortHandler);
        }

        // Explicitly sever references that may retain large framework/API state.
        job.resultsRef = null;
        job.projection = null;

        released = true;
        state = STATE.RELEASED;
        return true;
      }
    };

    if (externalSignal && typeof externalSignal.addEventListener === 'function') {
      externalAbortHandler = () => {
        if (!job.released && !TERMINAL.has(state)) job.abort('EXTERNAL_ABORT');
        job.release();
      };

      if (externalSignal.aborted) {
        job.abort('EXTERNAL_ABORT');
        job.release();
      } else {
        externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
      }
    }

    return job;
  }

  return Object.freeze({
    VERSION,
    STATE,
    createShadowJob
  });
});
