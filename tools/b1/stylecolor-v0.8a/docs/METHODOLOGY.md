# YOYO / HueSense — StyleColor Extractor v0.8-A 方法論界線

本 PoC 延續專案既有的方法論紀律：把「實際使用的技術依據」與「設計者 heuristic」分開記錄。

## 1. 真正使用的色彩底座

- **OKLab / OKLCH**：區域內 pixel 與 palette representative color 的運算空間。來源：Björn Ottosson, *A perceptual color space for image processing* (2020)  
  https://bottosson.github.io/posts/oklab/
- 本 PoC 不把單一 ΔL / ΔC / ΔH threshold 當作 universal human truth。

## 2. WCAG 的定位

WCAG 2.x 的相對亮度 / contrast ratio 是**功能性無障礙檢查**，不是 aesthetic harmony 或 Style Color 判定器。  
https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html

因此 v0.8-A extraction 不使用 WCAG contrast 來決定某色是不是風格色。

## 3. Kobayashi Color Image Scale 的定位

專案只參考其 Warm–Cool、Soft–Hard、Clear–Grayish 的**概念架構**，沒有取得或複製 180 個形容詞、130 色、1170 組配色的專有座標資料。

- Kobayashi, S. (1981). *The aim and method of the Color Image Scale*. Color Research & Application, 6(2), 93–107.  
  https://doi.org/10.1002/col.5080060210
- Kobayashi, S. (1990). *Color Image Scale*. Kodansha International. ISBN 9784770015648.

在新架構中 Kobayashi 只能放在**Style Profile 的語意描述層**，不能拿來當 pixel segmentation、skin removal、shadow removal 或 Style Color hard filter。

## 4. v0.8-A 的工程 heuristic

以下都屬 PoC heuristic，不宣稱是已驗證的心理物理定律：

- SLIC superpixel region proposal
- deterministic saliency proxy（global OKLab contrast + Sobel edge + center prior）
- extreme shadow / highlight 只降 reliability，不 hard delete
- 每個 region 先排除 L 最亮 / 最暗各 5% 後建立 representative palette
- dominant / secondary / accent 僅依 image-area rank 做 provisional role

這些值的目的只是建立**可追蹤的 evidence vector**，不能直接寫成「風格色真值」。

## 5. 本 Sprint 明確不做

- 不做 Generic Corpus subtraction
- 不做 Style Lift
- 不做 PMI / NPMI
- 不做完整 Style Color Relation Graph
- 不宣稱 SLIC 是 semantic segmentation
- 不把 CLIP 當最終裁判
- 不修改 `public/js/app.js`

成功條件只有：**Region-aware extraction 是否比 whole-image B1 palette 更容易追蹤陰影、大片背景與局部色彩來源。**
