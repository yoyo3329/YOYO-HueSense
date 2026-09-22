YOYO Safe Foundation v0.6B — RUN ME FIRST
==========================================

最簡單：

1. 把這包內容合併到：
   C:\xampp\htdocs\color-search-test\tools\b1\

2. PowerShell / CMD：

   cd "C:\xampp\htdocs\color-search-test\tools\b1"
   npm run safe:foundation

3. 看到最後：

   ✅ Safe Foundation Sprint v0.6B PASS.

   就代表整輪完成。

這條指令會自動做：
- v0.6A 全部舊測試
- Dynamic Profile contract tests
- Failure/Fallback tests
- Async Runtime Audit Log tests
- Shadow Middleware tests
- Provenance tests
- B1 offline cache 24/24 preflight
- One-click Offline Pipeline
- Dynamic Profile Packet
- Provenance Trace
- 200-request Shadow Runtime simulation
- v0.6B 46+ integrity checks
- 最後確認 app.js / 正式 Core / Candidate / Train / Holdout 都沒有被改

B1 行為：
- Windows 上 sharp 正常時：會用「cache-only B1 runner」重跑 B1，禁止網路。
- 如果 sharp 無法載入，但已有合法 24-item B1：會安全 reuse B1，再重跑 B2→B3-A→Relation。
- 若你一定要強制重跑 B1：
  node .\run_offline_pipeline_v0_6b.js --force-b1

重要：
- 不用做人工色彩題。
- 不會把 v0.5 Candidate 升 Production。
- 不會拿 Holdout 反向調公式。
- 不會改 public/js/app.js。
- Shadow Live integration 仍是 OFF。

個別指令：
  npm run safe:cache-preflight
  npm run pipeline:offline
  npm run profile:build:v0.6b
  npm run shadow:simulate
  npm run safe:audit:v0.6b
