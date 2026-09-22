'use strict';

/**
 * YOYO / HueSense
 * Shadow Result Contract v0.1.0
 *
 * Contract-first boundary for non-authoritative Shadow computation.
 *
 * HARD INVARIANTS
 * ---------------
 * - authority MUST be "NONE"
 * - no production ranking/filter/render mutation
 * - no raw API response / DOM / framework state in ShadowInput
 * - request_id + job_id + generation + view_instance_id are mandatory
 * - FULL / DELTA processing are first-class
 * - ABSTAIN is telemetry-only in v0.1
 * - STALE / ABORTED / TIMEOUT / ERROR may not emit usable shadow ranks
 * - Guardrails / Canary / A-B traffic / production authority are OUT OF SCOPE
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowResultContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '0.1.0';

  const RUNTIME_MODE = Object.freeze({
    OFF: 'OFF',
    LOCAL: 'LOCAL',
    WORKER: 'WORKER'
  });

  const AUTHORITY = Object.freeze({
    NONE: 'NONE'
  });

  const BATCH_MODE = Object.freeze({
    FULL: 'FULL',
    DELTA: 'DELTA'
  });

  const JOB_STATUS = Object.freeze({
    OK: 'OK',
    ABORTED: 'ABORTED',
    STALE: 'STALE',
    TIMEOUT: 'TIMEOUT',
    ERROR: 'ERROR',
    DISABLED: 'DISABLED'
  });

  const CONFIDENCE = Object.freeze({
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW',
    UNKNOWN: 'UNKNOWN'
  });

  const DECISION = Object.freeze({
    SCORED: 'SCORED',
    ABSTAIN: 'ABSTAIN',
    UNAVAILABLE: 'UNAVAILABLE'
  });

  const TIMEOUT_KIND = Object.freeze({
    NONE: 'NONE',
    SOFT_BUDGET: 'SOFT_BUDGET',
    JOB_TIMEOUT: 'JOB_TIMEOUT',
    HARD_HANG: 'HARD_HANG'
  });

  const schemas = Object.freeze({
    ShadowContextV01: {
      $id: 'YOYO.ShadowContext.v0.1',
      type: 'object',
      additionalProperties: false,
      required: [
        'schema_version',
        'request_id',
        'job_id',
        'generation',
        'view_instance_id',
        'route_key_digest',
        'query_digest',
        'filter_digest',
        'branch',
        'page',
        'batch'
      ],
      properties: {
        schema_version: { const: VERSION },
        request_id: { type: 'string', minLength: 1, maxLength: 128 },
        job_id: { type: 'string', minLength: 1, maxLength: 128 },
        generation: { type: 'integer', minimum: 0 },
        view_instance_id: { type: 'string', minLength: 1, maxLength: 128 },
        route_key_digest: { type: 'string', minLength: 1, maxLength: 256 },
        query_digest: { type: 'string', minLength: 1, maxLength: 256 },
        filter_digest: { type: 'string', minLength: 1, maxLength: 256 },
        branch: { type: 'string', minLength: 1, maxLength: 32 },
        page: { type: 'integer', minimum: 1 },
        batch: {
          type: 'object',
          additionalProperties: false,
          required: [
            'mode',
            'start_index',
            'end_index_exclusive',
            'total_results_seen'
          ],
          properties: {
            mode: { enum: Object.values(BATCH_MODE) },
            start_index: { type: 'integer', minimum: 0 },
            end_index_exclusive: { type: 'integer', minimum: 0 },
            total_results_seen: { type: 'integer', minimum: 0 },
            base_shadow_snapshot_id: { type: ['string', 'null'] }
          }
        }
      }
    },

    ShadowProjectedItemV01: {
      $id: 'YOYO.ShadowProjectedItem.v0.1',
      type: 'object',
      additionalProperties: false,
      required: [
        'result_id',
        'production_rank',
        'clip_score',
        'physical_features'
      ],
      properties: {
        result_id: { type: 'string', minLength: 1, maxLength: 256 },
        production_rank: { type: 'integer', minimum: 1 },
        clip_score: { type: ['number', 'null'] },
        physical_features: {
          type: 'object',
          additionalProperties: false,
          required: ['L', 'C', 'H'],
          properties: {
            L: { type: 'number', minimum: 0, maximum: 1 },
            C: { type: 'number', minimum: 0 },
            H: { type: ['number', 'null'], minimum: 0, maximum: 360 }
          }
        }
      }
    },

    ShadowInputV01: {
      $id: 'YOYO.ShadowInput.v0.1',
      type: 'object',
      additionalProperties: false,
      required: ['context', 'items'],
      properties: {
        context: { $ref: 'YOYO.ShadowContext.v0.1' },
        items: {
          type: 'array',
          items: { $ref: 'YOYO.ShadowProjectedItem.v0.1' }
        }
      }
    },

    ShadowItemResultV01: {
      $id: 'YOYO.ShadowItemResult.v0.1',
      type: 'object',
      additionalProperties: false,
      required: [
        'result_id',
        'production_rank',
        'shadow_rank',
        'shadow_score',
        'confidence',
        'decision'
      ],
      properties: {
        result_id: { type: 'string', minLength: 1, maxLength: 256 },
        production_rank: { type: 'integer', minimum: 1 },
        shadow_rank: { type: ['integer', 'null'], minimum: 1 },
        shadow_score: { type: ['number', 'null'] },
        confidence: { enum: Object.values(CONFIDENCE) },
        decision: { enum: Object.values(DECISION) }
      }
    },

    ShadowResultV01: {
      $id: 'YOYO.ShadowResult.v0.1',
      type: 'object',
      additionalProperties: false,
      required: [
        'schema_version',
        'candidate_version',
        'runtime_mode',
        'authority',
        'context',
        'status',
        'shadow_snapshot_id',
        'timing',
        'error_code',
        'items'
      ],
      properties: {
        schema_version: { const: VERSION },
        candidate_version: { type: 'string', minLength: 1, maxLength: 128 },
        runtime_mode: { enum: Object.values(RUNTIME_MODE) },
        authority: { const: AUTHORITY.NONE },
        context: { $ref: 'YOYO.ShadowContext.v0.1' },
        status: { enum: Object.values(JOB_STATUS) },
        shadow_snapshot_id: { type: ['string', 'null'] },
        timing: {
          type: 'object',
          additionalProperties: false,
          required: [
            'projection_ms',
            'compute_ms',
            'total_ms',
            'timeout_kind'
          ],
          properties: {
            projection_ms: { type: ['number', 'null'], minimum: 0 },
            compute_ms: { type: ['number', 'null'], minimum: 0 },
            total_ms: { type: ['number', 'null'], minimum: 0 },
            timeout_kind: { enum: Object.values(TIMEOUT_KIND) }
          }
        },
        error_code: { type: ['string', 'null'] },
        items: {
          type: 'array',
          items: { $ref: 'YOYO.ShadowItemResult.v0.1' }
        }
      }
    }
  });

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function finiteNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  function assertContext(ctx) {
    assert(ctx && typeof ctx === 'object', 'context must be object');
    assert(ctx.schema_version === VERSION, `schema_version must be ${VERSION}`);
    assert(typeof ctx.request_id === 'string' && ctx.request_id, 'request_id required');
    assert(typeof ctx.job_id === 'string' && ctx.job_id, 'job_id required');
    assert(Number.isInteger(ctx.generation) && ctx.generation >= 0, 'generation invalid');
    assert(typeof ctx.view_instance_id === 'string' && ctx.view_instance_id,
      'view_instance_id required');
    assert(typeof ctx.route_key_digest === 'string' && ctx.route_key_digest,
      'route_key_digest required');
    assert(typeof ctx.query_digest === 'string' && ctx.query_digest, 'query_digest required');
    assert(typeof ctx.filter_digest === 'string' && ctx.filter_digest, 'filter_digest required');
    assert(typeof ctx.branch === 'string' && ctx.branch, 'branch required');
    assert(Number.isInteger(ctx.page) && ctx.page >= 1, 'page invalid');

    const b = ctx.batch;
    assert(b && typeof b === 'object', 'batch required');
    assert(Object.values(BATCH_MODE).includes(b.mode), 'batch.mode invalid');
    assert(Number.isInteger(b.start_index) && b.start_index >= 0, 'batch.start_index invalid');
    assert(
      Number.isInteger(b.end_index_exclusive) &&
      b.end_index_exclusive >= b.start_index,
      'batch.end_index_exclusive invalid'
    );
    assert(
      Number.isInteger(b.total_results_seen) &&
      b.total_results_seen >= b.end_index_exclusive,
      'batch.total_results_seen invalid'
    );

    if (b.mode === BATCH_MODE.FULL) {
      assert(b.start_index === 0, 'FULL batch must start at index 0');
      assert(
        b.base_shadow_snapshot_id == null,
        'FULL batch cannot reference base_shadow_snapshot_id'
      );
    }

    if (b.mode === BATCH_MODE.DELTA && b.start_index > 0) {
      assert(
        typeof b.base_shadow_snapshot_id === 'string' &&
        b.base_shadow_snapshot_id.length > 0,
        'DELTA batch after index 0 requires base_shadow_snapshot_id'
      );
    }

    return true;
  }

  function assertProjectedItem(item) {
    assert(item && typeof item === 'object', 'projected item must be object');
    assert(typeof item.result_id === 'string' && item.result_id, 'result_id required');
    assert(
      Number.isInteger(item.production_rank) && item.production_rank >= 1,
      'production_rank invalid'
    );
    assert(item.clip_score === null || finiteNumber(item.clip_score), 'clip_score invalid');

    const f = item.physical_features;
    assert(f && typeof f === 'object', 'physical_features required');
    assert(finiteNumber(f.L) && f.L >= 0 && f.L <= 1, 'L invalid');
    assert(finiteNumber(f.C) && f.C >= 0, 'C invalid');
    assert(
      f.H === null || (finiteNumber(f.H) && f.H >= 0 && f.H <= 360),
      'H invalid'
    );
    return true;
  }

  function assertShadowInput(input) {
    assert(input && typeof input === 'object', 'shadow input must be object');
    assertContext(input.context);
    assert(Array.isArray(input.items), 'items must be array');

    const seen = new Set();
    for (const item of input.items) {
      assertProjectedItem(item);
      assert(!seen.has(item.result_id), `duplicate result_id: ${item.result_id}`);
      seen.add(item.result_id);
    }

    const b = input.context.batch;
    const expected = b.end_index_exclusive - b.start_index;
    assert(
      input.items.length === expected,
      `items length ${input.items.length} != batch range ${expected}`
    );

    return true;
  }

  function assertShadowItemResult(item) {
    assert(item && typeof item === 'object', 'shadow item result must be object');
    assert(typeof item.result_id === 'string' && item.result_id, 'result_id required');
    assert(
      Number.isInteger(item.production_rank) && item.production_rank >= 1,
      'production_rank invalid'
    );
    assert(
      item.shadow_rank === null ||
      (Number.isInteger(item.shadow_rank) && item.shadow_rank >= 1),
      'shadow_rank invalid'
    );
    assert(item.shadow_score === null || finiteNumber(item.shadow_score),
      'shadow_score invalid');
    assert(Object.values(CONFIDENCE).includes(item.confidence), 'confidence invalid');
    assert(Object.values(DECISION).includes(item.decision), 'decision invalid');

    if (item.decision === DECISION.ABSTAIN) {
      assert(item.shadow_rank === null, 'ABSTAIN must not assign shadow_rank');
    }
    return true;
  }

  function assertShadowResult(result) {
    assert(result && typeof result === 'object', 'shadow result must be object');
    assert(result.schema_version === VERSION, `schema_version must be ${VERSION}`);
    assert(
      typeof result.candidate_version === 'string' && result.candidate_version,
      'candidate_version required'
    );
    assert(Object.values(RUNTIME_MODE).includes(result.runtime_mode), 'runtime_mode invalid');

    // Production safety invariant.
    assert(result.authority === AUTHORITY.NONE, 'Shadow authority MUST remain NONE');

    assertContext(result.context);
    assert(Object.values(JOB_STATUS).includes(result.status), 'status invalid');

    const t = result.timing;
    assert(t && typeof t === 'object', 'timing required');
    for (const k of ['projection_ms', 'compute_ms', 'total_ms']) {
      assert(
        t[k] === null || (finiteNumber(t[k]) && t[k] >= 0),
        `${k} invalid`
      );
    }
    assert(Object.values(TIMEOUT_KIND).includes(t.timeout_kind),
      'timeout_kind invalid');

    assert(
      result.error_code === null || typeof result.error_code === 'string',
      'error_code invalid'
    );
    assert(Array.isArray(result.items), 'items must be array');

    const seen = new Set();
    for (const item of result.items) {
      assertShadowItemResult(item);
      assert(!seen.has(item.result_id), `duplicate result_id in result: ${item.result_id}`);
      seen.add(item.result_id);
    }

    if (result.status !== JOB_STATUS.OK) {
      for (const item of result.items) {
        assert(
          item.shadow_rank === null,
          `${result.status} result must not retain shadow_rank`
        );
      }
    }

    if (result.status === JOB_STATUS.OK) {
      assert(
        typeof result.shadow_snapshot_id === 'string' &&
        result.shadow_snapshot_id.length > 0,
        'OK result requires shadow_snapshot_id'
      );
    } else {
      assert(
        result.shadow_snapshot_id === null,
        'non-OK result cannot publish shadow_snapshot_id'
      );
    }

    return true;
  }

  function createTerminalResult({
    candidate_version,
    runtime_mode,
    context,
    status,
    timeout_kind = TIMEOUT_KIND.NONE,
    error_code = null
  }) {
    assert(status !== JOB_STATUS.OK, 'createTerminalResult is for non-OK states only');

    const result = {
      schema_version: VERSION,
      candidate_version,
      runtime_mode,
      authority: AUTHORITY.NONE,
      context,
      status,
      shadow_snapshot_id: null,
      timing: {
        projection_ms: null,
        compute_ms: null,
        total_ms: null,
        timeout_kind
      },
      error_code,
      items: []
    };

    assertShadowResult(result);
    return result;
  }

  return Object.freeze({
    VERSION,
    RUNTIME_MODE,
    AUTHORITY,
    BATCH_MODE,
    JOB_STATUS,
    CONFIDENCE,
    DECISION,
    TIMEOUT_KIND,
    schemas,
    assertContext,
    assertProjectedItem,
    assertShadowInput,
    assertShadowItemResult,
    assertShadowResult,
    createTerminalResult
  });
});
