# YOYO / HueSense — Shadow Lifecycle v0.2

這一步接在 `Shadow Result Contract v0.1` 後面，處理 **SPA 生命週期、記憶體釋放、DELTA Projection 與延後排程**。

## 這一版新增

- `shadow-job-lifecycle.js`
  - `request_id + job_id + generation + view_instance_id`
  - 外部 AbortSignal
  - stale / abort / error 狀態
  - `release()` 明確執行 `resultsRef = null`
  - 小型 Context snapshot 會 freeze，但**不深拷貝搜尋結果**

- `shadow-projection.js`
  - 只建立 minimal projection
  - 支援 FULL / DELTA
  - Load More 只處理新增 index 範圍
  - 迴圈內支援 cooperative abort check
  - raw API 大欄位不會被帶進 Shadow payload

- `shadow-scheduler.js`
  - Production render 優先
  - double `requestAnimationFrame`
  - 再進 `requestIdleCallback`
  - 沒有 `requestIdleCallback` 時退回 `setTimeout`
  - 每一層 deferred callback 的第一個動作都是 abort/released 檢查
  - 真正開始 work 前再次檢查 SPA route / generation / view identity
  - 一個 scheduler 最多只保留一個 active job，避免舊搜尋結果閉包堆積
  - 新 Job 會釋放舊 Job 的 `resultsRef`

## 此版本仍然沒有做

- 不修改 `public/js/app.js`
- 不接正式搜尋
- 不做 Shadow ranking candidate
- 不做 Web Worker
- 不做 Telemetry
- 不做 Guardrail
- 不做 Canary
- 不讓 Shadow 影響 Production

## 為什麼目前還不做 Web Worker？

目前這一層只是在驗證 **生命週期與資料邊界**。真正 Shadow scoring 還沒有接上。
等 Adapter + Candidate 接上後，再用 profiler 決定 LOCAL 或 WORKER，不提前增加複雜度。

## 下一步

v0.3 建議做：

1. `shadow-runner.js`
2. `shadow-adapter.js`
3. 一個假的 deterministic candidate，專門測整條 Shadow 路徑
4. performance benchmark（30 / 60 / 120 items）
5. 仍然 `authority = NONE`
6. 仍然不修改 Production ranking
