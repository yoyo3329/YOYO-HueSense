# v0.8-A.2.1 Architecture Contract

A.2.1 is **Perceptual Region Inference**, not object segmentation and not final StyleColor segmentation.

## Five non-negotiable rules

1. A.1 Atomic observations are immutable.
2. A.1 relationship results are low-level hypotheses only; they cannot control A.2.
3. Foundation Masks / Embeddings provide semantic/perceptual evidence only; they are not truth.
4. A.2 must represent SPLIT / GROUP / KEEP / UNKNOWN possibilities without destructive resolution.
5. Every derived hypothesis must trace back to original pixels and/or Atomic Regions.

## Ontology

Image pixels
→ A.1 Atomic Observations (immutable low-level evidence)
→ Foundation Mask Hypotheses (SAM2 prior)
→ Atomic↔Mask overlap evidence
→ Perceptual inference hypothesis space (SPLIT/GROUP/KEEP/UNKNOWN)
→ later decision layer (not implemented here)

A Foundation Mask is **not** automatically a Perceptual Component.

## Edge types

- SPATIAL_ADJACENCY
- COLOR_SIMILARITY
- MASK_OVERLAP
- MASK_CONTAINMENT
- VISUAL_EMBEDDING_NEIGHBOR
- SEMANTIC_AXIS_SIMILARITY
- STYLE_SIMILARITY
- POSSIBLE_SHARED_COMPONENT

No generic edge is allowed to simultaneously mean “near, similar, semantic, and group these”.

## A.2.1 gate layers

1. Execution
2. Reproducibility
3. Foundation Integrity
4. Hypothesis Integrity
5. Perceptual Recovery

The first four gates never imply Gate 5.
