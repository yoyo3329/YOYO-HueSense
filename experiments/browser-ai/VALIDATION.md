# 第一階段驗證矩陣

本次結果：17 個 JavaScript 模組靜態檢查通過；23 項離線測試通過、0 失敗（12 項資料／靜態處理、11 項明確標示 MOCK 的模型與訊息管線測試）。`npm ci`、runtime 準備與 CPU smoke 均實際執行成功。

| 層級 | 已執行結果 | 證據與限制 |
|---|---|---|
| 程式檢查 | PASS | `evidence/static-check.txt`；Node 24.19.0 Linux x64；語法與 imports，不是瀏覽器視覺 QA |
| 確定性資料處理 | PASS | `evidence/offline-tests.tap` 中未標 MOCK 的測試；non-square 座標、預處理、RLE、遮罩選擇等 |
| Mock 模型／Runtime | PASS | 同 TAP 中明確標 `MOCK`；假 tensor/model/fetch/adapter，不能當真實推論 |
| 離線跨執行緒整合 | Mock PASS | 實際 Node Worker thread、轉移圖片 buffer、Provider／Pipeline／快取／錯誤；模型是假實作 |
| 模型二進位完整性／I/O | PASS | 實際下載 2 檔、核對 SHA-256、ORT 開啟，`evidence/model-inspection.json` |
| 真實模型 Linux CPU | PASS（限 smoke） | `evidence/cpu-smoke.json`；ORT 1.31.0、生成圖形，實跑 encoder、point/box/negative/mask decoder |
| 真實模型 Browser WebGPU | **NOT RUN** | 無指定可用瀏覽器控制能力；提供 `browser-test.html` 可執行驗收 |
| 原圖／PyTorch／研究 snapshot parity | **NOT RUN** | 未取得相同權重與 preprocessing parity 證據；不宣稱數值一致 |
| Sites origin Worker/CSP/模型下載 | **UNVERIFIED** | 靜態託管契約已讀；程式化站點請求 403，未部署 probe、未改線上網站 |
| 正式 HueSense 工作台整合 | **DEFERRED** | 第三階段；目前原網站與備份檔案均保留原樣 |

## 已覆蓋的失敗情況

非有限／超範圍座標、反向／零面積框、點數過量、錯誤 RGBA 長度、圖片大小上限、RLE 溢位／不足／負值／小數／格式錯誤、非有限 mask、下載 HTTP 失敗／超量／中斷長度／hash mismatch、WebGPU 不存在／沒有 adapter、未初始化推論、同圖重複編碼、編碼中切圖、解碼中更新提示、晚到／epoch 不符回覆、Worker timeout、清除與重新初始化。

## 真實瀏覽器驗收方法

執行 `START_BROWSER_AI.cmd` 後在 `browser-test.html` 點一次測試，保存報告。該頁沒有 mock engine；Provider 使用真正 Worker 和遠端已固定模型。即使它顯示 PASS，也只表示合成圖形上的運算管線通過，還須在 `index.html` 用橫向及直向照片目視檢查 mask/prompt alignment、负點排除與筆刷修正。

若出現 GPU 算子不支援或模型 session compile error，保留錯誤訊息；不可改標為 PASS、不可靜默呼叫 Python Bridge。目標 Sites origin 的驗收另行安排，localhost 成功不能代替 Sites CSP 驗證。

## 重現 Linux CPU 證據

`scripts/cpu-smoke.py` 只是一個離線測試，不是推論服務。使用隔離的 Linux numpy/onnxruntime 環境及已校驗模型目錄執行，stdout 為 JSON。本次 weights 與 Python 套件放在工作環境暫存區，不加入 GitHub；Windows 驗收完全不需要 Python。CPU 版本 1.31.0 與 Web 1.24.3 不同，結果不可互換。
