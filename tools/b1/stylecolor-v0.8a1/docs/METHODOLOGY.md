# Methodology Notes

v0.8-A.1 的研究目標不是 object segmentation accuracy，而是：

**Stable + Traceable + Uncertainty-aware + Style-useful region representation**

Diagnostics:
- color homogeneity
- bimodal color evidence
- foreground dilution
- multi-scale stability
- perturbation stability
- boundary evidence
- texture similarity
- palette impact
- provenance integrity

限制：
- SLIC 仍是 atomic visual proposal，不是 semantic segmentation。
- `semantic_mask_agreement` / `embedding_agreement` 在 A.1 為 null，A.2 才加入。
- Relationship action 是 heuristic label，不是 calibrated probability。
