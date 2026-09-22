# YOYO Safe Foundation v0.6D — Generic Data Ingestion Foundation

## Goal
Complete the non-human ingestion foundation before returning to Tone/Hue calibration.

Flow:
Reference Discovery Contract → Reference Manifest → Cache Manifest → Generic Evaluation Set Builder → Workspace Auto-Ingestion → Source/query-family/URL audit → DATA_READY Gate → Quiet Luxury dry-run → Cross-style Preflight.

## Scientific boundary
Raw Reference Discovery **cannot** directly become a fixed evaluation set. It must first obtain an accepted visual-selection provenance (for future runtime: CLIP/visual selection). The current Y2K run uses an explicit `LEGACY_FIXED_EVALUATION_MIGRATION` adapter because its 24-image evaluation set was already selected earlier. This migration is not called a new Reference Discovery run and does not recreate CLIP.

## Quiet Luxury boundary
v0.6D creates no fake Quiet Luxury references, cache, evaluation set, profile, or validation claim. The dry-run passes only if the workspace remains `DATA_PENDING`.

## Workspace mutation policy
Auto-ingestion writes `ingestion_state_v0_6d.json` as a sidecar. It does not silently rewrite the proven v0.6C workspace paths. A later explicit promotion step can be added after real data are available.

## Live boundary
`public/js/app.js` remains untouched. Human calibration remains paused.

## Policy profiles
New styles require at least 50 raw references by default. The 24-reference threshold is permitted only under the explicit `LEGACY_Y2K_MIGRATION` exception because those 24 images are the already-fixed Y2K evaluation baseline.

## URL failure metric
When Reference Discovery exports browser-measured dead URL statistics, those are authoritative. For the legacy Y2K migration, v0.6D uses pre-B1 cache decode evidence: a primary URL that required fallback is counted as an observed primary URL failure. Cache misses are tracked separately.
