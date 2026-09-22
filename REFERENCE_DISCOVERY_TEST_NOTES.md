# Reference Discovery Test Build

此版本由使用者提供的 color-search-test(IM).zip 重新建立。

## 本次目的
只先完成第一輪 Reference Discovery 網頁測試：
- 取得 50 / 80 / 100 張 raw Reference
- 顯示 source distribution
- 顯示 query_family distribution
- 瀏覽器實際載入時統計失效圖片 URL
- 人工逐張標記：合理 / 灰區 / 錯圖
- 匯出本次測試 JSON

## 刻意沒有執行
Reference Test 頁不執行：
- Content Gate
- CLIP
- Vision
- Ranking
- ToneAnalyzer
- A/B/C

因此不會再出現「60 張候選只剩 2 張」後才拿來當 Reference 的情況。

## 目前 Reference Provider
Reference Discovery 已改為 **SerpApi Google Images API**：
- endpoint：`https://serpapi.com/search.json`
- engine：`google_images`
- API Key 以 `api_key` query parameter 傳送
- 圖片資料讀取 `images_results[]`
- `thumbnail` 用於測試頁快速顯示
- `original` 優先作為後續視覺分析 URL
- `link` 保留原始來源頁
- `source` / `source_domain` 用於來源分布統計

Unsplash / Pexels / Pixabay **不參與 Reference Pool**，仍保留為正式 Display Pool provider。

## Y2K Debug Seed
Y2K 暫時只使用上位 query family：
- core: Y2K aesthetic
- era_culture: millennium digital culture
- fashion: early 2000s fashion editorial
- graphic: Y2K graphic design
- lifestyle: early 2000s lifestyle

沒有把 CRT / flip phone 等單一 iconic object 寫進 Reference query family。

## 2026-08-30 SerpApi Google Images 修正版
- 移除 `src/BraveImageSearchClient.php`。
- 新增 `src/SerpApiGoogleImagesClient.php`。
- `config/config.php` 的 Reference 設定由 `brave` 改為 `serpapi`。
- `ReferenceDiscoveryService` 只建立 `serpapi_google_images` Reference Provider。
- `source_mode` 改為 `serpapi_google_images`。
- Source distribution 改為統計實際來源網站 domain，而不是只顯示單一 API provider。
- Reference Test 仍不執行 Content Gate / CLIP / Vision / Ranking / ToneAnalyzer / A/B/C。
- API Key 仍只存在本機 `config/config.php`；`config.example.php` 僅保留 placeholder。
