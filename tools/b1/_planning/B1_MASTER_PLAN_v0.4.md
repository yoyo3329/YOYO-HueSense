# YOYO / HueSense — B1 / Color Profile R&D 主線規劃 v0.4

> 目前 `tools/b1` 已不只是「B1 單圖觀測」；它實際承載 B1 → B2 → B3-A → Color Relation → Calibration 的離線研究主線。
> 為避免現在改資料夾名稱造成大量路徑重工，暫時保留 `tools/b1` 名稱，等 Runtime Profile Bridge 完成後再做正式重構。

## 目前主線狀態

### A. Physical data pipeline — 已完成
1. Fixed Evaluation Set
2. B1 單圖 Observation
3. B2 Aggregation
4. B3 Threshold Sensitivity
5. B3-A Evidence / Scope / Stability
6. Atomic Color Relation Graph

主要產物：
- `y2k_color_mvp_evaluation_set_v1.json`
- `y2k_color_mvp_b1_observations.json`
- `y2k_color_mvp_b2_aggregation.json`
- `b3_threshold_sensitivity.json`
- `y2k_color_mvp_b3_hierarchy.json`
- `y2k_color_relation_graph.json`

### B. Calibration / Human-perception QA — 現在進行中
目前進度：
1. 第一次人工標註：20 cases
2. AI diagnostic：完成；只做診斷，不是 Gold
3. Priority queue：完成
4. **Human Blind Retest v0.4：現在要做**
5. Test-retest consistency
6. Confirmed Candidate Set
7. GOLD_TRAIN / GOLD_HOLDOUT 分離

目前必要檔案：
- `calibration_set_v0_human.json`
- `calibration_set_v0_provisional.json`
- `calibration_safety_contract_v0.3.json`
- `calibration_retest_v0_3_ai_completed.json`
- `ai_vs_human_diagnostic_v0_3.json`
- `human_priority_retest_queue_v0_3.json`
- `run_ai_diagnostic_triage_v0_3.js`
- `build_human_priority_blind_retest_v0_4.js`
- `compare_human_blind_retest_v0_4.js`

## 現在立刻要做

### Step 1 — 建立 v0.4 人類盲測頁
```powershell
cd "C:\xampp\htdocs\color-search-test\tools\b1"
npm run calibration:build
```

產生：
`human_priority_blind_retest_v0_4.html`

### Step 2 — 完成 20 題盲測
只看色塊，不看第一次答案、AI、演算法、L/C/H。

匯出：
`human_blind_retest_v0_4.json`

把它放回 `tools\b1`。

### Step 3 — 比較第一次 vs 第二次人工
```powershell
npm run calibration:compare
```

產生：
- `human_test_retest_report_v0_4.json`
- `human_confirmed_candidates_v0_4.json`

## 下一大段實作（盲測完成後一次做，不再拆太碎）

### Phase C — Gold split + formula calibration
1. 建立 `GOLD_TRAIN`
2. 建立 `GOLD_HOLDOUT`
3. 修正 Hue applicability ontology
4. Hue relation candidate calibration
5. Tone formula candidate sweep
6. Holdout regression
7. 全 1378 edges 重跑
8. 錯誤案例報表

### Phase D — Cross-style validation
1. 選第二風格（建議與 Y2K 分布不同）
2. 建立少量跨風格人工 sanity cases
3. 驗證 Hue / Tone / Coverage 是否崩壞
4. universality_status 才能從 `Y2K_only` 往上升級

### Phase E — Multi-view Profile
不回到唯一 Superfamily。
建立：
- Hue View
- Tone View
- Lightness / Chroma View
- Neutral Structure
- Evidence View
- Palette Selection interface

### Phase F — 正式 Runtime
1. Reference Discovery → dynamic B1/B2/B3-A
2. YOYO Color Mode Contract
3. Color Relation Engine
4. Shadow Audit Middleware
5. audit log
6. Calibration Lab Developer Console
7. 必要時 AI Semantic Arbitration
8. 最後才 Quality Gate

## 不可違反的資料規則

- AI label ≠ Human Gold
- Human + AI agreement ≠ independent evidence
- 第一次人工判斷不直接變正式 Gold
- Gold Train 與 Gold Holdout 必須分離
- Universal Physical Layer 不得寫入 Style-specific semantic truth
- Shadow Audit 在驗證完成前不得阻擋正式搜尋
- `_archive` 不得被目前主線引用

## 工作節奏

之後採：
- 20%：鎖會造成資料污染／大重工的 Contract
- 60%：一次實作一整段、跑真實資料
- 20%：集中 Audit → BLOCKER / SHOULD FIX / LATER

避免回到「每一個小公式都先討論很多輪才寫程式」。
