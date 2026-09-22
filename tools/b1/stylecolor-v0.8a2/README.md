YOYO / HueSense — v0.8-A.2 Foundation Mask + Semantic Prior + Visual Embedding

Prerequisite: a successful v0.8-A.1.1 run and the existing C:\clip-service environment.

Double-click INSTALL_AND_RUN_STYLECOLOR_v0.8A2.cmd. The installer runs a real SAM2 smoke test before the 24-image run.

This version:
- keeps every A.1 Atomic Region immutable
- ignores A.1 relationship actions
- uses SAM2 masks as hypotheses, not truth
- computes OpenCLIP visual embeddings and semantic priors
- creates non-destructive perceptual-group hypotheses
- moves palette impact into decision_risk
- renames clip_input_coherence_score to low_level_input_coherence_score in the A.2 projection
- builds no Style Graph
- has no production authority

First run may download ~156 MB SAM2.1 Hiera Tiny model weights and will be slower on CPU. The worker saves each image as it finishes, so reruns can resume.
