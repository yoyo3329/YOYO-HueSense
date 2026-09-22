# YOYO v0.6D.1 — Governance / v0.6E Entry Guard

## Why this patch exists

v0.6D's ingestion audit can legitimately PASS while v0.5 Perceptual Relation fails its own boundary-stress holdout. These are different scopes.

The status must therefore say both truths at the same time:

- v0.6D ingestion infrastructure: **PASS / SCOPED CLOSED**
- v0.5 perceptual relation candidate: **FAILED BOUNDARY STRESS / PRODUCTION BLOCKER**

## Verified holdout debt expected from the real result file

- Tone: 2/9
- Reliable Hue relation: 6/6
- High-confidence contradictions: 7/9
- Status: BOUNDARY_CONTRADICTION_FOUND
- Candidate production eligible: false

The patch refuses to invent these numbers if `gold_holdout_regression_v0_5_1.json` is missing.

## Legacy quarantine

The legacy review heuristic is `C <= 0.01`, diagnostic only. The expected five cases are:

- CAL_Y2K_005
- CAL_Y2K_006
- CAL_Y2K_009
- CAL_Y2K_015
- CAL_Y2K_019

`CAL_Y2K_018` is intentionally outside this heuristic. This does not assert that C=0.0139 is perceptually reliable; it only means it is not in the legacy C<=0.01 quarantine bucket.

## Important provenance clarification

`gold_train_candidate_v0_4.json` is `HUMAN_APPROVED_AI_ASSISTED`.
It is a calibration/train candidate, **not independent HUMAN_GOLD**.

`gold_holdout_human_v0_5_2.json` is the independent boundary-stress holdout and remains training-ineligible.

## v0.6E entry rules

Real network capture must be isolated from deterministic tests.

Deterministic tests:
- no live network
- REPLAY_ONLY
- frozen immutable fixtures
- request fingerprint + response content hash
- explicit 404 / 429 / timeout / malformed-payload fixtures

Readiness:
- fetch/cache without selection -> at most `PENDING_VISUAL_SELECTION`
- accepted selection provenance can promote further
- current accepted selection provenance includes `CLIP_RANKED_FIXED_SET`
- Human Tone/Hue calibration is separate from reference selection
