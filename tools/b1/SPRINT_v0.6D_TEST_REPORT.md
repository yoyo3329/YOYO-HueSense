# YOYO Safe Foundation v0.6D — Verified Test Report

This report is generated from an actual local execution over the v0.6C.1 project snapshot.

## Contract suites
- ReferenceDiscovery Contract: 6/6 PASS
- Ingestion Contracts: 7/7 PASS
- Prior v0.6C: 29/29 PASS during chained run
- Prior v0.6C.1: 19/19 PASS during chained run

## v0.6D integrity
- 34/34 PASS
- Failures: 0

## Y2K ingestion migration
- Reference records: 24
- Query families: 4
- Source domains: 19
- Max single-source ratio: 0.0833
- Observed primary URL failure ratio: 0.0833
- Cache: 24/24
- Fallback recoveries: 2
- Evaluation set: 24/24
- Data readiness: DATA_READY

Important: the Y2K 24-image input is explicitly marked `LEGACY_FIXED_EVALUATION_MIGRATION`.
It is NOT represented as a new Reference Discovery run and does not recreate or bypass CLIP.

## Quiet Luxury dry-run
- Status: PASS_EXPECTED_DATA_PENDING
- Fake references generated: false
- Color pipeline run: false
- Validation claim: NONE
- Data readiness remains: DATA_PENDING

## Cross-style preflight
- Status: PASS
- Validation scope: INFRASTRUCTURE_ONLY
- Cross-style accuracy claim: false

## Safety boundaries
- Raw Reference Discovery cannot directly become an Evaluation Set.
- New styles default to a 50–100 raw-reference policy.
- The 24-reference threshold is a Y2K migration-only exception.
- Workspace auto-ingestion is sidecar-only; proven workspace paths are not silently rewritten.
- Human Tone/Hue calibration remains PAUSED.
- Live runtime integration remains OFF.
