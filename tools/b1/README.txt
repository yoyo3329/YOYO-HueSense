YOYO Safe Foundation Sprint v0.6A

這一包專門讓你暫停人工 Calibration 時，先做完全可自動驗證的工程作業。

放到：
C:\xampp\htdocs\color-search-test\tools\b1\

執行：
npm run safe:foundation

或：
node .\run_safe_foundation_sprint_v0_6a.js

本 Sprint 已在目前 v0.5 專案上實跑通過：
- ToneCore edge-case tests：9/9 PASS
- ColorRelationCore contract tests：8/8 PASS
- Pipeline integrity：34/34 PASS
- Runtime Profile Bridge contract：8/8 PASS
- Reproducibility snapshot：10 個核心檔案 SHA-256 完成

安全界線：
- 不改 public/js/app.js
- 不把 v0.5 Candidate 升正式 Core
- 不使用舊 Holdout 反向調 Tone
- 不新增 Human Gold
- Runtime Profile Bridge 為 SHADOW_ONLY，不能 block search，也不能改 palette

人工之後再回來做：
Tone ontology v0.6 / Hue applicability v0.6。
