# HueSense 單色資料庫整合指南｜SQLite → B2

## 目前狀態

目前可存取的工作區與 GitHub 分支中，尚未找到先前提到的原始 HueSense_Research_DB_v02.sqlite 或 HueSense_整合色彩研究資料庫_依ERD_v02.zip。因此目前尚無法確認原始檔的真實表名、欄位、資料列數或實際唯一 HEX 數。匯入器已完成，但必須取得原始 SQLite 才能產生真實整合資料。

## 新增的可測試元件

- scripts/import_single_color_sqlite.py：唯讀檢查 SQLite 結構，辨識 HEX 欄位，輸出表名、欄位、PK、FK 及有效 HEX 數。
- scripts/import_single_color_sqlite.py（一般匯入模式）：將實際色碼正規化為大寫 #RRGGBB，相同 HEX 合併成單一候選，但保留原色彩列、連結的關聯列、名稱、來源和證據列。
- scripts/b2_greedy_select.py v0.2：支援讀取標準化匯入 JSON。當 data/single_color_pool.json 存在時，預設優先讀它；否則回退至 291 色五色種子快照。也可以使用 --dataset 明確指定資料來源。
- ui/b2-import.html：在瀏覽器中載入標準化 JSON 並互動測試 B2，檢視每步選色與資料來源摘要。
- tests/test_single_color_import.py：使用人工建立的合成 SQLite fixture 測試匯入、HEX 去重、關聯證據保留及 B2 讀取。測試 fixture 是合成資料，不是真實研究證據。
- GitHub Actions seed-b2-greedy.yml 已執行 B2 與匯入器自動測試，最近一次執行成功。

## 實際匯入步驟（取得原始檔後）

1. 將原始 SQLite 檔案放入 research/palette_seed/data/。
2. 檢查結構：

   py research/palette_seed/scripts/import_single_color_sqlite.py --inspect --database "research/palette_seed/data/你的原始檔.sqlite"

3. 如果有多個 HEX 欄位，根據實際輸出指定表名和欄位；不可猜表名。

4. 匯出標準化資料：

   py research/palette_seed/scripts/import_single_color_sqlite.py --database "research/palette_seed/data/你的原始檔.sqlite" --output research/palette_seed/data/single_color_pool.json

5. 以實際匯入資料跑 B2：

   py research/palette_seed/scripts/b2_greedy_select.py --anchor "#A85C45"

   或明確指定資料檔：

   py research/palette_seed/scripts/b2_greedy_select.py --anchor "#A85C45" --dataset research/palette_seed/data/single_color_pool.json

6. 執行測試：

   py -m unittest discover -s research/palette_seed/tests -p "test_*.py" -v

7. 開啟 research/palette_seed/ui/b2-import.html，上傳 single_color_pool.json。檔案只在瀏覽器記憶體處理，不會上傳到伺服器。

## 資料保留原則

- HEX 正規化後相同者合併為一個候選色；原始紀錄仍保留在 records 陣列。
- 色名、語意標籤、來源、研究證據及關聯紀錄只從原資料擷取，不把不同研究證據合併成單一分數。
- 若資料表沒有宣告 FK，匯入器會嘗試以清楚的 *_id 欄位做保守連結；匯入結果仍需依真實 ERD 和欄位清單核對。
- 原始 SQLite 以唯讀方式開啟；匯入器不修改原始檔。
- 本次不修改 Docker 主設定、不寫入 MySQL、不推斷心理效度、不執行角色配置、WCAG 或配色協調評分。