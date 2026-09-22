# YOYO / HueSense — Shadow Result Contract v0.1

這是 Shadow Integration 的第一個正式 Contract。此版本**不修改 `public/js/app.js`**，也不啟用任何 production authority。

## v0.1 鎖定的核心邊界

- `authority` 永遠只能是 `NONE`
- Shadow 不得修改 Production rank / filter / render / palette
- Shadow Input 只允許 minimal projection，不接受 raw API response / DOM / framework state
- `request_id + job_id + generation + view_instance_id` 全部必填
- `route_key_digest` 用來辨識 SPA 路由生命週期
- `FULL / DELTA` 為正式 batch contract
- Infinite Scroll 使用 `DELTA`，而非重新處理全部既有結果
- `DELTA` 必須綁定 `base_shadow_snapshot_id`
- `ABSTAIN` 只是一個研究結果；v0.1 不建立任何 UI fallback
- `STALE / ABORTED / TIMEOUT / ERROR` 不得保留可被誤用的 `shadow_rank`
- `OK` 才能產生新的 `shadow_snapshot_id`
- Guardrail / Canary / A-B testing / production authority 全部 OUT OF SCOPE

## 這版刻意還沒做

- `shadow-adapter.js`
- Scheduler（double-rAF / idle scheduling）
- Abort cleanup 與 `resultsRef = null`
- Worker / cooperative abort / worker cooldown
- Telemetry batching
- `fetch(..., { keepalive: true })`
- Runtime Guardrail Registry
- `app.js` hookup

原因很單純：**先把資料契約與安全邊界定案，再寫生命週期。**

## 下一步建議

下一個最小 Sprint 應該是：

1. `shadow-job-lifecycle.js`
2. `shadow-projection.js`
3. `shadow-scheduler.js`
4. Contract tests for route abort / stale generation / resultsRef cleanup
5. 仍然不碰 production ranking
