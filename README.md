# Color Search Test — OpenRouter＋SerpApi Reference＋三圖庫 Display

本專案使用：

- 單一自由文字輸入
- OpenRouter 語言模型解析五個語意頻道
- SerpApi Google Images API 建立 Reference Pool
- Unsplash、Pexels、Pixabay API 提供 Display 候選圖片
- OKLab／OKLCH、K-means 與色彩感知規則重新評分
- A／B／C 三種候選色調方向

## 1. 所有可更換設定都集中在哪裡？

只需修改：

```text
config/config.php
```

API Key、模型、API URL、網站 URL、逾時、每頁數量與評分權重都集中在這個檔案。其他 PHP 或 JavaScript 檔案不再保存可更換的 API Key、模型名稱或 API URL。

## 2. 最常修改的設定

```php
'ai' => [
    'api_key' => 'sk-or-v1-你的 OpenRouter API Key',
    'api_url' => 'https://openrouter.ai/api/v1/chat/completions',
    'model' => 'openrouter/free',
],
```

更換 OpenRouter 模型時，只改：

```php
'model' => '新的模型 ID',
```

Reference Search 與三個 Display 圖片 API Key：

```php
'serpapi' => [
    'enabled' => true,
    'api_key' => '你的 SerpApi API Key',
    'engine' => 'google_images',
],
```

Display 圖片 API Key：

```php
'unsplash' => [
    'access_key' => '你的 Unsplash Access Key',
],

'pexels' => [
    'api_key' => '你的 Pexels API Key',
],

'pixabay' => [
    'api_key' => '你的 Pixabay API Key',
],
```

網站不是 8080 時：

```php
'app' => [
    'url' => 'http://localhost/color-search-test/',
],

'ai' => [
    'referer' => 'http://localhost/color-search-test/',
],
```

若資料夾名稱不同，例如 `A87`，改成：

```php
'url' => 'http://localhost/A87/',
'referer' => 'http://localhost/A87/',
```

## 3. 主要檔案

```text
config/config.php              所有集中設定
src/OpenRouterClient.php       OpenRouter Chat Completions 請求
src/SerpApiGoogleImagesClient.php  SerpApi Google Images Reference Search
src/ReferenceDiscoveryService.php  建立 Reference Pool、去重與來源/query family 統計
src/ServiceFactory.php         依設定建立語言模型與三個 Display 圖片 API Client
src/ConfigLoader.php           統一載入設定
src/SemanticInterpreter.php    五頻道語意解析與規則備援
src/UnsplashClient.php         Unsplash 搜尋與圖片資料整理
src/PexelsClient.php           Pexels 搜尋與圖片資料整理
src/PixabayClient.php          Pixabay 搜尋、24 小時快取與圖片資料整理
api/interpret.php              解析使用者描述
api/search.php                 多查詢搜尋與後端初步排序
api/settings.php               只輸出安全的前端設定，不包含 Key
public/js/tone-analyzer.js      OKLab／OKLCH 圖片分析與最終評分
```

原本的 `src/GeminiClient.php` 已移除，程式內也不再讀取：

```text
gemini_api_key
gemini_model
openai_api_key
openai_model
```

## 4. 執行方式

將資料夾放到：

```text
C:\xampp\htdocs\color-search-test
```

啟動 Apache，開啟：

```text
http://localhost/color-search-test/
```

修改 JavaScript 後可按：

```text
Ctrl + F5
```

## 5. 未設定或 API 失敗時

若 OpenRouter Key 未設定、免費模型暫時不可用或模型不支援結構化輸出，系統會顯示：

```text
語言模型暫時無法使用，已改用規則備援
```

圖片搜尋只需要至少設定 Unsplash、Pexels 或 Pixabay 其中一組 Key；未填 Key 的圖庫會自動略過。

## 6. 評分權重

可在 `config/config.php` 的 `analysis` 區修改：

```php
'final_score_weights' => [
    'semantic' => 0.30,
    'color_match' => 0.55,
    'query_overlap' => 0.15,
    'constraint_penalty' => 0.40,
],
```

後端候選排序權重則位於：

```php
'search' => [
    'backend_rank_weights' => [
        'semantic' => 0.76,
        'query_overlap' => 0.24,
    ],
],
```

## A/B/C 色票去重修正

`public/js/tone-analyzer.js` 會先從每個色彩群保留較多候選色，再以 OKLab Delta E 做跨方向色票去重。A/B/C 仍只使用各群圖片實際擷取到的顏色，不會憑空產生顏色。若兩個方向原本得到相同名稱，會依代表色相增加「深藍、青灰、黑灰」等辨識後綴。

## Pexels API

本版本可同時搜尋 Unsplash、Pexels 與 Pixabay。請在 `config/config.php` 填入：

```php
'pexels' => [
    'enabled' => true,
    'api_key' => '你的 Pexels API Key',
    // ...
],
```

Pexels 的認證標頭是 `Authorization: YOUR_API_KEY`，不要加 `Bearer`。
若只想暫時停用 Pexels，將 `enabled` 改成 `false`。

## Pixabay API

本版本已加入 Pixabay，會與 Unsplash、Pexels 的結果合併排序。請在 `config/config.php` 填入：

```php
'pixabay' => [
    'enabled' => true,
    'api_key' => '你的 Pixabay API Key',
    // 其他設定保持不變
],
```

Pixabay 的 API Key 由後端放在查詢參數 `key` 中，前端不會取得 Key。`src/PixabayClient.php` 會把同一查詢的 API 回應快取 24 小時，快取檔位於 `cache/pixabay/`。若暫時不使用 Pixabay，將 `enabled` 改成 `false`。

圖片卡片會依來源顯示攝影者與 Unsplash、Pexels 或 Pixabay 連結。Pixabay 圖片網址僅用於暫時顯示搜尋結果，不會被永久儲存。


## SerpApi Google Images Reference Discovery

Reference Test 頁：

```text
http://localhost/color-search-test/public/reference-test.html
```

Reference API：

```text
api/reference-discovery.php
```

Reference 流程：

```text
query family
→ SerpApi Google Images (engine=google_images)
→ images_results[]
→ structural dedupe
→ 50 / 80 / 100 raw Reference
→ 人工合理 / 灰區 / 錯圖標記
```

此層不執行 CLIP、Vision、正式 Ranking、ToneAnalyzer 或 A/B/C。
