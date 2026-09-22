'use strict';
const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stableStringify(value[k])).join(',') + '}';
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function canonicalizeB1(payload) {
  const out = clone(payload);
  for (const item of out.items || []) {
    const p = item && item.analysis_provenance;
    if (!p) continue;
    // These fields describe acquisition/diagnostics, not the decoded physical color observation.
    // A cache-only rerun is expected to change download -> cache, and a prior primary fetch error
    // can differ from OFFLINE_CACHE_MISS while the exact fallback bytes and ToneCore output remain identical.
    delete p.image_fetch_mode;
    delete p.primary_error;
  }
  return out;
}

function shaCanonical(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function b1PhysicalHash(payload) { return shaCanonical(canonicalizeB1(payload)); }

module.exports = { stableStringify, canonicalizeB1, shaCanonical, b1PhysicalHash };
