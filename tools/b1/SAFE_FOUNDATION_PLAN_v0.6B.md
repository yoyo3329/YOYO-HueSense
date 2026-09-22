# YOYO Safe Foundation Sprint v0.6B

## 目的
在人工作業（Tone ontology / Hue applicability calibration）暫停期間，先完成所有可以用 deterministic tests 自動驗證的工程底座。

## 本 Sprint 完成範圍

### 1. Shadow Audit Middleware
- `shadow-audit-middleware-v0_1.js`
- 非同步 deferred scheduling
- bounded queue
- bounded concurrency
- bounded timeout
- fail-open
- Shadow / Log failure 不得外溢到正式搜尋
- 不回傳或修改 Production search/palette payload

### 2. Runtime Audit Log
- `runtime-audit-log-v0_1.js`
- async buffered NDJSON
- bounded queue
- batch flush
- file rotation
- allowlist schema
- 預設不記 raw user input / image URL / palette payload

### 3. Failure + Fallback Contract
- `failure-fallback-contract-v0_1.js`
- Timeout / Queue Full / Shadow failure / Log failure 都只能降級 Shadow
- Production action 固定 `CONTINUE_UNCHANGED`

### 4. Dynamic Profile I/O Contract
- `dynamic-profile-contract-v0_1.js`
- Atomic Color Nodes + complete Color Relation Graph
- 僅攜帶 objective physical relations
- v0.5 Candidate / provisional semantic relations 不得進 Runtime Profile Packet
- B3-D Multi-view 只保留介面，不提前虛構語義

### 5. Provenance / Version Trace
- `provenance-trace-v0_1.js`
- SHA-256 manifest
- concept fingerprint
- pipeline/profile contract lineage
- 不保存原始 user input

### 6. One-click Offline Pipeline
- `run_offline_pipeline_v0_6b.js`
- Default AUTO SAFE：
  - Sharp 可用：B1 cache-only → B2 → B3 sensitivity → B3-A → Relation
  - Sharp 不可用但已有合法 B1：自動 reuse frozen B1，仍重跑所有 derived stages
- `run_b1_observation_offline_v0_6b.js` 明確禁止 network fetch
- `run_b1_offline_cache_preflight_v0_6b.js` 驗證固定 24 張 cache 24/24 齊全
- 核心輸出 transactional backup；任何 stage 失敗就 rollback
- 成功時 B1/B2/B3-A/Relation 核心 artifact 必須 byte-for-byte reproduction

### 7. Shadow Runtime Simulation
- `run_shadow_runtime_simulation_v0_6b.js`
- 200 requests
- 合成 Shadow failures + timeouts
- 驗證：0 synchronous shadow start、0 production mutation、0 search block、0 palette change
- Audit Log 檢查 raw payload leak

## Live Runtime 安全界線
本 Sprint **不修改**：
- `public/js/app.js`
- `tone-core.js`
- 正式 `color-relation-core.js`
- v0.5 Candidate formula / graph
- Train / retired Holdout evidence

`shadow_runtime_policy_v0_6b.json` 明確設定：
- `enabled_in_live_runtime = false`
- sample rate = 0.10
- queue limit = 64
- concurrency = 2
- timeout = 1200 ms

這些只是未來 Shadow integration 的安全 policy，目前沒有接到 live app。

## 一鍵執行
```powershell
cd "C:\xampp\htdocs\color-search-test\tools\b1"
npm run safe:foundation
```

## 人工 Calibration 仍暫停
這輪不處理：
- Tone ontology v0.6 labels
- Hue applicability v0.6 labels
- v0.6 perceptual Candidate
- 新 Independent Holdout
- Cross-style validation
- B3-D semantic views

這些等人工回來後再接。
