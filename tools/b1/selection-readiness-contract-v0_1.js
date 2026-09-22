'use strict';

const CONTRACT = Object.freeze({
  name: 'YOYO Selection / Readiness State Contract',
  version: '0.1.0'
});

const STATES = Object.freeze([
  'DATA_PENDING',
  'REFERENCES_CAPTURED',
  'CACHE_READY',
  'PENDING_VISUAL_SELECTION',
  'SELECTION_READY',
  'DATA_READY'
]);

const ACCEPTED_SELECTION_PROVENANCE = Object.freeze([
  'CLIP_RANKED_FIXED_SET',
  'LEGACY_FIXED_EVALUATION_SET'
]);

function assert(c, m) {
  if (!c) throw new Error(m);
}

function evaluate(x = {}) {
  if (!x.reference_manifest_ready) return { state: 'DATA_PENDING', eligible: false };
  if (!x.cache_manifest_ready) return { state: 'REFERENCES_CAPTURED', eligible: false };
  if (!x.cache_complete) return { state: 'CACHE_READY', eligible: false };

  if (!x.selection_provenance) {
    return { state: 'PENDING_VISUAL_SELECTION', eligible: false };
  }
  if (!ACCEPTED_SELECTION_PROVENANCE.includes(x.selection_provenance)) {
    return { state: 'PENDING_VISUAL_SELECTION', eligible: false };
  }
  if (!x.evaluation_set_ready) {
    return { state: 'SELECTION_READY', eligible: false };
  }
  if (!x.reference_audit_pass) {
    return { state: 'SELECTION_READY', eligible: false };
  }
  return { state: 'DATA_READY', eligible: true };
}

function validateState(s) {
  assert(STATES.includes(s), 'unknown readiness state');
  return true;
}

module.exports = { CONTRACT, STATES, ACCEPTED_SELECTION_PROVENANCE, evaluate, validateState };
