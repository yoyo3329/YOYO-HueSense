# YOYO / HueSense v0.8-A.2.2 — Perceptual Hypothesis Quality Control

This is a **post-processing evidence-integrity stage** over a completed v0.8-A.2.1 run.

It deliberately does **not** rerun SAM2 or OpenCLIP, does not tune SAM thresholds, does not add a model, does not build a Style Graph, and does not integrate production.

## What it fixes

1. Separates `GLOBAL_CONTEXT_CANDIDATE`, `BACKGROUND_PLANE_CANDIDATE`, `LOCAL_COMPONENT_CANDIDATE`, `NESTED_COMPONENT_CANDIDATE`, `AMBIGUOUS` as **role hypotheses**, never truth.
2. Preserves every Foundation mask, but global/umbrella masks cannot manufacture local SPLIT/GROUP recovery evidence.
3. Reports `union_coverage_with_global` and `union_coverage_without_global`.
4. Reports recovery distributions, not only best-of-many: candidate count, median, p75, best, positive/negative ratios.
5. Reports stability tails: min, p05, p25, median, counts below .9/.8/.5 and worst mask IDs/areas.
6. Makes semantic and embedding ambiguity explicit.
7. Adds `Proposal Information Vector` fields but **no weighted final score**.
8. Adds environment audit for torchvision + QuickGELU configuration. Upstream warnings quarantine semantic/embedding evidence as auxiliary; they do not invalidate SAM geometry by themselves.

## Authority

`NONE`. Output is for research/audit only.
