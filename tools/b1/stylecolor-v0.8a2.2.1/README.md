YOYO / HueSense — v0.8-A.2.2.1 Evidence Provenance & Authority Hotfix

Purpose
-------
This is a deliberately small POST-PROCESS-ONLY hotfix.
It does NOT rerun SAM2 or OpenCLIP, does NOT retune prompts or segmentation,
does NOT build Perceptual Grouping / Style Graph, and has no production authority.

What it fixes
-------------
1. Evidence-level provenance: Foundation masks, visual embeddings, semantic prompt evidence,
   stability evidence and recovery metrics each retain their own source lineage.
2. Current postprocess environment is separated from upstream inference environment.
   A clean current environment may NEVER wash upstream evidence CLEAN.
3. Role hypotheses remain overlapping evidence, never a single role truth.
4. Explicit Role → Authority Matrix:
   - GLOBAL_CONTEXT / BACKGROUND_PLANE: context/palette evidence allowed; local split/group/recovery authority denied.
   - LOCAL_COMPONENT / NESTED_COMPONENT: local evidence allowed.
   - AMBIGUOUS: retained, but local split/group/recovery authority denied at this stage.
   Future independent evidence may reopen authority; this hotfix executes no override.
5. RAW vs local-authority-eligible recovery remains separated.
6. Recovery uses distributions plus descriptive unique-coverage weighting; no final score.
7. Stability audit adds tail impact: unstable area mass fraction and unstable unique-coverage mass fraction.
8. Semantic Prior is formally downgraded to Weak Semantic Prompt Evidence.
   top1/top2/margin/spread/std/entropy are descriptive only; top label has zero truth authority.
9. Visual MNN remains VISUAL_EMBEDDING_NEIGHBOR only; zero grouping authority.
10. A strict six-condition Go/No-Go is emitted. If upstream inference environment is not cleanly certified,
    the result MUST remain HOLD_EVIDENCE_LAYER_VALIDATION.

Important expected outcome
--------------------------
With the existing A.2.1 run, torchvision and QuickGELU were not fully recorded at inference time.
Therefore this hotfix is expected to preserve an upstream warning and keep A2_EVIDENCE_LAYER_VALIDATED = NO.
That is correct behavior, not a hotfix failure.

Prerequisite
------------
Completed v0.8-A.2.2 run whose manifest references the completed v0.8-A.2.1 inference run.

Run
---
INSTALL_AND_RUN_STYLECOLOR_v0.8A2_2_1.cmd

Target
------
C:\xampp\htdocs\color-search-test\tools\b1\stylecolor-v0.8a2.2.1
