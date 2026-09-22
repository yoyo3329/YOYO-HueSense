<?php

declare(strict_types=1);

/**
 * ConceptSanitizer
 *
 * 統一清理 SemanticInterpreter / 前端傳入的 concepts。
 *
 * 使用位置：
 * - api/derive.php
 * - api/search.php
 *
 * 目的：
 * 1. 統一 category / priority / color_rule
 * 2. 清理 search_term
 * 3. 清理 search_facets
 * 4. 重算流程旗標
 * 5. 避免 derive.php 與 search.php 各維護一份 sanitizer
 */
final class ConceptSanitizer
{
    /**
     * 合法 concept category。
     */
    private const ALLOWED_CATEGORIES = [
        'subject',
        'context',
        'atmosphere',
        'color',
        'exclusion',
    ];

    /**
     * 合法 priority。
     */
    private const ALLOWED_PRIORITIES = [
        'main',
        'secondary',
        'slight',
        'exclude',
    ];

    /**
     * SemanticInterpreter 狀態欄位。
     */
    private const ALLOWED_STATUSES = [
        'exact',
        'normalized',
        'unmapped',
    ];

    /**
     * 可交給後續視覺分析使用的 visual tags。
     */
    private const ALLOWED_VISUAL_TAGS = [
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

    /**
     * 必須與 SemanticInterpreter.php
     * 的 COLOR_RULE_IDS 保持一致。
     */
    private const ALLOWED_COLOR_RULES = [
        'none',

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

    /**
     * 清理 concepts。
     *
     * @param mixed $rawConcepts
     * @return array<int,array<string,mixed>>
     */
    public function sanitize(
        mixed $rawConcepts
    ): array {
        if (!is_array($rawConcepts)) {
            return [];
        }

        $result = [];
        $seen = [];

        foreach (
            $rawConcepts
            as $index => $concept
        ) {
            if (!is_array($concept)) {
                continue;
            }

            /*
             * =================================
             * 1. Category
             * =================================
             */
            $category =
                strtolower(
                    trim(
                        (string) (
                            $concept['category']
                            ?? 'atmosphere'
                        )
                    )
                );

            if (
                !in_array(
                    $category,
                    self::ALLOWED_CATEGORIES,
                    true
                )
            ) {
                $category =
                    'atmosphere';
            }

            /*
             * =================================
             * 2. Priority
             * =================================
             */
            $rawPriority =
                strtolower(
                    trim(
                        (string) (
                            $concept['priority']
                            ?? 'secondary'
                        )
                    )
                );

            $priorityWasValid =
                in_array(
                    $rawPriority,
                    self::ALLOWED_PRIORITIES,
                    true
                );

            $priority =
                $priorityWasValid
                    ? $rawPriority
                    : 'secondary';

            /*
             * exclusion 統一。
             *
             * 只要 category 是 exclusion
             * 或 priority 是 exclude，
             * 就強制兩者一致。
             */
            if (
                $category === 'exclusion'
                || $priority === 'exclude'
            ) {
                $category =
                    'exclusion';

                $priority =
                    'exclude';
            }

            /*
             * =================================
             * 3. 基本文字
             * =================================
             */
            $searchTerm =
                $this->cleanSearchTerm(
                    (string) (
                        $concept['search_term']
                        ?? ''
                    )
                );

            $originalText =
                trim(
                    (string) (
                        $concept['original_text']
                        ?? ''
                    )
                );

            $normalizedLabel =
                trim(
                    (string) (
                        $concept['normalized_label']
                        ?? $originalText
                    )
                );

            /*
             * =================================
             * 4. Search Facets
             * =================================
             */
            $rawFacets =
                is_array(
                    $concept['search_facets']
                    ?? null
                )
                    ? $concept['search_facets']
                    : [];

            /*
             * ---------------------------------
             * style_terms
             * ---------------------------------
             *
             * 最多保留 3 個。
             */
            $styleTerms = [];
            $seenStyleTerms = [];

            $rawStyleTerms =
                $rawFacets['style_terms']
                ?? [];

            if (is_array($rawStyleTerms)) {
                foreach (
                    $rawStyleTerms
                    as $styleTerm
                ) {
                    $cleaned =
                        $this->cleanSearchTerm(
                            (string) $styleTerm
                        );

                    if ($cleaned === '') {
                        continue;
                    }

                    $key =
                        strtolower(
                            $cleaned
                        );

                    if (
                        isset(
                            $seenStyleTerms[
                                $key
                            ]
                        )
                    ) {
                        continue;
                    }

                    $seenStyleTerms[
                        $key
                    ] = true;

                    $styleTerms[] =
                        $cleaned;

                    if (
                        count(
                            $styleTerms
                        ) >= 3
                    ) {
                        break;
                    }
                }
            }

            /*
             * ---------------------------------
             * theme_elements
             * ---------------------------------
             *
             * 具體可觀察的主題元素，最多保留 8 個。
             * 每個元素包含 term + semantic family。
             */
            $themeElements = [];
            $seenThemeElements = [];
            $rawThemeElements = $rawFacets['theme_elements'] ?? [];

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

                    if ($term === '' || $this->isLowInformationThemeElement($term)) {
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
             * ---------------------------------
             * visual_tags
             * ---------------------------------
             *
             * 最多保留 3 個。
             */
            $visualTags = [];
            $seenVisualTags = [];

            $rawVisualTags =
                $rawFacets['visual_tags']
                ?? [];

            if (is_array($rawVisualTags)) {
                foreach (
                    $rawVisualTags
                    as $tag
                ) {
                    $tag =
                        strtolower(
                            trim(
                                (string) $tag
                            )
                        );

                    if (
                        !in_array(
                            $tag,
                            self::ALLOWED_VISUAL_TAGS,
                            true
                        )
                    ) {
                        continue;
                    }

                    if (
                        isset(
                            $seenVisualTags[
                                $tag
                            ]
                        )
                    ) {
                        continue;
                    }

                    $seenVisualTags[
                        $tag
                    ] = true;

                    $visualTags[] =
                        $tag;

                    if (
                        count(
                            $visualTags
                        ) >= 3
                    ) {
                        break;
                    }
                }
            }

            /*
             * 完全沒有可使用資訊，
             * 才把這個 concept 丟掉。
             *
             * 不可以只檢查 search_term，
             * 因為有些 concept 可能只有：
             *
             * style_terms
             * visual_tags
             */
            if (
                $searchTerm === ''
                && $originalText === ''
                && $styleTerms === []
                && $themeElements === []
                && $visualTags === []
            ) {
                continue;
            }

            /*
             * =================================
             * 5. Color Rule
             * =================================
             */
            $rawColorRule =
                strtolower(
                    trim(
                        (string) (
                            $concept['color_rule']
                            ?? 'none'
                        )
                    )
                );

            /*
             * color_rule 只允許：
             *
             * a-z
             * _
             */
            $rawColorRule =
                preg_replace(
                    '/[^a-z_]/',
                    '',
                    $rawColorRule
                )
                ?: 'none';

            $colorRuleWasValid =
                in_array(
                    $rawColorRule,
                    self::ALLOWED_COLOR_RULES,
                    true
                );

            /*
             * 不合法就回 none，
             * 不自行猜測。
             */
            $colorRule =
                $colorRuleWasValid
                    ? $rawColorRule
                    : 'none';

            /*
             * =================================
             * 6. Priority Status
             * =================================
             */
            $priorityStatus =
                strtolower(
                    trim(
                        (string) (
                            $concept[
                                'priority_status'
                            ]
                            ?? ''
                        )
                    )
                );

            if (
                !in_array(
                    $priorityStatus,
                    self::ALLOWED_STATUSES,
                    true
                )
            ) {
                $priorityStatus =
                    $priorityWasValid
                        ? 'exact'
                        : 'unmapped';
            }

            /*
             * =================================
             * 7. Color Mapping Status
             * =================================
             */
            $colorMappingStatus =
                strtolower(
                    trim(
                        (string) (
                            $concept[
                                'color_mapping_status'
                            ]
                            ?? ''
                        )
                    )
                );

            if (
                !in_array(
                    $colorMappingStatus,
                    self::ALLOWED_STATUSES,
                    true
                )
            ) {
                $colorMappingStatus =
                    $colorRuleWasValid
                        ? 'exact'
                        : 'unmapped';
            }

            /*
             * =================================
             * 8. 重算後續流程旗標
             * =================================
             *
             * 不直接相信前端傳入：
             *
             * apply_to_anchor_rules
             * apply_to_visual_filter
             * retrieval_mode
             *
             * 由 Sanitizer 重新計算。
             */
            $applyToAnchorRules =
                $colorRule !== 'none'
                && $colorMappingStatus
                    !== 'unmapped';

            $applyToVisualFilter =
                $visualTags !== [];

            if ($applyToAnchorRules) {
                $retrievalMode =
                    'standard';

            } elseif ($applyToVisualFilter) {
                $retrievalMode =
                    'dual_track';

            } else {
                $retrievalMode =
                    'search_only';
            }

            /*
             * =================================
             * 9. Concept 去重
             * =================================
             */
            $dedupeValue =
                $searchTerm
                ?: (
                    $normalizedLabel
                    ?: $originalText
                );

            $dedupeKey =
                strtolower(
                    $category
                    . '|'
                    . $dedupeValue
                );

            if (
                isset(
                    $seen[
                        $dedupeKey
                    ]
                )
            ) {
                continue;
            }

            $seen[
                $dedupeKey
            ] = true;

            /*
             * =================================
             * 10. 最終輸出 Concept
             * =================================
             */
            $sanitizedConcept = [
                'id' =>
                    (string) (
                        $concept['id']
                        ?? 'concept_'
                        . ($index + 1)
                    ),

                'original_text' =>
                    $originalText
                    ?: $normalizedLabel,

                'normalized_label' =>
                    $normalizedLabel
                    ?: $originalText,

                'category' =>
                    $category,

                'search_term' =>
                    $searchTerm,

                /*
                 * SearchPlanner
                 * 與後續內容驗證會用到。
                 */
                'search_facets' => [
                    'style_terms' =>
                        $styleTerms,

                    'theme_elements' =>
                        $themeElements,

                    'visual_tags' =>
                        $visualTags,
                ],

                'color_rule' =>
                    $colorRule,

                'priority' =>
                    $priority,

                /*
                 * intensity：
                 * 限制於 0.5 ～ 1.5。
                 */
                'intensity' =>
                    min(
                        1.5,
                        max(
                            0.5,
                            (float) (
                                $concept['intensity']
                                ?? 1.0
                            )
                        )
                    ),

                /*
                 * confidence：
                 * 限制於 0 ～ 1。
                 */
                'confidence' =>
                    min(
                        1.0,
                        max(
                            0.0,
                            (float) (
                                $concept['confidence']
                                ?? 0.7
                            )
                        )
                    ),

                'priority_status' =>
                    $priorityStatus,

                'color_mapping_status' =>
                    $colorMappingStatus,

                'apply_to_anchor_rules' =>
                    $applyToAnchorRules,

                'apply_to_visual_filter' =>
                    $applyToVisualFilter,

                'retrieval_mode' =>
                    $retrievalMode,
            ];

            /*
             * =================================
             * 11. Debug 原始值
             * =================================
             */
            if (
                array_key_exists(
                    'raw_priority',
                    $concept
                )
            ) {
                $sanitizedConcept[
                    'raw_priority'
                ] =
                    trim(
                        (string) (
                            $concept[
                                'raw_priority'
                            ]
                        )
                    );
            }

            if (
                array_key_exists(
                    'raw_color_rule',
                    $concept
                )
            ) {
                $sanitizedConcept[
                    'raw_color_rule'
                ] =
                    trim(
                        (string) (
                            $concept[
                                'raw_color_rule'
                            ]
                        )
                    );
            }

            $result[] =
                $sanitizedConcept;
        }

        return $result;
    }

    /**
     * 避免 AI 把抽象風格字本身誤當成「看得見的主題元素」。
     * 真正元素應該是物件、服裝、材質、建築、活動或具體場景。
     */
    private function isLowInformationThemeElement(string $term): bool
    {
        $normalized = strtolower(trim($term));
        $generic = [
            'style', 'aesthetic', 'vibe', 'visual', 'scene',
            'retro', 'classic', 'modern', 'vintage', 'y2k',
            'dark', 'light', 'colorful', 'bright', 'moody',
            'warm', 'cool', 'soft', 'dramatic', 'minimal',
        ];

        return in_array($normalized, $generic, true);
    }

    /**
     * 清理圖庫搜尋詞。
     *
     * 規則：
     * - 合併多餘空白
     * - 移除不必要符號
     * - 保留 Unicode 文字、數字、連字號
     * - 最多保留 3 個詞
     */
    private function cleanSearchTerm(
        string $value
    ): string {
        $value =
            trim(
                preg_replace(
                    '/\s+/u',
                    ' ',
                    $value
                )
                ?? ''
            );

        $value =
            preg_replace(
                '/[^\p{L}\p{N}\- ]+/u',
                '',
                $value
            )
            ?? '';

        $words =
            preg_split(
                '/\s+/u',
                trim($value)
            )
            ?: [];

        $words =
            array_values(
                array_filter(
                    $words,
                    static fn (
                        string $word
                    ): bool =>
                        $word !== ''
                )
            );

        return implode(
            ' ',
            array_slice(
                $words,
                0,
                3
            )
        );
    }
}
