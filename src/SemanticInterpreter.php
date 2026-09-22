<?php

declare(strict_types=1);

require_once __DIR__ . '/OpenRouterClient.php';

final class SemanticInterpreter
{
    /** @var string[] */
    private const COLOR_RULE_IDS = [

        'none',
        // HueSense 25 個感受詞規則
        'bright',
        'deep',
        'calm',
        'soft',
        'vivid',
        'warm',
        'cool',
        'natural',
        'modern',
        'mature',
        'friendly',
        'luxurious',
        'lively',
        'professional',
        'technological',
        'minimalist',
        'elegant',
        'romantic',
        'refreshing',
        'mysterious',
        'vintage',
        'pure',
        'bold',
        'playful',
        'healing',

        // 功能性／複合條件規則
        'dark',
        'light_weight',
        'heavy',
        'neutral',
        'low_contrast',
        'high_contrast',
        'high_chroma',
        'low_chroma',
        'oppressive',
        'humid_heat',
    ];
    // Priority 安全別名
    private const PRIORITY_ALIASES = [
    'very_important' => 'main',
    'primary' => 'main',
    'important' => 'main',

    'normal' => 'secondary',
    'medium' => 'secondary',

    'minor' => 'slight',
    'low' => 'slight',
];
    // COlor rule 安全別名
    private const COLOR_RULE_ALIASES = [
    'darkness' => 'dark',
    'very_dark' => 'dark',

    'bright_light' => 'bright',

    'muted' => 'low_chroma',
    'low_saturation' => 'low_chroma',

    'saturated' => 'high_chroma',
    'high_saturation' => 'high_chroma',
];

    private const OPPOSITE_RULE_PAIRS = [
    ['bright', 'dark'],
    ['warm', 'cool'],
    ['high_contrast', 'low_contrast'],
    ['high_chroma', 'low_chroma'],
    ['light_weight', 'heavy'],
];

    public function __construct(
        private readonly ?OpenRouterClient $client = null
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function interpret(string $input): array
    {
        $input = trim($input);
        if ($input === '') {
            throw new InvalidArgumentException('描述不可為空白。');
        }

        if ($this->client === null) {
            return $this->fallbackInterpret($input, '未設定 OpenRouter API Key，暫時使用規則備援解析。');
        }

        try {
            $result = $this->client->createStructuredResponse(
                $this->instructions(),
                $input,
                $this->schema(),
                'color_search_semantics'
            );

            return $this->normalizeResult($input, $result, 'openrouter');
        } catch (Throwable $error) {
            return $this->fallbackInterpret(
                $input,
                'OpenRouter 暫時無法使用，已改用規則備援：' . $error->getMessage()
            );
        }
    }

    private function instructions(): string
    {
        return <<<'TEXT'
你是「視覺搜尋語意解析器」。

你的唯一工作是將使用者的繁體中文或中英混合描述，
解析成嚴格的結構化語意資料。

你不負責搜尋圖片、不負責產生色票，
也絕對不能自行編造明度、色度、冷暖、對比或任何色彩數字。

【系統任務目的】

你輸出的結構化語意資料，後續會交由其他程式模組處理，
包括：

1. 將語意轉換成適合 Unsplash、Pexels、Pixabay 的英文圖庫搜尋詞。
2. 將同一主題拆分成 A / B / C 不同但仍合理的視覺探索方向。
3. 讓不同視覺探索方向盡量取得具有實際內容差異的圖片候選池。
4. 將搜尋到的實際圖片交由後續模組進行像素、色彩與視覺特徵分析。
5. 最終由後續系統從各方向的大量實際圖片中統計共同色彩特徵，再形成代表該方向的色票。

因此，你現在只負責「語意理解與搜尋語意規劃」，
不能自行決定最終色票，
不能自行設定 A / B / C 的明度、彩度、冷暖或對比數值。


【核心視覺分流原則】

同一個主題、風格或美學概念，
可能同時存在多種合理且具代表性的視覺表現方式。

例如，同一種美學不一定只有單一色系，
可能同時存在鮮豔、復古、金屬、自然、暗黑、華麗等不同視覺子風格。

這些差異必須來自主題本身真實存在的視覺文化、
典型場景、造型、材質、環境、時段或美學子風格，
不得只依靠亮度、彩度或對比高低來製造差異。

不得假設：
A = 明亮
B = 標準
C = 黑暗

A / B / C 的數值色彩偏移會由後續 ColorRuleEngine 與 BranchBuilder 處理，
不得反向利用這些數值規則決定 style_terms。


【不同圖片候選池原則】

style_terms 不只是相關關鍵字，
而是用來協助後續系統取得「不同視覺表現方式的圖片群」。

如果兩個 style_terms 預期會在 Unsplash、Pexels、Pixabay
搜尋到高度相似的圖片內容，
則代表兩個方向的區別不足。

此時應優先改用更具有差異的：

- 典型場景
- 服裝或造型方式
- 材質
- 物件語彙
- 空間或環境
- 時段
- 燈光情境
- 文化美學子風格

但所有方向都必須持續符合使用者原始主題，
不得為了增加差異而加入無關內容。


【色彩來源原則】

你可以辨識使用者明確描述的色彩感受，
並依照後面的既有 color_rule 與 visual_tags 規則輸出。

但是：

不得因為某個視覺子風格「通常可能」偏某種色系，
就自行生成新的色彩數值。

最終各方向的代表色彩，
應由後續系統分析實際搜尋圖片，
從大量圖片的共同色彩特徵中統計得出。

因此，語意分流的目的主要是建立不同且合理的圖片資料群，
不是在此階段直接決定色票。

【一、概念分類 category】

每個概念只能屬於以下一類：

1. subject
圖片中具體的物件、人物、產品、產業或主體。
例如：保養品、咖啡、服飾、人物、花朵。

2. context
季節、時間、地點、使用情境或環境背景。
例如：夏季、夜晚、室內、海邊。

3. atmosphere
整體環境氛圍、視覺風格或敘事情緒。
例如：壓迫、悶熱、神秘、復古、電影感。

4. color
能可靠轉換成固定色彩特徵的感受。
例如：明亮、黑暗、柔和、鮮明、溫暖、冷靜。

5. exclusion
使用者以「不要、避免、排除、不能太、不希望過於」
等語句明確否定的概念。

否定概念不得再次被解析成正向概念。

【二、優先程度 priority】

priority 只能是：

- main：主要需求
- secondary：一般或次要需求
- slight：稍微、帶一點、有點
- exclude：排除條件

category 為 exclusion 時，
priority 必須是 exclude。

【三、強度 intensity】

intensity 必須介於 0.5 到 1.5。

使用下列固定基準：

- 極度、極強、非常強烈：1.5
- 非常、十分：1.4
- 強烈、主要、明顯：1.3
- 很：1.2
- 一般描述：1.0
- 偏、略為：0.85
- 有點：0.7
- 稍微：0.6
- 一點、些微：0.5

不得任意產生無意義的小數。

【四、英文搜尋詞 search_term】
【搜尋概念拆解 search_facets】

每個概念還必須提供 search_facets：

1. style_terms
用於英文圖庫文字搜尋的視覺子風格、典型場景、材質語彙、
造型方向、燈光或環境描述。

style_terms 的主要目的不是產生同義詞，
而是協助同一主題探索「不同但仍合理的視覺表現方式」。

當一個 subject、context 或 atmosphere
本身具有多種常見視覺表現時，
優先產生 2～3 個彼此差異明顯、
且適合 Unsplash、Pexels、Pixabay 搜尋的英文方向。

每一項應盡量代表不同的：
- 場景
- 造型
- 材質
- 時段
- 氣氛
- 美學子風格

不得只是同義改寫。

例如不應該：
summer vibe
sunny day
warm summer

因為三者視覺差異不足。

應該盡量像：
beach holiday
summer lifestyle
sunset nightlife

三者仍屬於 summer，
但畫面內容與可能出現的配色都有明顯差異。

若輸入本身是具有多種子風格的美學概念，
應優先拆出其常見且具代表性的不同視覺表現。

例如 Y2K 可以是：
cyber pop
retro technology
metallic streetwear

這些只是說明拆解邏輯，
不得把範例當成固定 mapping。
實際輸出必須依照使用者輸入動態判斷。

重要：
- 不要為了製造差異而離開原始主題。
- 不要憑空加入與主題無關的物件。
- 不要求三個方向一定一亮、一中、一暗。
- 色彩差異若本來就是該主題的典型子風格，可以自然保留。
- 不要因為 Branch A / B / C 的亮度或彩度規則，反向決定 style_terms。
- style_terms 主要描述「內容與美學方向」，色調只作為其中一種可能特徵。

最多 3 項，每項最多 3 個英文單字。
若概念真的沒有合理的不同視覺表現，可回傳 1 項或空陣列 []。

2. theme_elements
用來描述「圖片畫面中實際可能看得到」的代表性主題元素，而不是抽象同義詞。
它們會被後續 SearchPlanner 拆成不同 semantic query family，讓搜尋不只依賴使用者原始關鍵字。

每個元素必須包含：
- term：1～4 個英文單字，描述具體可觀察的物件、服裝、道具、材質、建築、活動或場景元素。
- family：簡短英文語意家族，例如 technology、fashion、object、environment、architecture、material、activity、era_signal。

原則：
- 優先產生 3～6 個具有辨識力的具體元素。
- 不要只是把原始概念換成同義詞。
- 不要把 bright、dark、retro、classic 這類抽象風格詞當成 theme element。
- 元素必須和原始主題有可解釋關係；不確定時寧可少給。
- 同一 family 可以有多個元素，但應盡量涵蓋至少 2 個不同 family。

例如 Y2K 可合理包含：
flip phone / technology
CRT monitor / technology
compact digital camera / technology
CD player / technology
low rise denim / fashion
metallic accessories / material

這些只是示範元素層的格式，不是固定 mapping。

3. visual_tags
可透過圖片像素分析驗證的客觀視覺特徵。
只能使用以下值：

red、orange、yellow、green、cyan、blue、purple、pink、
warm、cool、dark、light、muted、vivid

最多 3 項。
沒有客觀視覺特徵時回傳空陣列 []。

例如：

例如：

「夏季」
style_terms：
beach holiday、summer lifestyle、sunset nightlife

visual_tags：
warm、light

「Y2K」
style_terms：
cyber pop、retro technology、metallic streetwear

theme_elements：
CRT monitor / technology、compact digital camera / technology、low rise denim / fashion

visual_tags：
[]

「電影藍調」
style_terms：
neon city、rainy cinema、moody interior

visual_tags：
blue、cool

「孤獨故事感」
style_terms：
empty room、solitary figure、quiet street

visual_tags：
[]

visual_tags：
[]
search_term 必須：

- 適合 Unsplash、Pexels、Pixabay 圖庫搜尋
- 使用簡短英文
- 每個概念最多三個英文單字
- 不堆疊重複同義詞
- 不加入使用者沒有提到的主題

例如：

柔和 → soft light
保養品 → skincare
夜晚 → night
壓迫感 → oppressive mood

【五、色彩規則 color_rule】

color_rule 只能從允許的規則 ID 中選擇。



只有可以可靠轉成固定色彩特徵的概念，
才可以使用非 none 的規則。

subject、context 或純構圖概念通常使用 none。

否定概念若對應既有色彩規則，
仍應保留該 color_rule，
並以 category=exclusion、priority=exclude 表示排除。

例如：

不要高對比
→ category: exclusion
→ color_rule: high_contrast
→ priority: exclude

不要過度暗沉
→ category: exclusion
→ color_rule: dark
→ priority: exclude

不要復古
→ category: exclusion
→ color_rule: vintage
→ priority: exclude

【六、衝突偵測】

當使用者同時提出方向相反且都具有重要性的需求時，
設定 conflict_detected=true。

例如：

- 黑暗與明亮
- 高對比與低對比
- 高彩度與低彩度
- 溫暖與冷冽
- 極簡與澎湃

但以下不是衝突：

- 黑暗，但不要過度暗沉
- 柔和，但需要局部清晰
- 偏暖，但不要過黃

這些屬於目標加限制條件。

【七、去重與禁止事項】

1. 相同語意只保留一次。
2. 不因同義詞數量增加權重。
3. 不新增使用者沒有提及的主題、產品、產業或顏色。
4. 不自行產生色彩數字。
5. 不輸出 Markdown、程式碼區塊或 JSON 以外的說明。
6. summary 使用繁體中文簡短描述系統理解。
7. confidence 表示對該概念判斷的信心，介於 0 到 1。
8. overall_confidence 表示整體解析信心，介於 0 到 1。

【解析範例】

輸入：
夏季悶熱黑暗，希望有壓迫感，但不要過於暗沉

正確理解：

- 夏季：context、summer、none
- 悶熱：atmosphere、humid heat、humid_heat
- 黑暗：color、dark atmosphere、dark
- 壓迫感：atmosphere、oppressive mood、oppressive
- 過於暗沉：exclusion、too dark、dark、exclude

這不是「黑暗與明亮」衝突，
而是希望畫面偏暗，但需要限制過度暗沉。
TEXT;
    }

    /**
     * @return array<string, mixed>
     */
    private function schema(): array
{
    return [
        'type' => 'object',
        'additionalProperties' => false,

        'required' => [
            'summary',
            'overall_confidence',
            'conflict_detected',
            'conflicts',
            'concepts',
        ],

        'properties' => [
            'summary' => [
                'type' => 'string',
            ],

            'overall_confidence' => [
                'type' => 'number',
                'minimum' => 0,
                'maximum' => 1,
            ],

            /*
             * 是否存在互相衝突的需求。
             */
            'conflict_detected' => [
                'type' => 'boolean',
            ],

            /*
             * 衝突的詳細內容。
             * 沒有衝突時必須回傳空陣列 []。
             */
            'conflicts' => [
                'type' => 'array',
                'maxItems' => 8,

                'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,

                    'required' => [
                        'terms',
                        'type',
                        'resolution',
                        'reason',
                    ],

                    'properties' => [
                        /*
                         * 發生衝突的原始詞彙。
                         * 例如：["明亮", "黑暗"]
                         */
                        'terms' => [
                            'type' => 'array',
                            'minItems' => 2,
                            'maxItems' => 3,

                            'items' => [
                                'type' => 'string',
                            ],
                        ],

                        /*
                         * 衝突種類。
                         */
                        'type' => [
                            'type' => 'string',

                            'enum' => [
                                'color_conflict',
                                'atmosphere_conflict',
                                'priority_conflict',
                            ],
                        ],

                        /*
                         * 建議後續如何處理。
                         */
                        'resolution' => [
                            'type' => 'string',

                            'enum' => [
                                'use_primary',
                                'reduce_secondary',
                                'branch',
                                'ask_user',
                            ],
                        ],

                        /*
                         * 為何判斷為衝突。
                         */
                        'reason' => [
                            'type' => 'string',
                        ],
                    ],
                ],
            ],

            /*
             * 使用者輸入拆解出的概念。
             */
            'concepts' => [
                'type' => 'array',
                'maxItems' => 16,

                'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,

                    'required' => [
                        'original_text',
                        'normalized_label',
                        'category',
                        'search_term',
                        'color_rule',
                        'priority',
                        'intensity',
                        'confidence',
                        'search_facets'
                    ],

                    'properties' => [
                        'original_text' => [
                            'type' => 'string',
                        ],

                        'normalized_label' => [
                            'type' => 'string',
                        ],

                        'category' => [
                            'type' => 'string',

                            'enum' => [
                                'subject',
                                'context',
                                'atmosphere',
                                'color',
                                'exclusion',
                            ],
                        ],

                        'search_term' => [
                            'type' => 'string',
                        ],
                        'search_facets' => [
    'type' => 'object',
    'additionalProperties' => false,

    'required' => [
        'style_terms',
        'theme_elements',
        'visual_tags',
    ],

    'properties' => [
        'style_terms' => [
            'type' => 'array',
            'maxItems' => 3,
            'items' => [
                'type' => 'string',
            ],
        ],

        'theme_elements' => [
            'type' => 'array',
            'maxItems' => 8,
            'items' => [
                'type' => 'object',
                'additionalProperties' => false,
                'required' => ['term', 'family'],
                'properties' => [
                    'term' => [
                        'type' => 'string',
                    ],
                    'family' => [
                        'type' => 'string',
                    ],
                ],
            ],
        ],

        'visual_tags' => [
            'type' => 'array',
            'maxItems' => 3,
            'items' => [
                'type' => 'string',
                'enum' => [
                    'red',
                    'orange',
                    'yellow',
                    'green',
                    'cyan',
                    'blue',
                    'purple',
                    'pink',
                    'warm',
                    'cool',
                    'dark',
                    'light',
                    'muted',
                    'vivid',
                ],
            ],
        ],
    ],
],
                        'color_rule' => [
                            'type' => 'string',
                            'enum' => self::COLOR_RULE_IDS,
                        ],

                        'priority' => [
                            'type' => 'string',

                            'enum' => [
                                'main',
                                'secondary',
                                'slight',
                                'exclude',
                            ],
                        ],

                        'intensity' => [
                            'type' => 'number',
                            'minimum' => 0.5,
                            'maximum' => 1.5,
                        ],

                        'confidence' => [
                            'type' => 'number',
                            'minimum' => 0,
                            'maximum' => 1,
                        ],
                    ],
                ],
            ],
        ],
    ];
}

    /**
     * @param array<string, mixed> $result
     * @return array<string, mixed>
     */
    private function normalizeResult(
    string $input,
    array $result,
    string $source
): array {
    $concepts = [];
    $seen = [];

    foreach (($result['concepts'] ?? []) as $concept) {
        if (!is_array($concept)) {
            continue;
        }

        // 1. category
        $category = strtolower(
            trim((string) ($concept['category'] ?? 'atmosphere'))
        );

        if (
            !in_array(
                $category,
                ['subject', 'context', 'atmosphere', 'color', 'exclusion'],
                true
            )
        ) {
            $category = 'atmosphere';
        }

        // 2. priority：先保留 AI 原始值，再交給 PHP 判斷
        $rawPriority = trim(
            (string) ($concept['priority'] ?? '')
        );

        $priorityResult = $this->normalizePriority(
            $rawPriority,
            $category
        );

        $priority = $priorityResult['value'];
        $priorityStatus = $priorityResult['status'];

        // 3. color_rule：先保留 AI 原始值，再交給 PHP 判斷
        $rawColorRule = trim(
            (string) ($concept['color_rule'] ?? '')
        );

        $colorRuleResult = $this->normalizeColorRule(
            $rawColorRule
        );

        $colorRule = $colorRuleResult['value'];
        $colorMappingStatus = $colorRuleResult['status'];

        // 4. 基本文字
        $searchTerm = $this->cleanSearchTerm(
            (string) ($concept['search_term'] ?? '')
        );

        $originalText = trim(
            (string) ($concept['original_text'] ?? '')
        );

        $normalizedLabel = trim(
            (string) (
                $concept['normalized_label']
                ?? $originalText
            )
        );

        // 5. search_facets
        $searchFacets = $this->normalizeSearchFacets(
            $concept['search_facets'] ?? []
        );

        $styleTerms = $searchFacets['style_terms'];
        $themeElements = $searchFacets['theme_elements'];
        $visualTags = $searchFacets['visual_tags'];

        // 完全沒有可用資料就跳過
        if (
            $originalText === ''
            && $searchTerm === ''
            && $styleTerms === []
            && $themeElements === []
            && $visualTags === []
        ) {
            continue;
        }

        // 6. 去重
        $dedupeValue =
            $searchTerm
            ?: (
                $normalizedLabel
                ?: $originalText
            );

        $dedupeKey = strtolower(
            $category . '|' . $dedupeValue
        );

        if (isset($seen[$dedupeKey])) {
            continue;
        }

        $seen[$dedupeKey] = true;

        // 7. intensity
        $intensity = $this->clamp(
            (float) ($concept['intensity'] ?? 1.0),
            0.5,
            1.5
        );

        // 8. confidence
        $confidence = $this->clamp(
            (float) ($concept['confidence'] ?? 0.7),
            0,
            1
        );

        // AI 有被修正時，信心稍微降低
        if ($priorityStatus === 'normalized') {
            $confidence = max(0, $confidence - 0.05);
        }

        if ($priorityStatus === 'unmapped') {
            $confidence = max(0, $confidence - 0.15);
        }

        if ($colorMappingStatus === 'normalized') {
            $confidence = max(0, $confidence - 0.05);
        }

        if ($colorMappingStatus === 'unmapped') {
            $confidence = max(0, $confidence - 0.25);
        }

        // 9. 是否能套固定 ColorRuleEngine 規則
        $applyToAnchorRules =
            $colorRule !== 'none'
            && $colorMappingStatus !== 'unmapped';

        // 10. 是否有圖片實際色彩可檢查
        $applyToVisualFilter =
            $visualTags !== [];

        // 11. 決定後續搜尋方式
        if ($applyToAnchorRules) {
            $retrievalMode = 'standard';
        } elseif ($applyToVisualFilter) {
            $retrievalMode = 'dual_track';
        } else {
            $retrievalMode = 'search_only';
        }

        // 12. 建立整理後概念
        $normalizedConcept = [
            'id' => 'concept_' . (count($concepts) + 1),

            'original_text' =>
                $originalText ?: $normalizedLabel,

            'normalized_label' =>
                $normalizedLabel ?: $originalText,

            'category' => $category,

            'search_term' => $searchTerm,

            'search_facets' => [
                'style_terms' => $styleTerms,
                'theme_elements' => $themeElements,
                'visual_tags' => $visualTags,
            ],

            'color_rule' => $colorRule,

            'priority' => $priority,

            'intensity' => $intensity,

            'confidence' => $confidence,

            'priority_status' => $priorityStatus,

            'color_mapping_status' =>
                $colorMappingStatus,

            'apply_to_anchor_rules' =>
                $applyToAnchorRules,

            'apply_to_visual_filter' =>
                $applyToVisualFilter,

            'retrieval_mode' =>
                $retrievalMode,
        ];

        // priority 有被修正或無法理解，保留 AI 原始值
        if ($priorityStatus !== 'exact') {
            $normalizedConcept['raw_priority'] =
                $rawPriority;
        }

        // color_rule 有被修正或無法理解，保留 AI 原始值
        if ($colorMappingStatus !== 'exact') {
            $normalizedConcept['raw_color_rule'] =
                $rawColorRule;
        }

        $concepts[] = $normalizedConcept;
    }
    
    // AI 沒解析到任何可用概念
    if ($concepts === []) {
        return $this->fallbackInterpret(
            $input,
            'OpenRouter 模型未擷取到可用概念，已改用規則備援。'
        );
    }

    // 13. 整理 AI 偵測的衝突
    $aiConflicts = $this->normalizeConflicts(
        $result['conflicts'] ?? []
    );

    // 14. PHP 自己再檢查一次
    $ruleConflicts = $this->detectRuleConflicts(
        $concepts
    );

    // 15. 合併並去重
    $conflicts = $this->mergeConflicts(
        $aiConflicts,
        $ruleConflicts
    );

    // 16. summary
    $summary = trim(
        (string) ($result['summary'] ?? '')
    );

    if ($summary === '') {
        $summary = '已完成語意拆解。';
    }

    // 17. 最終輸出
    return [
        'input' => $input,

        'summary' => $summary,

        'overall_confidence' =>
            $this->clamp(
                (float) (
                    $result['overall_confidence']
                    ?? 0.7
                ),
                0,
                1
            ),

        'source' => $source,

        'notice' => '',

        'conflict_detected' =>
            $conflicts !== [],

        'conflicts' => $conflicts,

        'concepts' => $concepts,
    ];
}

    /**
     * 小型備援解析器只在 AI 未設定或失敗時使用，不負責大量同義詞擴充。
     *
     * @return array<string, mixed>
     */
    /**

 * 將 enum 類型的文字整理成統一格式。

 *

 * 例如：

 * Very Important

 * very-important

 * very_important

 *

 * 最後都會整理成：

 * very_important

 */

private function normalizeEnumToken(

    string $value

): string {

    $value = strtolower(

        trim($value)

    );



    return preg_replace(

        '/[\s\-]+/',

        '_',

        $value

    ) ?? $value;

}

    /**

 * 檢查 priority 是否為合法值。

 *

 * @return array{value:string,status:string}

 */

private function normalizePriority(

    string $rawPriority,

    string $category

): array {

    $value = $this->normalizeEnumToken(

        $rawPriority

    );



    /*

     * exclusion 一律使用 exclude。

     */

    if ($category === 'exclusion') {

        return [

            'value' => 'exclude',



            'status' =>

                $value === 'exclude'

                    ? 'exact'

                    : 'normalized',

        ];

    }



    /*

     * AI 原本就回傳合法值。

     */

    if (

        in_array(

            $value,

            [

                'main',

                'secondary',

                'slight',

            ],

            true

        )

    ) {

        return [

            'value' => $value,

            'status' => 'exact',

        ];

    }



    /*

     * AI 雖然沒有使用正式名稱，

     * 但是可以透過安全別名修正。

     *

     * 例如：

     * very_important → main

     */

    if (

        isset(

            self::PRIORITY_ALIASES[$value]

        )

    ) {

        return [

            'value' =>

                self::PRIORITY_ALIASES[$value],



            'status' => 'normalized',

        ];

    }



    /*

     * 完全無法判斷。

     *

     * 為了讓後面的程式繼續運作，

     * 暫時使用 secondary，

     * 但標記為 unmapped。

     */

    return [

        'value' => 'secondary',

        'status' => 'unmapped',

    ];

}

    /**

 * 檢查 color_rule 是否為合法規則。

 *

 * @return array{value:string,status:string}

 */



    /**

 * 檢查 color_rule 是否為合法規則。

 *

 * @return array{value:string,status:string}

 */

private function normalizeColorRule(

    string $rawColorRule

): array {

    $value = $this->normalizeEnumToken(

        $rawColorRule

    );



    /*

     * AI 原本就使用合法的 color_rule。

     */

    if (

        in_array(

            $value,

            self::COLOR_RULE_IDS,

            true

        )

    ) {

        return [

            'value' => $value,

            'status' => 'exact',

        ];

    }



    /*

     * 檢查是否存在安全別名。

     *

     * 例如：

     * darkness → dark

     * muted → low_chroma

     */

    if (

        isset(

            self::COLOR_RULE_ALIASES[$value]

        )

    ) {

        $mapped =

            self::COLOR_RULE_ALIASES[$value];



        /*

         * 再檢查一次，

         * 確保別名最後指向的規則真的存在。

         */

        if (

            in_array(

                $mapped,

                self::COLOR_RULE_IDS,

                true

            )

        ) {

            return [

                'value' => $mapped,

                'status' => 'normalized',

            ];

        }

    }



    /*

     * 無法可靠對應。

     *

     * 不亂猜，改成 none。

     */

    return [

        'value' => 'none',

        'status' => 'unmapped',

    ];

}

    /**

 * 整理 AI 回傳的搜尋拆解資訊。

 *

 * @return array{

 *     style_terms: array<int,string>,

 *     visual_tags: array<int,string>

 * }

 */

private function normalizeSearchFacets(

    mixed $value

): array {

    /*

     * visual_tags 只允許這些客觀特徵。

     */

    $allowedVisualTags = [

        'red',

        'orange',

        'yellow',

        'green',

        'cyan',

        'blue',

        'purple',

        'pink',



        'warm',

        'cool',



        'dark',

        'light',



        'muted',

        'vivid',

    ];



    /*

     * AI 如果根本沒有回傳正確陣列，

     * 就使用空資料。

     */

    if (!is_array($value)) {

        return [

            'style_terms' => [],

            'theme_elements' => [],

            'visual_tags' => [],

        ];

    }



    /*

     * -----------------------

     * 整理 style_terms

     * -----------------------

     */

    $styleTerms = [];

    $seenStyles = [];



    $rawStyleTerms =

        $value['style_terms'] ?? [];



    if (is_array($rawStyleTerms)) {

        foreach ($rawStyleTerms as $term) {

            /*

             * 使用你原本就有的

             * cleanSearchTerm()

             * 清理搜尋詞。

             */

            $cleaned =

                $this->cleanSearchTerm(

                    (string) $term

                );



            if ($cleaned === '') {

                continue;

            }



            $key = strtolower($cleaned);



            /*

             * 避免重複。

             */

            if (isset($seenStyles[$key])) {

                continue;

            }



            $seenStyles[$key] = true;



            $styleTerms[] = $cleaned;



            /*

             * 最多只保留 3 個。

             */

            if (count($styleTerms) >= 3) {

                break;

            }

        }

    }



    /*
     * -----------------------
     * 整理 theme_elements
     * -----------------------
     */
    $themeElements = [];
    $seenThemeElements = [];
    $rawThemeElements = $value['theme_elements'] ?? [];

    if (is_array($rawThemeElements)) {
        foreach ($rawThemeElements as $element) {
            if (is_string($element)) {
                $term = $this->cleanSearchTerm($element);
                $family = 'visual_element';
            } elseif (is_array($element)) {
                $term = $this->cleanSearchTerm((string) ($element['term'] ?? ''));
                $family = strtolower(trim((string) ($element['family'] ?? 'visual_element')));
                $family = preg_replace('/[^a-z0-9_\- ]+/', '', $family) ?? '';
                $family = preg_replace('/[\s\-]+/', '_', $family) ?? '';
                $family = trim($family, '_') ?: 'visual_element';
            } else {
                continue;
            }

            if ($term === '') {
                continue;
            }

            $key = strtolower($family . '|' . $term);
            if (isset($seenThemeElements[$key])) {
                continue;
            }

            $seenThemeElements[$key] = true;
            $themeElements[] = [
                'term' => $term,
                'family' => $family,
            ];

            if (count($themeElements) >= 8) {
                break;
            }
        }
    }

    /*

     * -----------------------

     * 整理 visual_tags

     * -----------------------

     */

    $visualTags = [];

    $seenTags = [];



    $rawVisualTags =

        $value['visual_tags'] ?? [];



    if (is_array($rawVisualTags)) {

        foreach ($rawVisualTags as $tag) {

            $tag = strtolower(

                trim((string) $tag)

            );



            /*

             * 不在允許清單的標籤直接忽略。

             */

            if (

                !in_array(

                    $tag,

                    $allowedVisualTags,

                    true

                )

            ) {

                continue;

            }



            /*

             * 去除重複。

             */

            if (isset($seenTags[$tag])) {

                continue;

            }



            $seenTags[$tag] = true;



            $visualTags[] = $tag;



            /*

             * 最多 3 個。

             */

            if (count($visualTags) >= 3) {

                break;

            }

        }

    }



    return [

        'style_terms' => $styleTerms,

        'theme_elements' => $themeElements,

        'visual_tags' => $visualTags,

    ];

}

    /**

 * 整理 AI 回傳的衝突資料。

 *

 * @return array<int,array<string,mixed>>

 */

private function normalizeConflicts(

    mixed $value

): array {

    if (!is_array($value)) {

        return [];

    }



    $allowedTypes = [

        'color_conflict',

        'atmosphere_conflict',

        'priority_conflict',

    ];



    $allowedResolutions = [

        'use_primary',

        'reduce_secondary',

        'branch',

        'ask_user',

    ];



    $conflicts = [];



    foreach ($value as $conflict) {

        if (!is_array($conflict)) {

            continue;

        }



        /*

         * -----------------------

         * 整理衝突詞 terms

         * -----------------------

         */

        $rawTerms =

            $conflict['terms'] ?? [];



        if (!is_array($rawTerms)) {

            continue;

        }



        $terms = [];



        foreach ($rawTerms as $term) {

            $term = trim(

                (string) $term

            );



            if ($term !== '') {

                $terms[] = $term;

            }

        }



        /*

         * 移除重複詞。

         */

        $terms = array_values(

            array_unique($terms)

        );



        /*

         * 衝突至少必須有兩個概念。

         */

        if (count($terms) < 2) {

            continue;

        }



        /*

         * -----------------------

         * 整理衝突類型

         * -----------------------

         */

        $type = (string) (

            $conflict['type']

            ?? 'color_conflict'

        );



        if (

            !in_array(

                $type,

                $allowedTypes,

                true

            )

        ) {

            $type = 'color_conflict';

        }



        /*

         * -----------------------

         * 整理解決方式

         * -----------------------

         */

        $resolution = (string) (

            $conflict['resolution']

            ?? 'branch'

        );



        if (

            !in_array(

                $resolution,

                $allowedResolutions,

                true

            )

        ) {

            $resolution = 'branch';

        }



        /*

         * -----------------------

         * 整理原因

         * -----------------------

         */

        $reason = trim(

            (string) (

                $conflict['reason']

                ?? ''

            )

        );



        if ($reason === '') {

            $reason =

                '偵測到方向相反的需求。';

        }



        $conflicts[] = [

            'terms' =>

                array_slice(

                    $terms,

                    0,

                    3

                ),



            'type' => $type,



            'resolution' =>

                $resolution,



            'reason' => $reason,

        ];

    }



    return $conflicts;

}

    /**

 * PHP 自己再檢查一次固定色彩規則是否互相衝突。

 *

 * @param array<int,array<string,mixed>> $concepts

 * @return array<int,array<string,mixed>>

 */

private function detectRuleConflicts(

    array $concepts

): array {

    $activeRules = [];



    foreach ($concepts as $concept) {

        /*

         * exclusion 不算正向需求，

         * 所以不要拿來判定衝突。

         *

         * 例如：

         * 黑暗，但不要過度暗沉

         * 不算 dark 和 dark 衝突。

         */

        if (

            ($concept['category'] ?? '')

            === 'exclusion'

        ) {

            continue;

        }



        /*

         * slight 只是輕微需求，

         * 暫時不視為主要衝突來源。

         */

        if (

            ($concept['priority'] ?? '')

            === 'slight'

        ) {

            continue;

        }



        /*

         * 強度太低也不進衝突判定。

         */

        if (

            (float) (

                $concept['intensity'] ?? 1

            ) < 0.85

        ) {

            continue;

        }



        /*

         * 只有能進 ColorRuleEngine 的規則，

         * 才拿來做固定規則衝突檢查。

         */

        if (

            (

                $concept[

                    'apply_to_anchor_rules'

                ] ?? false

            ) !== true

        ) {

            continue;

        }



        $rule = (string) (

            $concept['color_rule']

            ?? 'none'

        );



        if ($rule === 'none') {

            continue;

        }



        $activeRules[$rule][] =

            (string) (

                $concept['original_text']

                ?? $rule

            );

    }



    $conflicts = [];



    /*

     * 使用前面已經建立的：

     *

     * OPPOSITE_RULE_PAIRS

     *

     * 例如：

     * bright ↔ dark

     * warm ↔ cool

     */

    foreach (

        self::OPPOSITE_RULE_PAIRS

        as [$leftRule, $rightRule]

    ) {

        if (

            empty($activeRules[$leftRule])

            || empty(

                $activeRules[$rightRule]

            )

        ) {

            continue;

        }



        $conflicts[] = [

            'terms' => [

                $activeRules[

                    $leftRule

                ][0],



                $activeRules[

                    $rightRule

                ][0],

            ],



            'type' =>

                'color_conflict',



            'resolution' =>

                'branch',



            'reason' =>

                '同時包含相反的色彩方向：'

                . $leftRule

                . ' 與 '

                . $rightRule

                . '。',

        ];

    }



    return $conflicts;

}

    /**

 * PHP 自己再檢查一次固定色彩規則是否互相衝突。

 *

 * @param array<int,array<string,mixed>> $concepts

 * @return array<int,array<string,mixed>>

 */



    /**

 * 將 AI 找到的衝突

 * 與 PHP 找到的衝突合併，

 * 並刪除重複項目。

 *

 * @param array<int,array<string,mixed>> ...$lists

 * @return array<int,array<string,mixed>>

 */

private function mergeConflicts(

    array ...$lists

): array {

    $merged = [];

    $seen = [];



    foreach ($lists as $list) {

        foreach ($list as $conflict) {

            $terms =

                $conflict['terms'] ?? [];



            if (!is_array($terms)) {

                continue;

            }



            /*

             * 排序後再產生 key，

             * 避免：

             *

             * ["明亮", "黑暗"]

             * ["黑暗", "明亮"]

             *

             * 被當成兩個不同衝突。

             */

            $keyTerms = $terms;



            sort($keyTerms);



            $key =

                (string) (

                    $conflict['type']

                    ?? ''

                )

                . '|'

                . implode(

                    '|',

                    $keyTerms

                );



            /*

             * 已經有相同衝突，

             * 就不要再加入。

             */

            if (isset($seen[$key])) {

                continue;

            }



            $seen[$key] = true;



            $merged[] = $conflict;

        }

    }



    return $merged;

}
    private function fallbackInterpret(string $input, string $notice): array
    {
        $patterns = [
            ['terms' => ['咖啡店', '咖啡'], 'category' => 'subject', 'search' => 'coffee', 'rule' => 'none'],
            ['terms' => ['花朵', '花'], 'category' => 'subject', 'search' => 'flowers', 'rule' => 'none'],
            ['terms' => ['保養品'], 'category' => 'subject', 'search' => 'skincare', 'rule' => 'none'],
            ['terms' => ['服飾'], 'category' => 'subject', 'search' => 'fashion', 'rule' => 'none'],
            ['terms' => ['夏季', '夏天'], 'category' => 'context', 'search' => 'summer', 'rule' => 'none'],
            ['terms' => ['秋季', '秋天'], 'category' => 'context', 'search' => 'autumn', 'rule' => 'none'],
            ['terms' => ['夜晚', '夜間'], 'category' => 'context', 'search' => 'night', 'rule' => 'none'],
            ['terms' => ['室內'], 'category' => 'context', 'search' => 'interior', 'rule' => 'none'],

            // HueSense 25 個感受詞
            ['terms' => ['明亮'], 'category' => 'color', 'search' => 'bright', 'rule' => 'bright'],
            ['terms' => ['深沉'], 'category' => 'color', 'search' => 'deep moody', 'rule' => 'deep'],
            ['terms' => ['沉穩'], 'category' => 'color', 'search' => 'calm stable', 'rule' => 'calm'],
            ['terms' => ['柔和'], 'category' => 'color', 'search' => 'soft', 'rule' => 'soft'],
            ['terms' => ['鮮明'], 'category' => 'color', 'search' => 'vivid', 'rule' => 'vivid'],
            ['terms' => ['溫暖'], 'category' => 'color', 'search' => 'warm', 'rule' => 'warm'],
            ['terms' => ['冷靜'], 'category' => 'color', 'search' => 'cool calm', 'rule' => 'cool'],
            ['terms' => ['自然'], 'category' => 'color', 'search' => 'natural', 'rule' => 'natural'],
            ['terms' => ['現代'], 'category' => 'color', 'search' => 'modern', 'rule' => 'modern'],
            ['terms' => ['成熟'], 'category' => 'color', 'search' => 'mature', 'rule' => 'mature'],
            ['terms' => ['親切'], 'category' => 'color', 'search' => 'friendly', 'rule' => 'friendly'],
            ['terms' => ['奢華'], 'category' => 'color', 'search' => 'luxury', 'rule' => 'luxurious'],
            ['terms' => ['活潑'], 'category' => 'color', 'search' => 'lively', 'rule' => 'lively'],
            ['terms' => ['專業'], 'category' => 'color', 'search' => 'professional', 'rule' => 'professional'],
            ['terms' => ['科技感'], 'category' => 'color', 'search' => 'futuristic technology', 'rule' => 'technological'],
            ['terms' => ['簡約'], 'category' => 'color', 'search' => 'minimalist', 'rule' => 'minimalist'],
            ['terms' => ['優雅'], 'category' => 'color', 'search' => 'elegant', 'rule' => 'elegant'],
            ['terms' => ['浪漫'], 'category' => 'color', 'search' => 'romantic', 'rule' => 'romantic'],
            ['terms' => ['清爽'], 'category' => 'color', 'search' => 'fresh clean', 'rule' => 'refreshing'],
            ['terms' => ['神秘'], 'category' => 'color', 'search' => 'mysterious', 'rule' => 'mysterious'],
            ['terms' => ['復古'], 'category' => 'color', 'search' => 'vintage', 'rule' => 'vintage'],
            ['terms' => ['純淨'], 'category' => 'color', 'search' => 'pure clean', 'rule' => 'pure'],
            ['terms' => ['大膽'], 'category' => 'color', 'search' => 'bold', 'rule' => 'bold'],
            ['terms' => ['俏皮'], 'category' => 'color', 'search' => 'playful', 'rule' => 'playful'],
            ['terms' => ['療癒', '治癒'], 'category' => 'color', 'search' => 'soothing healing', 'rule' => 'healing'],

            // 功能性／複合條件
            ['terms' => ['悶熱'], 'category' => 'atmosphere', 'search' => 'humid heat', 'rule' => 'humid_heat'],
            ['terms' => ['壓抑', '壓迫'], 'category' => 'atmosphere', 'search' => 'oppressive', 'rule' => 'oppressive'],
            ['terms' => ['黑暗', '昏暗', '陰暗'], 'category' => 'color', 'search' => 'dark', 'rule' => 'dark'],
            ['terms' => ['鮮豔'], 'category' => 'color', 'search' => 'vivid', 'rule' => 'high_chroma'],
            ['terms' => ['低彩度', '低飽和'], 'category' => 'color', 'search' => 'muted', 'rule' => 'low_chroma'],
            ['terms' => ['高彩度', '高飽和'], 'category' => 'color', 'search' => 'vivid', 'rule' => 'high_chroma'],
            ['terms' => ['中性'], 'category' => 'color', 'search' => 'neutral', 'rule' => 'neutral'],
            ['terms' => ['低對比'], 'category' => 'color', 'search' => 'low contrast', 'rule' => 'low_contrast'],
            ['terms' => ['高對比'], 'category' => 'color', 'search' => 'high contrast', 'rule' => 'high_contrast'],
            ['terms' => ['輕盈'], 'category' => 'color', 'search' => 'light airy', 'rule' => 'light_weight'],
            ['terms' => ['厚重'], 'category' => 'color', 'search' => 'heavy', 'rule' => 'heavy'],
        ];

        $concepts = [];
        $seen = [];

        foreach ($patterns as $pattern) {
            foreach ($pattern['terms'] as $term) {
                $position = $this->utf8Stripos($input, $term);
                if ($position === false) {
                    continue;
                }

                $negative = $this->hasNegativeMarkerNear($input, $term);
                $category = $negative ? 'exclusion' : $pattern['category'];
                $priority = $negative ? 'exclude' : $this->detectPriority($input, $term);
                $key = $category . '|' . $pattern['search'];

                if (isset($seen[$key])) {
                    break;
                }
                $seen[$key] = true;

                $concepts[] = [
    'id' => 'concept_' . (count($concepts) + 1),

    'original_text' => $term,
    'normalized_label' => $term,
    'category' => $category,

    'search_term' => $pattern['search'],

    // fallback 沒有 AI 做更細的風格拆解，
    // 所以這裡先保持空陣列。
    'search_facets' => [
        'style_terms' => [],
        'theme_elements' => [],
        'visual_tags' => [],
    ],

    'color_rule' => $pattern['rule'],
    'priority' => $priority,

    'intensity' => $this->detectIntensity(
        $input,
        $term
    ),

    'confidence' => 0.72,

    // fallback 是 PHP 自己產生合法值，
    // 所以狀態直接視為 exact。
    'priority_status' => 'exact',
    'color_mapping_status' => 'exact',

    // 有固定 color_rule 才能進 ColorRuleEngine。
    'apply_to_anchor_rules' =>
        $pattern['rule'] !== 'none',

    // fallback 目前沒有 visual_tags，
    // 所以不做圖片視覺標籤篩選。
    'apply_to_visual_filter' => false,

    // 有固定規則就走 standard，
    // 沒有就只負責搜尋。
    'retrieval_mode' =>
        $pattern['rule'] !== 'none'
            ? 'standard'
            : 'search_only',
];
                break;
            }
        }

        if ($concepts === []) {
    $concepts[] = [
        'id' => 'concept_1',

        'original_text' => $input,
        'normalized_label' => $input,

        'category' => 'subject',

        'search_term' =>
            $this->cleanSearchTerm($input),

        'search_facets' => [
            'style_terms' => [],
            'theme_elements' => [],
            'visual_tags' => [],
        ],

        'color_rule' => 'none',

        'priority' => 'main',

        'intensity' => 1.0,

        'confidence' => 0.35,

        'priority_status' => 'exact',

        'color_mapping_status' => 'exact',

        'apply_to_anchor_rules' => false,

        'apply_to_visual_filter' => false,

        'retrieval_mode' => 'search_only',
    ];
}
        $conflicts = $this->detectRuleConflicts(
    $concepts
);
        return [
            'input' => $input,
            'summary' => '已將描述拆成可確認的主題、情境、氣氛、色彩與排除概念。',
            'overall_confidence' => 0.58,
            'source' => 'rules_fallback',
            'notice' => $notice,
            'conflict_detected' =>
                 $conflicts !== [],
            'conflicts' =>
                 $conflicts,
            'concepts' => $concepts,
        ];
    }

    private function detectPriority(string $input, string $term): string
    {
        $near = $this->nearText($input, $term, 5);
        if (preg_match('/主要|最重要|尤其/u', $near)) {
            return 'main';
        }
        if (preg_match('/稍微|有點|一點|些微/u', $near)) {
            return 'slight';
        }
        return 'secondary';
    }

    private function detectIntensity(string $input, string $term): float
    {
        $near = $this->nearText($input, $term, 5);
        if (preg_match('/極度/u', $near)) return 1.5;
        if (preg_match('/非常/u', $near)) return 1.4;
        if (preg_match('/強烈|主要/u', $near)) return 1.3;
        if (preg_match('/很/u', $near)) return 1.2;
        if (preg_match('/偏/u', $near)) return 0.85;
        if (preg_match('/有點/u', $near)) return 0.7;
        if (preg_match('/稍微/u', $near)) return 0.6;
        if (preg_match('/一點|些微/u', $near)) return 0.5;
        return 1.0;
    }

    private function hasNegativeMarkerNear(string $input, string $term): bool
    {
        return (bool) preg_match(
            '/(?:不要|不想要|避免|排除|不能太|不可以太|不要過度)[^，。；、]{0,8}' . preg_quote($term, '/') . '/u',
            $input
        );
    }

    private function nearText(string $input, string $term, int $radius): string
    {
        $position = $this->utf8Stripos($input, $term);
        if ($position === false) {
            return '';
        }

        if (!function_exists('mb_substr') || !function_exists('mb_strlen')) {
            return $input;
        }

        $start = max(0, $position - $radius);
        return mb_substr($input, $start, mb_strlen($term, 'UTF-8') + $radius * 2, 'UTF-8');
    }

    private function utf8Stripos(string $haystack, string $needle): int|false
    {
        if (function_exists('mb_stripos')) {
            return mb_stripos($haystack, $needle, 0, 'UTF-8');
        }

        $bytePosition = stripos($haystack, $needle);
        if ($bytePosition === false) {
            return false;
        }

        $prefix = substr($haystack, 0, $bytePosition);
        if (preg_match_all('/./us', $prefix, $matches) === false) {
            return $bytePosition;
        }

        return count($matches[0]);
    }

    private function cleanSearchTerm(string $value): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        $value = preg_replace('/[^\p{L}\p{N}\- ]+/u', '', $value) ?? '';

        $words = preg_split('/\s+/u', trim($value)) ?: [];
        return implode(' ', array_slice(array_filter($words), 0, 3));
    }

    private function clamp(float $value, float $min, float $max): float
    {
        return min($max, max($min, $value));
    }
}
