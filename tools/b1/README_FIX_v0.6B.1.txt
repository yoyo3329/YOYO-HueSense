YOYO Safe Foundation v0.6B.1 — Deterministic Reproduction Hotfix

這次失敗不是 B1/B2/B3 算壞。
已確認舊 B1 的 analysis_provenance.image_fetch_mode 是 "download"，
而 v0.6B 的 cache-only 重跑必然會寫成 "cache"。
另外 fallback 案例的 primary_error 文字也可能因離線 cache-only 政策不同而改變。

這兩個欄位是「影像取得過程的診斷資料」，不是色彩物理觀測值。
v0.6B 卻把整份 B1 JSON 做 byte-for-byte SHA-256，因此造成 false failure。

v0.6B.1 修正：
- B1：physical-semantic exact（數值 tolerance = 0）
  只忽略 image_fetch_mode / primary_error 兩個 transport-only 欄位。
- B2 / B3 sensitivity / B3-A / Relation Graph：仍要求 byte-for-byte exact。
- 若 Palette / observed_features / reliability / analysis_source 任一實際值改變，仍然 FAIL。
- Dynamic Profile / Provenance 改成只有 reproduction gate PASS 後才產生，避免失敗 rollback 後 provenance 變成 stale。
- 失敗報告會寫出 B1 raw hash、physical hash、各 downstream hash，下一次不再只有一句 mismatch。

使用：
1. 把 ZIP 內所有檔案直接覆蓋到：
   C:\xampp\htdocs\color-search-test\tools\b1\
2. 執行：
   cd "C:\xampp\htdocs\color-search-test\tools\b1"
   npm run safe:foundation

預期在 Offline Pipeline 中看到：
=== Reproduction Gate v0.6B.1 ===
B1 raw byte exact             : false   （cache-only 重跑時這是正常的）
B1 physical-semantic exact    : true
Transport-only diff accepted  : true
B2/B3/Relation byte exact     : true

最後應為 Safe Foundation PASS。
