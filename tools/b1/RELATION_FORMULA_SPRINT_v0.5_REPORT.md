# YOYO Relation Formula Sprint v0.5 — Test Report

## Result
All executable v0.5 steps passed on the current Y2K physical graph.

### Calibration
- Train cases: 20 HUMAN_APPROVED_AI_ASSISTED
- Hue applicability: 20/20 train fit
- Hue relation: 11/11 reliable train cases
- Tone: 20/20 train fit
- Selected parameters are intentionally marked Candidate / Train-Fit-Only.

### Parameter robustness
- Hue applicability best plateau: 0.0265–0.0345; selected 0.03.
- Hue relation best plateau: 20.5°–56.5°; selected 40°.
- Tone coarse search produced 972 equally best configurations; selected values are near the plateau center rather than a single razor-thin optimum.

### Full graph rerun
- 53 nodes
- 1378 edges
- Pair-count invariant passed.

Candidate distribution:
- Hue reliable 820 / low-chroma 558
- Hue same/adjacent 196 / different 624 / not-applicable 558
- Tone similar 81 / partial 643 / different 654

Boundary audit:
- Hue-applicability near boundary: 195
- Hue-relation near boundary: 91
- Tone near boundary: 155

### Validation state
No independent GOLD_HOLDOUT has been evaluated yet.
Therefore:
- production_gate_eligible = false
- universality_status = unvalidated
- validation_scope = train_fit_only

### Next Gate
9 independent Y2K holdout cases have been prepared in `gold_holdout_blind_lab_v0_5.html`.
They are excluded from Train and sampled around three candidate decision-boundary families.
