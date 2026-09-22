# YOYO Color Relation Contract v0.2

## Status
Diagnostic / development only. No production Quality Gate behavior is authorized.

## Hard boundaries
1. Universal/physical relation logic must remain style-agnostic.
2. No `same_style_family` or other style-semantic truth may be emitted by the physical layer.
3. HUMAN_GOLD is never silently rewritten by code.
4. AI/Engine agreement is not independent evidence and cannot become HUMAN_GOLD.
5. Coverage is calibration support, not semantic correctness and not "known style" detection.
6. Shadow coverage/audit signals must never block normal search or palette output.
7. In-sample Y2K coverage cannot be used as evidence of cross-style universality.

## Current objective pair features
- delta_L
- delta_C
- circular_delta_H_degrees
- hue_chord
- min_chroma
- max_chroma
- distance_cw_1_00
- distance_cw_1_18

## Current provisional perceptual outputs
- lightness_similarity
- chroma_similarity
- tone_similarity
- hue_angular_similarity
- hue_reliability
- hue_evidence_signed
- neutrality_a / neutrality_b / neutrality_similarity

These remain provisional until cross-style calibration.

## Calibration coverage v0.2
Feature vector:
`[delta_L, delta_C, hue_chord, min_chroma, max_chroma]`

- robust scale: median + IQR
- local support: 3-NN mean distance
- provisional reference: leave-one-out HUMAN_GOLD distribution Q90/Q95
- Y2K v0 labels were mostly selected by farthest-point sampling from the same graph, so the current Y2K result is explicitly IN_SAMPLE_ONLY.

## Human label ontology change discovered in v0.2
The old `hue_relation = different` can mix two different meanings:
- both colors carry reliable hue and the hue families differ;
- one color is achromatic/near-achromatic while the other is chromatic.

v0.2 re-label schema therefore separates:
- hue_applicability
- hue_relation_when_applicable
- tone_relation

Original v0 HUMAN_GOLD must be preserved alongside v0.2 labels.

## Cross-style checkpoint
The engine may remain `engine_scope = style_agnostic`, but `universality_status` must stay unvalidated until an external second-style relation set is tested.
