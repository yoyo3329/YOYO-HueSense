<?php

declare(strict_types=1);

/**
 * SearchPlanner
 *
 * 將 SemanticInterpreter 的概念拆成「核心主題 + 子風格 + 可觀察主題元素」的搜尋計畫。
 *
 * 重點：
 * - 不再只把同義 style term 重新排列成 Query 2 / 3。
 * - theme_elements 代表畫面中可實際出現的物件、場景、材質、服裝或時代訊號。
 * - 每條 query 都帶明確 query_family，後續 Validator 不需要再從字串猜語意家族。
 */
final class SearchPlanner
{
    /** @var array<string,float> */
    private const PRIORITY_MULTIPLIERS = [
        'main' => 1.35,
        'secondary' => 1.0,
        'slight' => 0.6,
        'exclude' => 0.0,
    ];

    /** @var string[] */
    private const ALLOWED_VISUAL_TAGS = [
        'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink',
        'warm', 'cool', 'dark', 'light', 'muted', 'vivid',
    ];

    /**
     * 舊版相容入口：沒有指定 branch 時視為 B。
     *
     * @param array<int,array<string,mixed>> $concepts
     * @return array<int,array<string,mixed>>
     */
    public function build(array $concepts): array
    {
        return $this->buildForBranch($concepts, [
            'code' => 'B',
            'role' => 'core_balance',
            'name' => '核心平衡',
            'target_profile' => [],
            'delta_from_base' => [],
            'semantic_direction' => [],
        ]);
    }

    /**
     * @param array<int,array<string,mixed>> $concepts
     * @param array<string,array<string,mixed>> $branches
     * @return array<string,array<string,mixed>>
     */
    public function buildBranches(array $concepts, array $branches): array
    {
        $result = [];

        foreach (['A', 'B', 'C'] as $code) {
            $branch = $branches[$code] ?? null;
            if (!is_array($branch)) {
                continue;
            }

            $branch['search_plan'] = $this->buildForBranch($concepts, $branch);
            $branch['visual_tags'] = $this->collectVisualTags($concepts, false);
            $branch['excluded_visual_tags'] = $this->collectVisualTags($concepts, true);
            $branch['theme_elements'] = $this->collectThemeElements($concepts);
            $result[$code] = $branch;
        }

        return $result;
    }

    /**
     * 每個 Branch 最多建立三條互補 query：
     * 1. core：保留原始主題，負責 recall。
     * 2. theme/style：主題 + branch 子風格 + 第一組具體主題元素。
     * 3. theme/context：主題/情境 + 不同元素 family + 第二視覺方向。
     *
     * @param array<int,array<string,mixed>> $concepts
     * @param array<string,mixed> $branch
     * @return array<int,array<string,mixed>>
     */
    public function buildForBranch(array $concepts, array $branch): array
    {
        $groups = $this->collectGroups($concepts);
        $branchCode = strtoupper(trim((string) ($branch['code'] ?? 'B')));
        if (!in_array($branchCode, ['A', 'B', 'C'], true)) {
            $branchCode = 'B';
        }

        $branchName = trim((string) ($branch['name'] ?? $branchCode)) ?: $branchCode;

        $subject = $groups['subject'][0] ?? null;
        $context = $groups['context'][0] ?? null;
        $atmosphere = $groups['atmosphere'][0] ?? null;
        $color = $groups['color'][0] ?? null;

        $anchor = $subject ?? $context ?? $atmosphere ?? $color;
        $styleItems = $this->collectStyleItems($groups);
        $semanticItems = $this->collectBranchSemanticItems($branch);
        $themeElements = $this->collectThemeElementItems($groups);
        $branchHints = $this->buildBranchHints($branch);

        // 讓 A/B/C 從不同位置開始挑元素，但仍要求 Query 2/3 使用不同 family。
        $rotatedThemeElements = $this->rotateItemsForBranch($themeElements, $branchCode);
        [$themeOne, $themeTwo] = $this->pickDistinctThemeElements($rotatedThemeElements);

        $primaryStyle = $this->pickPrimaryStyleItem($branchCode, $semanticItems, $styleItems);
        $secondaryStyle = $this->pickSecondaryStyleItem($branchCode, $semanticItems, $styleItems, $primaryStyle);

        $candidates = [];

        if ($anchor !== null) {
            $candidates[] = $this->makeCandidate(
                [$subject, $context, $atmosphere],
                '核心主題與情境',
                'core',
                'core',
                []
            );

            $familyOne = $this->familyForThemeOrStyle($themeOne, $primaryStyle, 'style_primary');
            $candidates[] = $this->makeCandidate(
                [
                    $subject ?? $context ?? $atmosphere,
                    $primaryStyle,
                    $themeOne,
                    $branchHints[0] ?? null,
                ],
                $branchName . '｜主題元素探索',
                $familyOne,
                'theme_element',
                $themeOne !== null ? [$themeOne] : []
            );

            $familyTwo = $this->familyForThemeOrStyle($themeTwo, $secondaryStyle, 'style_secondary');
            if ($familyTwo === $familyOne) {
                $familyTwo .= '_alt';
            }

            $candidates[] = $this->makeCandidate(
                [
                    $context ?? $subject,
                    $themeTwo,
                    $secondaryStyle,
                    $branchHints[1] ?? null,
                ],
                $branchName . '｜第二元素／場景方向',
                $familyTwo,
                'theme_context',
                $themeTwo !== null ? [$themeTwo] : []
            );
        }

        // 無 anchor 時才使用全部可用資料救援。
        if ($candidates === [] || count(array_filter($candidates)) === 0) {
            $fallback = [];
            foreach (['subject', 'context', 'atmosphere', 'color'] as $category) {
                foreach ($groups[$category] as $item) {
                    $fallback[] = $item;
                }
            }
            foreach ($themeElements as $item) {
                $fallback[] = $item;
            }
            foreach ($semanticItems as $item) {
                $fallback[] = $item;
            }
            foreach ($styleItems as $item) {
                $fallback[] = $item;
            }

            $candidates = [
                $this->makeCandidate(
                    array_slice($fallback, 0, 4),
                    $branchName . '｜主要搜尋線索',
                    'fallback',
                    'fallback',
                    []
                ),
            ];
        }

        $plans = [];
        $seenQueries = [];
        $seenFamilies = [];

        foreach ($candidates as $candidate) {
            if (!is_array($candidate) || ($candidate['query'] ?? '') === '') {
                continue;
            }

            $queryKey = strtolower((string) $candidate['query']);
            if (isset($seenQueries[$queryKey])) {
                continue;
            }

            $family = (string) ($candidate['query_family'] ?? '');
            // 非 core query 如果 family 重複，仍保留第一條，避免「兩條字面不同但本質相同」。
            if ($family !== '' && $family !== 'core' && isset($seenFamilies[$family])) {
                continue;
            }

            $seenQueries[$queryKey] = true;
            if ($family !== '') {
                $seenFamilies[$family] = true;
            }
            $plans[] = $candidate;
        }

        // 如果因 family 去重後只剩 1 條，補一條不同的具體元素 query。
        if (count($plans) < 2 && isset($themeElements[0])) {
            $extra = $this->makeCandidate(
                [$anchor, $themeElements[0]],
                $branchName . '｜具體元素補充',
                'element:' . $this->normalizeFamily((string) ($themeElements[0]['family'] ?? 'visual_element')),
                'theme_element',
                [$themeElements[0]]
            );
            if (is_array($extra) && !isset($seenQueries[strtolower($extra['query'])])) {
                $plans[] = $extra;
            }
        }

        $plans = array_slice($plans, 0, 3);
        $totalWeight = array_sum(array_column($plans, 'raw_weight')) ?: 1.0;
        $positiveVisualTags = $this->collectVisualTags($concepts, false);
        $excludedVisualTags = $this->collectVisualTags($concepts, true);

        return array_map(
            static function (array $plan, int $index) use (
                $branchCode,
                $branchName,
                $positiveVisualTags,
                $excludedVisualTags,
                $totalWeight
            ): array {
                return [
                    'id' => $branchCode . '_query_' . ($index + 1),
                    'branch_code' => $branchCode,
                    'branch_name' => $branchName,
                    'query' => $plan['query'],
                    'label' => $plan['label'],
                    'query_family' => $plan['query_family'],
                    'exploration_type' => $plan['exploration_type'],
                    'weight' => round($plan['raw_weight'] / $totalWeight, 4),
                    'concepts' => $plan['concepts'],
                    'branch_hints' => $plan['branch_hints'],
                    'theme_elements' => $plan['theme_elements'],
                    'visual_tags' => $positiveVisualTags,
                    'excluded_visual_tags' => $excludedVisualTags,
                ];
            },
            $plans,
            array_keys($plans)
        );
    }

    /**
     * @param array<int,array<string,mixed>> $concepts
     * @return array<string,array<int,array<string,mixed>>>
     */
    private function collectGroups(array $concepts): array
    {
        $groups = [
            'subject' => [],
            'context' => [],
            'atmosphere' => [],
            'color' => [],
        ];

        foreach ($concepts as $concept) {
            if (!is_array($concept)) {
                continue;
            }

            $category = strtolower(trim((string) ($concept['category'] ?? 'atmosphere')));
            $priority = strtolower(trim((string) ($concept['priority'] ?? 'secondary')));
            if ($category === 'exclusion' || $priority === 'exclude' || !isset($groups[$category])) {
                continue;
            }

            $term = $this->cleanTerm((string) ($concept['search_term'] ?? ''));
            $facets = is_array($concept['search_facets'] ?? null) ? $concept['search_facets'] : [];
            $styleTerms = $this->normalizeStyleTerms($facets['style_terms'] ?? []);
            $themeElements = $this->normalizeThemeElements($facets['theme_elements'] ?? []);

            if ($term === '' && $styleTerms === [] && $themeElements === []) {
                continue;
            }

            $weight = (self::PRIORITY_MULTIPLIERS[$priority] ?? 1.0)
                * $this->clamp((float) ($concept['intensity'] ?? 1.0), 0.5, 1.5);

            $groups[$category][] = [
                'term' => $term,
                'weight' => $weight,
                'concept' => (string) ($concept['original_text'] ?? $term),
                'style_terms' => $styleTerms,
                'theme_elements' => $themeElements,
                'source' => 'concept',
            ];
        }

        foreach ($groups as &$items) {
            usort($items, static fn(array $a, array $b): int => $b['weight'] <=> $a['weight']);
            $items = $this->dedupeTerms($items);
        }
        unset($items);

        return $groups;
    }

    /** @return array<int,array<string,mixed>> */
    private function collectStyleItems(array $groups): array
    {
        $items = [];
        $seen = [];
        foreach (['subject', 'context', 'atmosphere', 'color'] as $category) {
            foreach ($groups[$category] ?? [] as $conceptItem) {
                foreach (($conceptItem['style_terms'] ?? []) as $styleTerm) {
                    $term = $this->cleanTerm((string) $styleTerm);
                    if ($term === '') {
                        continue;
                    }
                    $key = strtolower($term);
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $items[] = [
                        'term' => $term,
                        'weight' => (float) ($conceptItem['weight'] ?? 1.0),
                        'concept' => (string) ($conceptItem['concept'] ?? $term),
                        'source' => 'style',
                    ];
                }
            }
        }
        usort($items, static fn(array $a, array $b): int => $b['weight'] <=> $a['weight']);
        return array_slice($items, 0, 8);
    }

    /** @return array<int,array<string,mixed>> */
    private function collectThemeElementItems(array $groups): array
    {
        $items = [];
        $seen = [];
        foreach (['subject', 'context', 'atmosphere', 'color'] as $category) {
            foreach ($groups[$category] ?? [] as $conceptItem) {
                foreach (($conceptItem['theme_elements'] ?? []) as $element) {
                    if (!is_array($element)) {
                        continue;
                    }
                    $term = $this->cleanTerm((string) ($element['term'] ?? ''));
                    if ($term === '') {
                        continue;
                    }
                    $family = $this->normalizeFamily((string) ($element['family'] ?? 'visual_element'));
                    $key = strtolower($family . '|' . $term);
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $items[] = [
                        'term' => $term,
                        'family' => $family,
                        'weight' => (float) ($conceptItem['weight'] ?? 1.0) * 1.10,
                        'concept' => (string) ($conceptItem['concept'] ?? $term),
                        'source' => 'theme_element',
                    ];
                }
            }
        }
        usort($items, static fn(array $a, array $b): int => $b['weight'] <=> $a['weight']);
        return array_slice($items, 0, 16);
    }

    /**
     * @param array<int,array<string,mixed>> $concepts
     * @return array<int,array{term:string,family:string}>
     */
    private function collectThemeElements(array $concepts): array
    {
        $groups = $this->collectGroups($concepts);
        return array_map(
            static fn(array $item): array => [
                'term' => (string) ($item['term'] ?? ''),
                'family' => (string) ($item['family'] ?? 'visual_element'),
            ],
            $this->collectThemeElementItems($groups)
        );
    }

    /** @return array<int,array<string,mixed>> */
    private function collectBranchSemanticItems(array $branch): array
    {
        $direction = is_array($branch['semantic_direction'] ?? null)
            ? $branch['semantic_direction']
            : [];
        $rawTerms = is_array($direction['terms'] ?? null) ? $direction['terms'] : [];
        $items = [];
        $seen = [];

        foreach ($rawTerms as $rawTerm) {
            $term = $this->cleanTerm((string) $rawTerm);
            if ($term === '') {
                continue;
            }
            $key = strtolower($term);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $items[] = [
                'term' => $term,
                'weight' => 1.20,
                'concept' => $term,
                'source' => 'semantic_direction',
            ];
            if (count($items) >= 3) {
                break;
            }
        }
        return $items;
    }

    private function pickPrimaryStyleItem(string $branchCode, array $semanticItems, array $styleItems): ?array
    {
        if (isset($semanticItems[0])) {
            return $semanticItems[0];
        }
        return match ($branchCode) {
            'A' => $styleItems[0] ?? null,
            'B' => $styleItems[1] ?? $styleItems[0] ?? null,
            'C' => $styleItems[2] ?? $styleItems[1] ?? $styleItems[0] ?? null,
            default => $styleItems[0] ?? null,
        };
    }

    private function pickSecondaryStyleItem(
        string $branchCode,
        array $semanticItems,
        array $styleItems,
        ?array $primaryStyle
    ): ?array {
        $primaryKey = strtolower((string) ($primaryStyle['term'] ?? ''));
        $candidates = array_merge(array_slice($semanticItems, 1), $styleItems);

        // 讓不同 branch 從不同位置嘗試，避免全部拿到同一第二詞。
        $offset = match ($branchCode) {
            'A' => 0,
            'B' => 1,
            'C' => 2,
            default => 0,
        };
        if ($candidates !== []) {
            $candidates = array_merge(
                array_slice($candidates, $offset),
                array_slice($candidates, 0, $offset)
            );
        }

        foreach ($candidates as $item) {
            if (!is_array($item)) {
                continue;
            }
            $term = strtolower((string) ($item['term'] ?? ''));
            if ($term !== '' && $term !== $primaryKey) {
                return $item;
            }
        }
        return null;
    }

    /** @return array<int,array<string,mixed>> */
    private function buildBranchHints(array $branch): array
    {
        $delta = is_array($branch['delta_from_base'] ?? null) ? $branch['delta_from_base'] : [];
        $branchName = trim((string) ($branch['name'] ?? $branch['code'] ?? 'branch'));
        $hints = [];

        $add = static function (array &$target, string $term, float $weight, string $concept): void {
            foreach ($target as $existing) {
                if (strtolower((string) ($existing['term'] ?? '')) === strtolower($term)) {
                    return;
                }
            }
            $target[] = [
                'term' => $term,
                'weight' => $weight,
                'concept' => $concept,
                'source' => 'branch',
            ];
        };

        $dLightness = (float) ($delta['meanLightness'] ?? 0.0);
        if ($dLightness >= 0.05) {
            $add($hints, 'soft light', 0.85, $branchName);
        } elseif ($dLightness <= -0.05) {
            $add($hints, 'low key', 0.85, $branchName);
        }

        $dContrast = (float) ($delta['contrast'] ?? 0.0);
        if ($dContrast >= 0.05) {
            $add($hints, 'dramatic contrast', 0.80, $branchName);
        } elseif ($dContrast <= -0.05) {
            $add($hints, 'soft contrast', 0.80, $branchName);
        }

        $dWeight = (float) ($delta['visualWeight'] ?? 0.0);
        if ($dWeight >= 0.05) {
            $add($hints, 'moody atmosphere', 0.75, $branchName);
        } elseif ($dWeight <= -0.05) {
            $add($hints, 'airy atmosphere', 0.75, $branchName);
        }

        return array_slice($hints, 0, 2);
    }

    /**
     * @param array<int,array<string,mixed>> $items
     * @return array<int,array<string,mixed>>
     */
    private function rotateItemsForBranch(array $items, string $branchCode): array
    {
        if ($items === []) {
            return [];
        }
        $offset = match ($branchCode) {
            'A' => 0,
            'B' => 1,
            'C' => 2,
            default => 0,
        } % count($items);
        return array_merge(array_slice($items, $offset), array_slice($items, 0, $offset));
    }

    /** @return array{0:?array,1:?array} */
    private function pickDistinctThemeElements(array $items): array
    {
        $first = $items[0] ?? null;
        if (!is_array($first)) {
            return [null, null];
        }

        $firstFamily = (string) ($first['family'] ?? 'visual_element');
        $second = null;
        foreach (array_slice($items, 1) as $item) {
            if (!is_array($item)) {
                continue;
            }
            if ((string) ($item['family'] ?? 'visual_element') !== $firstFamily) {
                $second = $item;
                break;
            }
        }
        if ($second === null) {
            $second = $items[1] ?? null;
        }
        return [$first, is_array($second) ? $second : null];
    }

    private function familyForThemeOrStyle(?array $theme, ?array $style, string $fallback): string
    {
        if (is_array($theme)) {
            return 'element:' . $this->normalizeFamily((string) ($theme['family'] ?? 'visual_element'));
        }
        if (is_array($style)) {
            return 'style:' . $this->normalizeFamily((string) ($style['term'] ?? $fallback));
        }
        return $fallback;
    }

    /**
     * @param array<int,array<string,mixed>|null> $items
     * @param array<int,array<string,mixed>> $themeElements
     * @return array<string,mixed>|null
     */
    private function makeCandidate(
        array $items,
        string $label,
        string $queryFamily,
        string $explorationType,
        array $themeElements
    ): ?array {
        $fragments = [];
        $concepts = [];
        $weights = [];
        $branchHints = [];
        $seenFragments = [];

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $term = $this->cleanTerm((string) ($item['term'] ?? ''));
            if ($term === '') {
                continue;
            }
            $key = strtolower($term);
            if (isset($seenFragments[$key])) {
                continue;
            }
            $seenFragments[$key] = true;
            $fragments[] = $term;
            $weights[] = (float) ($item['weight'] ?? 1.0);

            $concept = trim((string) ($item['concept'] ?? $term));
            if ($concept !== '' && !in_array($concept, $concepts, true)) {
                $concepts[] = $concept;
            }
            if (($item['source'] ?? '') === 'branch') {
                $branchHints[] = $term;
            }
            if (count($fragments) >= 4) {
                break;
            }
        }

        $query = $this->mergeQueryFragments($fragments);
        if ($query === '') {
            return null;
        }

        $normalizedThemeElements = [];
        foreach ($themeElements as $item) {
            if (!is_array($item)) {
                continue;
            }
            $term = $this->cleanTerm((string) ($item['term'] ?? ''));
            if ($term === '') {
                continue;
            }
            $normalizedThemeElements[] = [
                'term' => $term,
                'family' => $this->normalizeFamily((string) ($item['family'] ?? 'visual_element')),
            ];
        }

        return [
            'query' => $query,
            'label' => $label,
            'query_family' => $this->normalizeFamily($queryFamily),
            'exploration_type' => $explorationType,
            'raw_weight' => $weights !== [] ? array_sum($weights) / count($weights) : 1.0,
            'concepts' => $concepts,
            'branch_hints' => array_values(array_unique($branchHints)),
            'theme_elements' => $normalizedThemeElements,
        ];
    }

    /**
     * 合併 query 片段時做 token 級去重。
     * 例如 y2k + classic y2k 不再變成 "y2k classic y2k"。
     *
     * @param string[] $fragments
     */
    private function mergeQueryFragments(array $fragments): string
    {
        $words = [];
        $seen = [];
        foreach ($fragments as $fragment) {
            foreach (preg_split('/\s+/u', trim($fragment)) ?: [] as $word) {
                $key = strtolower($word);
                if ($key === '' || isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $words[] = $word;
                if (count($words) >= 10) {
                    break 2;
                }
            }
        }
        return implode(' ', $words);
    }

    /** @return string[] */
    private function collectVisualTags(array $concepts, bool $excluded): array
    {
        $result = [];
        $seen = [];
        foreach ($concepts as $concept) {
            if (!is_array($concept)) {
                continue;
            }
            $isExcluded = (($concept['category'] ?? '') === 'exclusion')
                || (($concept['priority'] ?? '') === 'exclude');
            if ($isExcluded !== $excluded) {
                continue;
            }
            $facets = is_array($concept['search_facets'] ?? null) ? $concept['search_facets'] : [];
            $tags = is_array($facets['visual_tags'] ?? null) ? $facets['visual_tags'] : [];
            foreach ($tags as $tag) {
                $tag = strtolower(trim((string) $tag));
                if (!in_array($tag, self::ALLOWED_VISUAL_TAGS, true) || isset($seen[$tag])) {
                    continue;
                }
                $seen[$tag] = true;
                $result[] = $tag;
            }
        }
        return array_slice($result, 0, 6);
    }

    /** @return string[] */
    private function normalizeStyleTerms(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $result = [];
        $seen = [];
        foreach ($value as $term) {
            $clean = $this->cleanTerm((string) $term);
            if ($clean === '') {
                continue;
            }
            $key = strtolower($clean);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $result[] = $clean;
            if (count($result) >= 4) {
                break;
            }
        }
        return $result;
    }

    /** @return array<int,array{term:string,family:string}> */
    private function normalizeThemeElements(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $result = [];
        $seen = [];
        foreach ($value as $element) {
            if (is_string($element)) {
                $term = $this->cleanTerm($element);
                $family = 'visual_element';
            } elseif (is_array($element)) {
                $term = $this->cleanTerm((string) ($element['term'] ?? ''));
                $family = $this->normalizeFamily((string) ($element['family'] ?? 'visual_element'));
            } else {
                continue;
            }
            if ($term === '') {
                continue;
            }
            $key = strtolower($family . '|' . $term);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $result[] = ['term' => $term, 'family' => $family];
            if (count($result) >= 8) {
                break;
            }
        }
        return $result;
    }

    /** @param array<int,array<string,mixed>> $items */
    private function dedupeTerms(array $items): array
    {
        $seen = [];
        $result = [];
        foreach ($items as $item) {
            $term = strtolower((string) ($item['term'] ?? ''));
            if ($term === '') {
                $result[] = $item;
                continue;
            }
            if (isset($seen[$term])) {
                continue;
            }
            $seen[$term] = true;
            $result[] = $item;
        }
        return $result;
    }

    /** 每個語意片段最多四個單字。 */
    private function cleanTerm(string $value): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        $value = preg_replace('/[^\p{L}\p{N}\- ]+/u', '', $value) ?? '';
        $words = preg_split('/\s+/u', trim($value)) ?: [];
        return implode(' ', array_slice(array_filter($words), 0, 4));
    }

    private function normalizeFamily(string $value): string
    {
        $value = strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9:_\- ]+/', '', $value) ?? '';
        $value = preg_replace('/[\s\-]+/', '_', $value) ?? '';
        return trim($value, '_') ?: 'visual_element';
    }

    private function clamp(float $value, float $min, float $max): float
    {
        return min($max, max($min, $value));
    }
}
