'use strict';

const CONTRACT = Object.freeze({
  name: 'YOYO Network Sandbox / Capture-Replay Contract',
  version: '0.1.0'
});

const REQUIRED_FAILURE_FIXTURES = Object.freeze([
  'HTTP_404',
  'HTTP_429',
  'TIMEOUT',
  'MALFORMED_PAYLOAD'
]);

function assert(c, m) {
  if (!c) throw new Error(m);
}

function validatePolicy(p) {
  assert(p && typeof p === 'object', 'policy required');
  assert(p.contract?.name === CONTRACT.name, 'contract name mismatch');
  assert(p.contract?.version === CONTRACT.version, 'contract version mismatch');

  assert(p.deterministic_tests?.network_access === false,
    'deterministic tests must not access live network');
  assert(p.deterministic_tests?.transport === 'REPLAY_ONLY',
    'deterministic tests must use REPLAY_ONLY');
  assert(p.live_capture?.isolated_from_deterministic_pipeline === true,
    'live capture must be isolated from deterministic pipeline');
  assert(p.live_capture?.writes_frozen_fixture === true,
    'live capture must write a frozen fixture');
  assert(p.live_capture?.may_mutate_existing_fixture === false,
    'live capture may not mutate an existing fixture');
  assert(p.fixture?.hash_algorithm === 'SHA-256',
    'fixture hash must use SHA-256');
  assert(p.fixture?.content_hash_required === true,
    'fixture content hash required');
  assert(p.cache?.content_hash_required === true,
    'cache content hash required');

  const failures = new Set(p.failure_fixtures || []);
  for (const x of REQUIRED_FAILURE_FIXTURES) {
    assert(failures.has(x), `missing failure fixture: ${x}`);
  }
  return true;
}

function validateCassette(c) {
  assert(c?.contract?.name === 'YOYO Network Replay Cassette', 'cassette contract mismatch');
  assert(c?.contract?.version === '0.1.0', 'cassette version mismatch');
  assert(typeof c?.capture_id === 'string' && c.capture_id, 'capture_id required');
  assert(typeof c?.request_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(c.request_fingerprint),
    'request_fingerprint must be SHA-256');
  assert(typeof c?.response_content_hash === 'string' && /^[a-f0-9]{64}$/.test(c.response_content_hash),
    'response_content_hash must be SHA-256');
  assert(c?.immutable === true, 'cassette must be immutable');
  return true;
}

module.exports = { CONTRACT, REQUIRED_FAILURE_FIXTURES, validatePolicy, validateCassette };
