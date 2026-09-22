# YOYO / HueSense v0.8-A.1 — Stable Atomic Regions + Relationship Diagnostics

核心修正：

1. **Atomic Region 不再等同 Style Entity。**
2. **禁止破壞性 Merge。** 原始 Atomic Region 永久保留。
3. Region Graph 儲存的是關係證據，不是「同一真實物件」真值。
4. 所有 0–1 數值明確標成 heuristic score，不具有機率意義。
5. Multi-scale / perturbation stability 用來找反證，不宣稱 accuracy。
6. `KEEP_SEPARATE_BUT_LINK` 類關係比 `MERGE / NO_MERGE` 更重要。
7. Palette Impact 是關係風險維度；高影響關係不得因單一 CV score 被視為安全。
8. Semantic mask / foundation model prior 留給 v0.8-A.2，本版不偽造。

## 三層 ontology

Atomic Region → Region Relationship Graph → 未來 Perceptual Group

A.1 停在前兩層，不建立 Style Graph。
