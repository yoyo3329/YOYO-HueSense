# YOYO / HueSense — Shadow Browser Harness v0.4

這版把 v0.3 Pipeline 放進真實瀏覽器 Runtime，但仍與 Production 完全隔離。

真實資料：
- `y2k_color_mvp_b1_observations.json`
- 24 B1 images
- 24/24 decoded-pixel analysis
- 每張 5 palette nodes
- 共 120 個真實 OKLCH palette nodes
- 0 observation errors

會測：
- SPA route change → STALE
- DELTA 90→120 → 只觸碰 30 nodes
- queued/superseded jobs → resultsRef 釋放
- 30 / 60 / 120 真實 B1 nodes：
  Projection / Compute / Shadow Total / Scheduled Wall 的 p50、p95
- Long Task API（支援時）
- `performance.memory`（支援時，僅 diagnostic）
- 最新報告自動存 LocalStorage
- 可下載 JSON report

限制：
- Fake Candidate 是 TEST ONLY
- 不是 v0.8 perceptual accuracy 驗證
- 不載入正式搜尋頁
- Shadow authority = NONE
- 不做 Guardrail / Canary / Telemetry upload

使用：
1. 開啟 XAMPP Apache
2. 解壓縮 ZIP
3. 雙擊 `INSTALL_AND_OPEN_SHADOW_BROWSER_v0.4.cmd`
4. 按 `Run Browser Harness`
5. 下載 JSON 或把 Full report 貼回來
