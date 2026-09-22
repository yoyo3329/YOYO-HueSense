'use strict';
const C = require('./shadow-result-contract.js');

let passed = 0;
let total = 0;

function expectPass(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name} — ${e.message}`);
    process.exitCode = 1;
  }
}

function expectThrow(name, fn) {
  total++;
  try {
    fn();
    console.error(`FAIL  ${name} — expected throw`);
    process.exitCode = 1;
  } catch {
    passed++;
    console.log(`PASS  ${name}`);
  }
}

const deltaContext = {
  schema_version: '0.1.0',
  request_id: 'req_001',
  job_id: 'job_001',
  generation: 4,
  view_instance_id: 'search-view-77',
  route_key_digest: 'sha256:route',
  query_digest: 'sha256:query',
  filter_digest: 'sha256:filters',
  branch: 'A',
  page: 11,
  batch: {
    mode: 'DELTA',
    start_index: 300,
    end_index_exclusive: 330,
    total_results_seen: 330,
    base_shadow_snapshot_id: 'shadow-snapshot-010'
  }
};

const deltaItems = Array.from({ length: 30 }, (_, i) => ({
  result_id: `img_${300 + i}`,
  production_rank: 301 + i,
  clip_score: 0.8,
  physical_features: { L: 0.6, C: 0.08, H: 245 }
}));

expectPass('valid DELTA input accepted', () => {
  C.assertShadowInput({ context: deltaContext, items: deltaItems });
});

expectThrow('DELTA after index 0 requires base shadow snapshot', () => {
  C.assertContext({
    ...deltaContext,
    batch: {
      ...deltaContext.batch,
      base_shadow_snapshot_id: null
    }
  });
});

expectThrow('FULL batch cannot begin at non-zero index', () => {
  C.assertContext({
    ...deltaContext,
    batch: {
      mode: 'FULL',
      start_index: 300,
      end_index_exclusive: 330,
      total_results_seen: 330,
      base_shadow_snapshot_id: null
    }
  });
});

expectThrow('duplicate result_id rejected', () => {
  C.assertShadowInput({
    context: deltaContext,
    items: [...deltaItems.slice(0, 29), deltaItems[0]]
  });
});

expectThrow('Shadow authority cannot become ranking authority', () => {
  C.assertShadowResult({
    schema_version: '0.1.0',
    candidate_version: 'v0.8-dev',
    runtime_mode: 'LOCAL',
    authority: 'RANKING',
    context: deltaContext,
    status: 'OK',
    shadow_snapshot_id: 'snap-1',
    timing: {
      projection_ms: 0.4,
      compute_ms: 1.1,
      total_ms: 1.8,
      timeout_kind: 'NONE'
    },
    error_code: null,
    items: []
  });
});

expectThrow('ABSTAIN cannot assign a shadow rank', () => {
  C.assertShadowItemResult({
    result_id: 'img_301',
    production_rank: 302,
    shadow_rank: 1,
    shadow_score: null,
    confidence: 'LOW',
    decision: 'ABSTAIN'
  });
});

expectThrow('STALE result cannot retain shadow rank', () => {
  C.assertShadowResult({
    schema_version: '0.1.0',
    candidate_version: 'v0.8-dev',
    runtime_mode: 'LOCAL',
    authority: 'NONE',
    context: deltaContext,
    status: 'STALE',
    shadow_snapshot_id: null,
    timing: {
      projection_ms: null,
      compute_ms: null,
      total_ms: 2,
      timeout_kind: 'NONE'
    },
    error_code: null,
    items: [{
      result_id: 'img_300',
      production_rank: 301,
      shadow_rank: 12,
      shadow_score: 0.2,
      confidence: 'LOW',
      decision: 'SCORED'
    }]
  });
});

expectPass('valid OK result accepted', () => {
  C.assertShadowResult({
    schema_version: '0.1.0',
    candidate_version: 'v0.8-dev',
    runtime_mode: 'LOCAL',
    authority: 'NONE',
    context: deltaContext,
    status: 'OK',
    shadow_snapshot_id: 'shadow-snapshot-011',
    timing: {
      projection_ms: 0.4,
      compute_ms: 1.1,
      total_ms: 1.8,
      timeout_kind: 'NONE'
    },
    error_code: null,
    items: [{
      result_id: 'img_300',
      production_rank: 301,
      shadow_rank: 297,
      shadow_score: 0.71,
      confidence: 'MEDIUM',
      decision: 'SCORED'
    }]
  });
});

expectPass('DISABLED terminal result stays non-authoritative', () => {
  const x = C.createTerminalResult({
    candidate_version: 'v0.8-dev',
    runtime_mode: 'OFF',
    context: {
      ...deltaContext,
      batch: {
        mode: 'FULL',
        start_index: 0,
        end_index_exclusive: 0,
        total_results_seen: 0,
        base_shadow_snapshot_id: null
      }
    },
    status: 'DISABLED'
  });
  if (x.authority !== 'NONE') throw new Error('authority changed');
});

expectThrow('route/view identity is mandatory', () => {
  const bad = { ...deltaContext };
  delete bad.view_instance_id;
  C.assertContext(bad);
});

console.log(`\n${passed}/${total} Shadow Result Contract checks ${passed === total ? 'PASS' : 'FAIL'}.`);
if (passed !== total) process.exit(1);
