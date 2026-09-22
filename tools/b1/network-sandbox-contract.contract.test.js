'use strict';
const C = require('./network-sandbox-contract-v0_1.js');
const P = require('./network_sandbox_policy_v0_6d1.json');
let pass = 0, total = 0;
function t(name, fn) {
  total++;
  try { fn(); pass++; console.log('PASS ', name); }
  catch (e) { console.error('FAIL ', name, '—', e.message); }
}
t('deterministic tests are replay-only and offline', () => C.validatePolicy(P));
t('live capture is isolated from deterministic pipeline', () => {
  if (!P.live_capture.isolated_from_deterministic_pipeline) throw new Error('not isolated');
});
t('capture cannot mutate existing fixture', () => {
  if (P.live_capture.may_mutate_existing_fixture) throw new Error('mutation allowed');
});
t('fixture and cache content hashes are mandatory', () => {
  if (!P.fixture.content_hash_required || !P.cache.content_hash_required) throw new Error('hash not required');
});
t('404/429/timeout/malformed fixtures are mandatory', () => {
  for (const x of C.REQUIRED_FAILURE_FIXTURES) if (!P.failure_fixtures.includes(x)) throw new Error(x);
});
t('valid immutable cassette is accepted', () => C.validateCassette({
  contract:{name:'YOYO Network Replay Cassette',version:'0.1.0'},
  capture_id:'fixture_001',
  request_fingerprint:'a'.repeat(64),
  response_content_hash:'b'.repeat(64),
  immutable:true
}));
t('mutable cassette is rejected', () => {
  let ok = false;
  try {
    C.validateCassette({
      contract:{name:'YOYO Network Replay Cassette',version:'0.1.0'},
      capture_id:'fixture_001',
      request_fingerprint:'a'.repeat(64),
      response_content_hash:'b'.repeat(64),
      immutable:false
    });
  } catch { ok = true; }
  if (!ok) throw new Error('mutable cassette accepted');
});
console.log(`\n${pass}/${total} NetworkSandbox contract tests ${pass===total?'PASS':'FAIL'}.`);
if (pass !== total) process.exit(1);
