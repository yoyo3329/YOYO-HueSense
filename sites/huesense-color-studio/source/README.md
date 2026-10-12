# HueSense 色彩實驗室

以使用者提供的 HueSense BAKE 動態範本及產品企畫建立的新 Sites 網站。

## Routes
- `/`: 保留動態首頁、五色色票連動、42 個 SVG 範本、搜尋與分類、SVG / PNG 與配色匯出。
- `/editor/`: 圖片工作台、JPG/PNG 載入、手動框選與筆刷加入/擦除、確認關卡、多區域換色、明暗保留、羽化、復原重做、A/B/C 方案、原圖與方案比較、原尺寸 PNG、專案 JSON 匯出/匯入。

## 執行與部署
靜態網站，不需安裝套件或建置。`dist` 為發布目錄。網站的資料與原圖在瀏覽器記憶體內處理，不傳送圖片。JSON 專案含原始影像與向量選區，可供重新載入。

## 已知限制
- **尚未接上 SAM2 / FastAPI / GPU 推論服務；本版不構成 PRD 完整 AI MVP。** 沒有假分割，不會將矩形或筆刷宣稱為 AI 辨識。AI 正/負提示點推論、GPU 排程、伺服器持久化尚未實作。
- 換色使用同一個 Canvas 合成函式處理預覽與匯出；保留亮度採近似 RGB 亮度比例，極端高光、陰影、玻璃或毛髮不保證自然。
- 選區使用 normalized coordinates；預覽最多 1200 px；匯出於原尺寸重建選區。筆刷在瀏覽器操作，圖片上限 20 MB / 16MP / 單邊 16000 px，最多 12 個區域。
- A/B/C 是本次工作階段快照，刷新前須匯出專案 JSON。原圖不被覆寫。
- 桌面與窄螢幕皆有適配；未完成實際瀏覽器視覺 QA，当前環境未提供指定的瀏覽器測試技能。WebMCP 採 feature detection；支援環境驗證尚不可用。

## 驗證紀錄
- HTML inline script 與 editor/app.js 通過 node 語法檢查。
- 驗證頁面 ID 唯一、JavaScript 元素綁定、必需資產路徑。
- 實際執行狀態操作：未確認區域不可換色、合法換色、復原／重做、快照不互相汙染。
- 專案匯入驗證：拒絕不合法 HEX、越界 normalized 選區。
- Canvas 真實瀏覽器的像素與高解析度匯出驗收仍需人工執行。

## 2026-10-09 本機模型整合
新增 `editor/ai.js`，支援本機 bridge 的 SAM2 正負點／框选／遮罩確認及 OpenCLIP 文字相似度。Windows bridge 的程式與啟動說明位於 YOYO-HueSense GitHub `codex/huesense-local-ai-20261009` 分支 `services/studio-bridge/`。Sites 雲端頁面不直接呼叫 localhost；需在 bridge 啟動的本機工作台操作 AI。未取得 Windows 權重與已認證 Python，故尚未完成真實模型／瀏覽器端到端驗收。舊版限制中「未接上 SAM2」現指雲端部署仍未連接公網推論服務，不代表没有實作互動 adapter。
