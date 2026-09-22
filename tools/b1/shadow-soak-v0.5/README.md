# YOYO / HueSense — Shadow Soak Test v0.5

這是 Shadow 基礎設施最後一輪長時間壓力測試。

## 500 Jobs

- 1–50：Warm-up（不納入退化判定）
- 51–250：Normal，30 / 60 / 120 nodes 交錯
- 251–350：DELTA Stress，25 輪 `30 → 60 → 90 → 120`
- 351–425：Abort Storm
- 426–475：Route-change Storm
- 476–500：Recovery，固定 120 nodes

## Checkpoint

每 50 jobs 記一次，共 10 個：

- JS heap（瀏覽器支援時）
- Harness DOM node count
- Long Task 累積數
- Release event 累積數
- active job 狀態
- status counters

執行期間 UI **不建立每個 Job 的 DOM log**。
只覆寫固定的進度條、進度文字與目前 Heap。
完整報告等 500 次全部跑完才建立。

## 預先鎖定的 Gate

- 500 jobs 全部 release
- `resultsRef` release failure = 0
- Scheduler active-after-cycle failure = 0
- Projection touch mismatch = 0
- 狀態必須精確：
  - COMPLETED 375
  - ABORTED 75
  - STALE 50
  - ERROR 0
- Long Tasks = 0
- Recovery 120-node：
  - p95 <= 4ms
  - p99 <= 8ms
  - 且不得相對 baseline 明顯退化
- Harness 自身 DOM node drift = 0
- Heap 若支援：
  只有同時出現「>20MB 增長 + 最後 5 checkpoint 嚴格單向增加 + slope >20KB/job」
  才判為 `WARN_POSSIBLE_UNBOUNDED_GROWTH`

## 成功狀態

`PASS_STOP_SHADOW_INFRA_EXPANSION`

若得到這個結果，Shadow 基礎設施應停止擴建，主線回到：

`v0.8 Perceptual Candidate + DEV-only Shadow hookup`

## 使用

1. 開 XAMPP Apache
2. 完整解壓縮 ZIP
3. 雙擊 `INSTALL_AND_OPEN_SHADOW_SOAK_v0.5.cmd`
4. 瀏覽器打開後，**保持該分頁在前景**
5. 按 `Run 500-Job Soak Test`
6. 結束後按 `Download JSON`
7. 把 JSON 傳回 ChatGPT
