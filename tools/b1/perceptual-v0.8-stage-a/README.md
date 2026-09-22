# YOYO / HueSense — Perceptual v0.8 Stage A Prep

這一步正式把主線從 Shadow Infrastructure 拉回 Perceptual Relation。

## 這個包現在做什麼

1. 封存 v0.7 的 12 題 Independent Validation，標記為：
   `RETIRED_AFTER_FIRST_EVALUATION`
2. 強制用途只剩：
   `FAILURE_TAXONOMY_ONLY`
3. 自動掃描你本機 `tools\b1`，找可能包含 v0.7 frozen candidate predictions 的檔案。
4. 如果找到唯一且可安全解析的 JSON，才會建立：
   `v0_8_failure_taxonomy_chroma.json`
5. 如果找不到、找到多個、或格式不明：
   **直接停在 WAITING，不猜、不重建、不拿 human labels 反推 prediction。**

## 為什麼不能直接從 7/12 猜哪 5 題錯？

因為 7/12 只告訴我們有 5 題 Chroma mismatch，
但沒有告訴我們 frozen v0.7 candidate 每一題實際預測什麼。

要分類：

- CHROMA_OVER_SEPARATION
- CHROMA_UNDER_SEPARATION

一定要拿「當時 freeze 前就已確定的 Candidate prediction」對照 Human validation。
不能事後用 validation label 反推。

## v0.8 Stage A Round 1 鎖定

- Hue：FROZEN
- Hue applicability：FROZEN
- Lightness：FROZEN_BASELINE
- Chroma：PRIMARY_REDESIGN_AXIS
- Tone：先不一起調，等 fresh Chroma Train 出現穩定 residual 才考慮最多一個 interaction term

禁止：

- case-specific rule
- mode-specific rule
- Y2K-specific rule
- style-specific rule
- 用退役 validation 調 threshold
- 用退役 validation 選公式

## 安裝後

Installer 會自動：

1. 跑研究紀律測試
2. 掃描 `C:\xampp\htdocs\color-search-test\tools\b1`
3. 輸出：
   - `v0_7_prediction_source_discovery.json`
   - `v0_8_stage_a_state.json`
4. 若能安全找到唯一 prediction JSON，會再輸出：
   - `v0_8_failure_taxonomy_chroma.json`

如果狀態是：

`WAITING_EXPLICIT_FROZEN_PREDICTION_ARTIFACT`

把 `v0_7_prediction_source_discovery.json` 傳回來即可。
