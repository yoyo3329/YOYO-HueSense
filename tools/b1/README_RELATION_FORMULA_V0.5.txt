YOYO Relation Formula Sprint v0.5

位置：
C:\xampp\htdocs\color-search-test\tools\b1\

先看狀態：
npm run status

一鍵重跑 v0.5：
npm run relation:v0.5

目前已完成：
- 20 Human-approved train cases
- Hue applicability calibration
- Hue relation calibration
- Tone formula sweep
- 53 nodes / 1378 edges candidate graph
- Train regression
- Baseline comparison
- 1378-edge boundary audit
- 9-case independent Holdout queue + blind lab

目前結果是 TRAIN FIT ONLY，不可視為獨立 validation。

下一步：
1. 開 gold_holdout_blind_lab_v0_5.html
2. 人工完成 9 題（不要 AI 代答、不要看數值）
3. 匯出 gold_holdout_human_v0_5.json
4. 放回 tools\b1
5. 執行：npm run holdout:check

如果 Holdout 通過，下一 Sprint 才進 Cross-style Validation。
