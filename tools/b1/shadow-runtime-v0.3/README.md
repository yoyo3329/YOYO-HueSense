# YOYO / HueSense — Shadow Pipeline v0.3

這一步開始把前兩層真正串成一條 **可執行但完全沒有 Production authority 的 Shadow Pipeline**。

## 新增檔案

- `shadow-fake-candidate.js`
  - deterministic
  - TEST ONLY
  - 不是 v0.8 Perceptual Candidate
  - 只用來驗證資料流、ABSTAIN、rank 與效能測試

- `shadow-runner.js`
  - `OFF`
  - `LOCAL`
  - `WORKER` 名稱已保留，但 v0.3 刻意禁止啟用
  - 所有成功結果仍強制 `authority = NONE`

- `shadow-adapter.js`
  - 接收 explicit context + `resultsRef`
  - 不讀 global state
  - Projection 只在 Scheduler 真正喚醒後才建立
  - Production array 不會被 mutate
  - OFF 模式可完整走 pipeline 但不產生 Shadow rank

- `shadow-pipeline-v0.3.test.js`
  - 完整 pipeline contract tests

- `shadow-pipeline-benchmark-v0.3.js`
  - 30 / 60 / 120 items
  - Node.js synthetic microbenchmark
  - **不是瀏覽器、Safari 或手機效能證明**

## v0.3 仍然沒有做

- 不修改 `public/js/app.js`
- 不影響正式搜尋排序
- 不做 Web Worker
- 不做 Telemetry
- 不做 Guardrail
- 不做 Canary
- Fake Candidate 不可作為研究結果

## 這一步的目的

先證明：

`Contract → Lifecycle → Scheduler → Projection → Runner → Adapter → ShadowResult`

整條管線可以安全工作，而且 Production authority 仍然是 0%。

## 下一步 v0.4

只有在 v0.3 本機測試通過後，才建議：

1. Browser Harness（真 Chrome / Edge）
2. 真實 B1 color-feature mapping adapter
3. 量測 30 / 60 / 120 張真資料
4. Long Task / memory / route-abort 實測
5. 再決定是否需要 Web Worker
6. `app.js` 仍可先不接；或只建立明確的 DEV-only hookup
