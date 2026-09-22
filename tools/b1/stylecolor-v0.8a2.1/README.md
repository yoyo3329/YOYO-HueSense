YOYO / HueSense ??v0.8-A.2.1 Perceptual Region Inference Hardened

Prerequisite:
- successful v0.8-A.1.1 run
- existing C:\clip-service environment

Run:
- double-click INSTALL_AND_RUN_STYLECOLOR_v0.8A2_1.cmd

This version hardens A.2 against the failure modes identified in the A.1.1 review:

1. A.1 Atomic observations remain immutable.
2. A.1 relationship actions have ZERO authority in A.2.
3. SAM2 masks and OpenCLIP embeddings are hypotheses/evidence, never ground truth.
4. The inference layer explicitly supports SPLIT / GROUP / KEEP / UNKNOWN, but defaults to UNKNOWN and performs no destructive resolution.
5. Every derived hypothesis remains traceable to pixels and/or A.1 Atomic Regions.

Additional engineering safeguards:
- no forced primary-group ownership; stores top1/top2 overlap, margin, entropy instead
- multi-axis semantic priors: content_type / visual_form / material_appearance
- near-duplicate mask hygiene + nested-mask relations
- MaskOverlapMultiplicity / mask-carpet diagnostics
- visual-neighbor edges store absolute cosine AND nearest-neighbor margin
- explicit edge types; no overloaded generic grouping edge
- critical-case SAM stability probes for Y2K PACK / Sticker Collage / Fashion Collage
- A1 failure-recovery report rather than maYOUR_API_KEY
- pinned SAM2 revision + safetensors SHA256 + preprocessor config + dependency fingerprint
- exact-environment resume guard; mismatch -> RESUME_ENV_MISMATCH
- known-structure real SAM2 smoke test before the 24-image run
- byte-identical A.1 source gate retained
- no Style Graph and no production authority

Important:
A successful 24/24 run is NOT a Perceptual Recovery PASS.
The generated status is:
A2_EVALUATION_READY_NOT_PERCEPTUALLY_VALIDATED

Primary outputs:
- run_manifest.json
- model_lock.json (installed tool directory)
- foundation_mask_hypotheses.json
- atomic_foundation_overlap_raw.json
- perceptual_inference_hypotheses.json
- a2_relationship_multigraph.json
- a1_observations_projection.json
- a1_failure_recovery.json
- a2_diagnostics.json
- audit.html
