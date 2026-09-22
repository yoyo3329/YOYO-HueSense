# YOYO / HueSense v0.8-A.1.1 Hotfix

## 修正內容

1. 修正 `cv_worker_a1.py` 第二階段迴圈未重新綁定 region-local `mean_lab` 的錯誤。
   舊 v0.8-A.1 因此會讓同一張圖所有 Region 的 `mean_lab` 被錯誤寫成最後一個 Region 的值，
   連帶造成 Relationship Graph 的 `oklab_delta = 0`、`color_similarity_score = 1`、
   `palette_impact_score = 0`，並污染 `color_homogeneity_score` 與部分 CLIP budget coherence。
2. 修正 `ensure_clip_service.js` 錯誤引用 `./clip_bridge`，改為 `./clip_bridge_a1`。
3. 新增 regression gates：
   - Region mean_lab 不得全數 collapse。
   - 至少一條 Relationship edge 必須有非零 OKLab delta。
   - 至少一條 edge 必須有非零 palette impact。
   - CLIP starter 必須引用存在的 A.1 bridge。

## 舊 A.1 哪些結果仍可用

可保留：
- 24/24 ingestion
- Atomic Region provenance
- zero destructive merge
- multi-scale stability
- perturbation stability
- bimodal palette evidence
- foreground dilution evidence
- boundary evidence
- 已成功取得的 CLIP similarity（針對當時被選到的 Region）

不可作正式結論：
- region mean_lab
- color_homogeneity_score
- clip_input_coherence_score
- Relationship `oklab_delta`
- Relationship `color_similarity_score`
- Relationship `palette_impact_score`
- Relationship action distribution
- 與上述欄位相關的 contradiction / CLIP budget selection 結論

需要用 v0.8-A.1.1 自動重跑，不需要人工標註。
