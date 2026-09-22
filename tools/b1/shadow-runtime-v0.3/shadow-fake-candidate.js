'use strict';

/**
 * YOYO / HueSense — Deterministic Fake Shadow Candidate v0.3.0
 *
 * TEST-ONLY candidate.
 * It is deliberately NOT the v0.8 perceptual model and must never be treated
 * as scientific evidence or production ranking authority.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowFakeCandidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '0.3.0-test-only';

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function hueSignal(H) {
    if (H == null || !Number.isFinite(H)) return 0.5;
    const radians = (H / 180) * Math.PI;
    return 0.5 + 0.5 * Math.cos(radians);
  }

  function scoreItem(item) {
    const f = item.physical_features;
    const clip = item.clip_score == null ? 0.5 : clamp01(item.clip_score);
    const lightness = clamp01(f.L);
    const chroma = clamp01(f.C / 0.25);
    const hue = hueSignal(f.H);

    // Simple deterministic arithmetic only.
    const score = (
      0.55 * clip +
      0.20 * lightness +
      0.20 * chroma +
      0.05 * hue
    );

    const distanceFromMid = Math.abs(score - 0.5);
    const confidence =
      distanceFromMid >= 0.25 ? 'HIGH' :
      distanceFromMid >= 0.12 ? 'MEDIUM' :
      'LOW';

    const decision = confidence === 'LOW' ? 'ABSTAIN' : 'SCORED';

    return {
      result_id: item.result_id,
      production_rank: item.production_rank,
      raw_score: score,
      confidence,
      decision
    };
  }

  function run(projectedInput) {
    if (!projectedInput || !Array.isArray(projectedInput.items)) {
      throw new Error('projectedInput.items required');
    }

    const rows = projectedInput.items.map(scoreItem);

    const scored = rows
      .filter(x => x.decision === 'SCORED')
      .sort((a, b) =>
        (b.raw_score - a.raw_score) ||
        (a.production_rank - b.production_rank) ||
        a.result_id.localeCompare(b.result_id)
      );

    const rankMap = new Map();
    scored.forEach((x, i) => rankMap.set(x.result_id, i + 1));

    return rows.map(x => ({
      result_id: x.result_id,
      production_rank: x.production_rank,
      shadow_rank: x.decision === 'ABSTAIN' ? null : rankMap.get(x.result_id),
      shadow_score: Number(x.raw_score.toFixed(8)),
      confidence: x.confidence,
      decision: x.decision
    }));
  }

  return Object.freeze({
    VERSION,
    TEST_ONLY: true,
    run
  });
});
