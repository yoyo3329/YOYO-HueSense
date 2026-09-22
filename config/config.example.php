<?php

declare(strict_types=1);

/**
 * 集中設定檔
 *
 * 之後更換 API Key、模型、API 網址、逾時或網站網址時，
 * 原則上只需要修改這個檔案。
 */
return [
    'app' => [
        'name' => 'color_search_test',
        'title' => 'Color Search',
        'url' => 'http://localhost/color-search-test/',
        'user_agent' => 'ColorSearchTest/4.0',
    ],

    'unsplash' => [
        'enabled' => true,
        'access_key' => 'PASTE_YOUR_UNSPLASH_ACCESS_KEY_HERE',
        'api_base_url' => 'https://api.unsplash.com',
        'site_url' => 'https://unsplash.com/',
        'connect_timeout' => 8,
        'timeout' => 20,
        'per_page_limit' => 30,
        'order_by' => 'relevant',
        'content_filter' => 'high',
        'analysis_image' => [
            'width' => 96,
            'height' => 96,
            'quality' => 60,
            'fit' => 'crop',
            'format' => 'jpg',
        ],
        'utm' => [
            'source' => 'color_search_test',
            'medium' => 'referral',
        ],
    ],


    'serpapi' => [
        // Reference Discovery 專用：SerpApi Google Images API。
        'enabled' => true,
        'api_key' => 'PASTE_YOUR_SERPAPI_API_KEY_HERE',
        'api_base_url' => 'https://serpapi.com/search.json',
        'engine' => 'google_images',
        'connect_timeout' => 8,
        'timeout' => 30,
        'hl' => 'en',
        'gl' => 'us',
        'safe' => 'active',
        'device' => 'desktop',
    ],

    'pexels' => [
        // true：同時搜尋 Pexels；false：只使用其他已啟用圖庫。
        'enabled' => true,
        'api_key' => 'PASTE_YOUR_PEXELS_API_KEY_HERE',
        'api_base_url' => 'https://api.pexels.com/v1',
        'site_url' => 'https://www.pexels.com/',
        'connect_timeout' => 8,
        'timeout' => 20,

        // Pexels 單次最多 80 張；本專案不需要設到那麼高。
        'per_page_limit' => 40,

        // 留空代表不限制。可用值依 Pexels 文件設定。
        'orientation' => '',
        'size' => '',
        'color' => '',
        'locale' => 'en-US',

        // 給瀏覽器做 OKLab／OKLCH 分析的縮圖尺寸來源。
        'analysis_source' => 'tiny',
    ],


    'pixabay' => [
        // true：同時搜尋 Pixabay；false：暫時停用 Pixabay。
        'enabled' => true,
        'api_key' => 'PASTE_YOUR_PIXABAY_API_KEY_HERE',
        'api_base_url' => 'https://pixabay.com/api',
        'site_url' => 'https://pixabay.com/',
        'connect_timeout' => 8,
        'timeout' => 20,

        // Pixabay 每頁可回傳 3～200 張；本專案先限制為 40。
        'per_page_limit' => 40,

        // 目前搜尋詞由 AI 轉成英文，因此使用 en。
        'lang' => 'en',
        'image_type' => 'photo',
        'orientation' => 'all',
        'category' => '',
        'colors' => '',
        'min_width' => 0,
        'min_height' => 0,
        'editors_choice' => false,
        'safesearch' => true,
        'order' => 'popular',

        // preview、webformat 或 large；供 OKLab／OKLCH 像素分析使用。
        'analysis_source' => 'webformat',

        // Pixabay 官方要求 API 查詢結果快取 24 小時。
        'cache' => [
            'enabled' => true,
            'ttl' => 86400,
            'directory' => __DIR__ . '/../cache/pixabay',
        ],
    ],

    'ai' => [
        // 本專案的語言模型只使用 OpenRouter Chat Completions。
        'provider' => 'openrouter',
        'enabled' => true,
        'api_key' => 'PASTE_YOUR_OPENROUTER_API_KEY_HERE',
        'api_url' => 'https://openrouter.ai/api/v1/chat/completions',

        // 想換模型時只改這一行。
        'model' => 'openrouter/free',

        'temperature' => 0.1,
        'max_output_tokens' => 1800,
        'connect_timeout' => 8,
        'timeout' => 60,
        'user_agent' => 'ColorSearchTest/4.0',

        // OpenRouter 應用識別。localhost 也可使用。
        'referer' => 'http://localhost/color-search-test/',
        'title' => 'Color Search',

        // 相容模型會依 JSON Schema 回傳固定結構。
        'structured_output' => true,
        'schema_name' => 'semantic_interpretation',

        // openrouter/free 時，只路由到支援 response_format/json_schema 的模型。
        'require_parameters' => true,
        'allow_fallbacks' => true,

        // 提早攔截誤貼 Gemini、Google Cloud 或其他服務的 Key。
        'required_key_prefix' => 'sk-or-v1-',

        // 額外 HTTP 標頭；沒有需要時保持空陣列。
        'extra_headers' => [],
    ],

    'analysis' => [
        'concurrency' => 5,
        'final_score_weights' => [
            'semantic' => 0.30,
            'color_match' => 0.55,
            'query_overlap' => 0.15,
            'constraint_penalty' => 0.40,
        ],
        'semantic_exclusion' => [
            'per_hit_penalty' => 0.28,
            'max_penalty' => 0.75,
        ],
        'qualification' => [
            'minimum_score' => 0.50,
            'minimum_count' => 12,
            'retain_ratio' => 0.70,
        ],
    ],

    'search' => [
        'input_max_length' => 300,
        'default_per_page' => 30,
        'min_per_page' => 12,
        'max_per_page' => 36,
        'per_query_min' => 8,
        'per_query_max' => 18,
        'per_query_extra' => 2,

        // 控制各圖庫在後端排序時的相對影響；1.0 代表同權重。
        'provider_weights' => [
            'unsplash' => 1.0,
            'pexels' => 1.0,
            'pixabay' => 1.0,
        ],

        'backend_rank_weights' => [
            'semantic' => 0.76,
            'query_overlap' => 0.24,
        ],
    ],
];
