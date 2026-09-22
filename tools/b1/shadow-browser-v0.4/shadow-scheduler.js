'use strict';

/**
 * YOYO / HueSense — Shadow Scheduler v0.2.0
 *
 * Goals:
 * - production render first
 * - double-rAF -> idle slot (or timeout fallback)
 * - route/generation freshness checked immediately before projection/work
 * - at most one retained job per scheduler instance
 * - abort/stale paths explicitly release resultsRef
 *
 * NOTE:
 * Main-thread synchronous CPU work cannot be forcibly interrupted by a timer.
 * Heavy compute must later become cooperative or move to a Worker.
 */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./shadow-job-lifecycle.js') : root.YOYOShadowJobLifecycle
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowScheduler = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lifecycle) {
  const VERSION = '0.2.0';

  function defaultPlatform() {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};

    const setT = g.setTimeout ? g.setTimeout.bind(g) : setTimeout;
    const clearT = g.clearTimeout ? g.clearTimeout.bind(g) : clearTimeout;

    return {
      requestAnimationFrame:
        typeof g.requestAnimationFrame === 'function'
          ? g.requestAnimationFrame.bind(g)
          : (cb) => setT(() => cb(Date.now()), 16),

      cancelAnimationFrame:
        typeof g.cancelAnimationFrame === 'function'
          ? g.cancelAnimationFrame.bind(g)
          : (id) => clearT(id),

      requestIdleCallback:
        typeof g.requestIdleCallback === 'function'
          ? g.requestIdleCallback.bind(g)
          : null,

      cancelIdleCallback:
        typeof g.cancelIdleCallback === 'function'
          ? g.cancelIdleCallback.bind(g)
          : null,

      setTimeout: setT,
      clearTimeout: clearT,

      isDocumentHidden: () =>
        typeof document !== 'undefined' && document.visibilityState === 'hidden'
    };
  }

  function createShadowScheduler({
    getCurrentContext,
    platform = defaultPlatform(),
    idleTimeoutMs = 120,
    skipWhenHidden = true
  } = {}) {
    if (typeof getCurrentContext !== 'function') {
      throw new Error('getCurrentContext function required');
    }

    let activeJob = null;

    function cleanupPendingHandles(job, handles) {
      // Register ONE dynamic cleanup. The handle values are assigned later,
      // after scheduling; reading them at cleanup time prevents queued callbacks
      // from surviving an abort/release and retaining old closures/results.
      job.registerCleanup(() => {
        if (handles.raf1 != null) platform.cancelAnimationFrame(handles.raf1);
        if (handles.raf2 != null) platform.cancelAnimationFrame(handles.raf2);
        if (handles.idle != null && platform.cancelIdleCallback) {
          platform.cancelIdleCallback(handles.idle);
        }
        if (handles.fallbackTimer != null) platform.clearTimeout(handles.fallbackTimer);
        handles.raf1 = null;
        handles.raf2 = null;
        handles.idle = null;
        handles.fallbackTimer = null;
      });
    }

    function terminateJob(job, kind, reason) {
      if (!job || job.released) return;
      if (kind === 'stale') job.markStale(reason || 'STALE_CONTEXT');
      else if (kind === 'timeout') job.markTimeout(reason || 'JOB_TIMEOUT');
      else if (kind === 'error') job.markError(reason || 'SHADOW_ERROR');
      else job.abort(reason || 'ABORTED');
      job.release();
      if (activeJob === job) activeJob = null;
    }

    function cancelActive(reason = 'SUPERSEDED') {
      if (!activeJob) return false;
      terminateJob(activeJob, 'abort', reason);
      return true;
    }

    /**
     * Latest-job retention:
     * scheduling a newer search/view job releases the older job immediately.
     */
    function schedule(job, work) {
      if (!job || typeof job.markScheduled !== 'function') {
        return Promise.reject(new Error('valid ShadowJob required'));
      }
      if (typeof work !== 'function') {
        return Promise.reject(new Error('work callback required'));
      }

      cancelActive('SUPERSEDED_BY_NEW_JOB');
      activeJob = job;
      job.markScheduled();

      const handles = {
        raf1: null,
        raf2: null,
        idle: null,
        fallbackTimer: null
      };
      cleanupPendingHandles(job, handles);

      return new Promise((resolve) => {
        let settled = false;

        const settle = (value) => {
          if (settled) return;
          settled = true;
          if (activeJob === job) activeJob = null;
          resolve(value);
        };

        const finishReleased = (status) => {
          const prior = job.stateBeforeRelease || status;
          if (!job.released) job.release();
          settle({ status: prior, job_id: job.context.job_id });
        };

        const onAbort = () => {
          if (!job.released) job.release();
          settle({
            status: job.stateBeforeRelease || Lifecycle.STATE.ABORTED,
            job_id: job.context.job_id
          });
        };

        job.signal.addEventListener('abort', onAbort, { once: true });
        job.registerCleanup(() => {
          try { job.signal.removeEventListener('abort', onAbort); } catch (_) {}
        });

        const execute = async () => {
          // CRITICAL: abort check is the first operation in the deferred callback.
          if (job.signal.aborted || job.released) {
            finishReleased(Lifecycle.STATE.ABORTED);
            return;
          }

          if (skipWhenHidden && platform.isDocumentHidden && platform.isDocumentHidden()) {
            terminateJob(job, 'abort', 'DOCUMENT_HIDDEN');
            settle({ status: Lifecycle.STATE.ABORTED, job_id: job.context.job_id });
            return;
          }

          const current = getCurrentContext();

          if (!job.isFresh(current)) {
            terminateJob(job, 'stale', 'STALE_ROUTE_OR_GENERATION');
            settle({ status: Lifecycle.STATE.STALE, job_id: job.context.job_id });
            return;
          }

          if (!job.markRunning()) {
            finishReleased(Lifecycle.STATE.ABORTED);
            return;
          }

          try {
            const value = await work(job);

            if (job.signal.aborted || job.released) {
              finishReleased(Lifecycle.STATE.ABORTED);
              return;
            }

            // Context may have changed while async work was yielding.
            if (!job.isFresh(getCurrentContext())) {
              terminateJob(job, 'stale', 'STALE_AFTER_WORK');
              settle({ status: Lifecycle.STATE.STALE, job_id: job.context.job_id });
              return;
            }

            job.markCompleted();
            const state = job.state;
            job.release();
            settle({ status: state, job_id: job.context.job_id, value });
          } catch (error) {
            if (job.signal.aborted || job.released) {
              finishReleased(Lifecycle.STATE.ABORTED);
              return;
            }
            job.markError(error && error.code ? error.code : 'SHADOW_WORK_ERROR');
            const state = job.state;
            job.release();
            settle({
              status: state,
              job_id: job.context.job_id,
              error
            });
          }
        };

        const requestIdleOrFallback = () => {
          // first operation in second-rAF callback
          if (job.signal.aborted || job.released) {
            finishReleased(Lifecycle.STATE.ABORTED);
            return;
          }

          if (platform.requestIdleCallback) {
            handles.idle = platform.requestIdleCallback(() => {
              handles.idle = null;
              // first operation in idle callback
              if (job.signal.aborted || job.released) {
                finishReleased(Lifecycle.STATE.ABORTED);
                return;
              }
              execute();
            }, { timeout: idleTimeoutMs });
          } else {
            handles.fallbackTimer = platform.setTimeout(() => {
              handles.fallbackTimer = null;
              // first operation in timeout fallback callback
              if (job.signal.aborted || job.released) {
                finishReleased(Lifecycle.STATE.ABORTED);
                return;
              }
              execute();
            }, 0);
          }
        };

        handles.raf1 = platform.requestAnimationFrame(() => {
          handles.raf1 = null;
          // first operation in first-rAF callback
          if (job.signal.aborted || job.released) {
            finishReleased(Lifecycle.STATE.ABORTED);
            return;
          }

          handles.raf2 = platform.requestAnimationFrame(() => {
            handles.raf2 = null;
            // first operation in second-rAF callback
            if (job.signal.aborted || job.released) {
              finishReleased(Lifecycle.STATE.ABORTED);
              return;
            }
            requestIdleOrFallback();
          });
        });
      });
    }

    function dispose() {
      cancelActive('SCHEDULER_DISPOSED');
    }

    return Object.freeze({
      version: VERSION,
      schedule,
      cancelActive,
      dispose,
      getActiveJob: () => activeJob
    });
  }

  return Object.freeze({
    VERSION,
    createShadowScheduler
  });
});
