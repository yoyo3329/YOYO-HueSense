<?php

declare(strict_types=1);

/**
 * ContentSemanticValidator v3
 *
 * 職責只有「候選內容的初步可信度」，不再把 metadata 當成圖片真相。
 *
 * 三級 Gate：
 * - PASS：文字／主題元素證據明確。
 * - CANDIDATE：搜尋來源合理，但 metadata 不足；保留給後續像素／視覺分析。
 * - REJECT：有明確排除命中，或只有非常弱的 core retrieval 且沒有任何主題元素／語意支持。
 */
final class ContentSemanticValidator
{
    /** @var string[] */
    private const GENERIC_SUPPORT_TOKENS = [
        'style', 'aesthetic', 'image', 'photo', 'visual', 'scene', 'look', 'vibe', 'vibes',
        'classic', 'colorful', 'dark', 'light', 'chrome', 'retro', 'modern', 'vintage',
        'warm', 'cool', 'soft', 'bright', 'moody', 'dramatic', 'beautiful', 'art', 'design',
    ];

    /**
     * @param array<string,mixed> $photo
     * @param array<int,array<string,mixed>> $concepts
     * @param array<string,mixed> $retrievalContext
     * @return array<string,mixed>
     */
    public function validate(array $photo, array $concepts, array $retrievalContext = []): array
    {
        $metadata = $this->buildPhotoMetadata($photo);
        $required = [];
        $preferred = [];
        $excluded = [];

        foreach ($concepts as $concept) {
            if (!is_array($concept)) {
                continue;
            }

            $category = strtolower(trim((string) ($concept['category'] ?? '')));
            $priority = strtolower(trim((string) ($concept['priority'] ?? 'secondary')));

            // 顏色由 ToneAnalyzer 處理；不把「粉紅、深色」當內容語意證據。
            if ($category === 'color') {
                continue;
            }

            $termSet = $this->collectConceptTerms($concept);
            if ($termSet['primary'] === [] && $termSet['support'] === [] && $termSet['theme_elements'] === []) {
                continue;
            }

            $group = ['concept' => $concept, 'terms' => $termSet];
            if ($category === 'exclusion' || $priority === 'exclude') {
                $excluded[] = $group;
            } elseif ($priority === 'main') {
                $required[] = $group;
            } else {
                $preferred[] = $group;
            }
        }

        $requiredResults = $this->evaluateGroups($metadata, $required, true);
        $preferredResults = $this->evaluateGroups($metadata, $preferred, false);
        $excludedResults = $this->evaluateGroups($metadata, $excluded, false, true);

        $requiredCount = count($requiredResults);
        $requiredMatchedCount = count(array_filter(
            $requiredResults,
            static fn(array $item): bool => ($item['primary_matched'] ?? false) === true
        ));

        $requiredScore = $requiredCount > 0
            ? array_sum(array_map(
                static fn(array $item): float => (float) ($item['match_strength'] ?? 0),
                $requiredResults
            )) / $requiredCount
            : 1.0;

        $preferredScore = $preferredResults !== []
            ? array_sum(array_map(
                static fn(array $item): float => (float) ($item['match_strength'] ?? 0),
                $preferredResults
            )) / count($preferredResults)
            : 0.5;

        $hasExcludedMatch = count(array_filter(
            $excludedResults,
            static fn(array $item): bool => ($item['primary_matched'] ?? false) === true
        )) > 0;

        $metadataEvidenceScore = $requiredCount > 0
            ? $requiredScore
            : $preferredScore;

        $retrievalEvidence = $this->calculateRetrievalEvidence($retrievalContext);
        $themeEvidence = $this->calculateThemeElementEvidence($metadata, $concepts, $retrievalContext);
        $facetEvidenceScore = $this->calculateFacetEvidence(
            $metadata,
            $concepts,
            $retrievalContext,
            (float) ($retrievalEvidence['best_facet_rank_score'] ?? 0)
        );

        // 主題元素是本版新增的核心訊號。metadata 仍重要，但不再獨占決策。
        $combinedEvidenceScore = $this->clamp(
            $metadataEvidenceScore * 0.30
            + (float) $themeEvidence['score'] * 0.35
            + (float) $retrievalEvidence['score'] * 0.20
            + $facetEvidenceScore * 0.15,
            0.0,
            1.0
        );

        $metadataGatePassed = $requiredCount === 0 || $requiredMatchedCount > 0;
        $independentFamilyCount = (int) ($retrievalEvidence['independent_query_family_count'] ?? 0);
        $bestFacetRankScore = (float) ($retrievalEvidence['best_facet_rank_score'] ?? 0);
        $facetHitCount = (int) ($retrievalEvidence['facet_hit_count'] ?? 0);
        $branchFacetMetadataMatched = $this->hasBranchFacetMetadataMatch(
            $metadata,
            $concepts,
            $retrievalContext
        );

        $strongThemeEvidence = (float) $themeEvidence['score'] >= 0.55
            && (count($themeEvidence['matched_elements']) >= 1 || count($themeEvidence['retrieval_families']) >= 1);

        if ($hasExcludedMatch) {
            $status = 'REJECT';
        } elseif ($metadataGatePassed) {
            $status = 'PASS';
        } elseif (
            $strongThemeEvidence
            && ($independentFamilyCount >= 1 || $bestFacetRankScore >= 0.45)
        ) {
            // 可以由「具體主題元素 + semantic retrieval」證明，不必硬等 metadata 寫出核心概念。
            $status = 'PASS';
        } elseif (
            $independentFamilyCount >= 1
            || $facetHitCount >= 1
            || (float) $themeEvidence['score'] >= 0.12
            || $combinedEvidenceScore >= 0.22
        ) {
            // 文字證據不足，但來源合理，交給後續影像／色彩分析，不在這裡判死刑。
            $status = 'CANDIDATE';
        } else {
            $status = 'REJECT';
        }

        $retrievalRescuePassed = $status !== 'REJECT' && !$metadataGatePassed;
        $contentScore = $combinedEvidenceScore;

        if ($status === 'PASS') {
            $contentScore = min(1.0, $contentScore + 0.08);
        } elseif ($status === 'CANDIDATE') {
            // 候選保留，但排序信心略低於明確 PASS。
            $contentScore *= 0.94;
        }
        if ($hasExcludedMatch) {
            $contentScore *= 0.10;
        }

        return [
            'content_relevance_score' => round($this->clamp($contentScore, 0.0, 1.0), 5),
            'content_gate_status' => $status,
            // 舊欄位相容：PASS + CANDIDATE 都可進候選池；真正狀態看 content_gate_status。
            'content_gate_passed' => $status !== 'REJECT',

            'metadata_evidence_score' => round($metadataEvidenceScore, 5),
            'retrieval_evidence_score' => round((float) $retrievalEvidence['score'], 5),
            'facet_evidence_score' => round($facetEvidenceScore, 5),
            'theme_element_score' => round((float) $themeEvidence['score'], 5),
            'combined_evidence_score' => round($combinedEvidenceScore, 5),

            'matched_theme_elements' => $themeEvidence['matched_elements'],
            'theme_element_families' => $themeEvidence['matched_families'],
            'theme_retrieval_families' => $themeEvidence['retrieval_families'],

            'retrieval_rescue_passed' => $retrievalRescuePassed,
            'best_facet_rank_score' => round($bestFacetRankScore, 5),
            'facet_hit_count' => $facetHitCount,
            'independent_query_family_count' => $independentFamilyCount,
            'query_families' => $retrievalEvidence['query_families'] ?? [],
            'branch_facet_metadata_matched' => $branchFacetMetadataMatched,

            'required_score' => round($requiredScore, 5),
            'preferred_score' => round($preferredScore, 5),
            'matched_required_count' => $requiredMatchedCount,
            'required_count' => $requiredCount,
            'has_excluded_match' => $hasExcludedMatch,
            'required_matches' => $requiredResults,
            'preferred_matches' => $preferredResults,
            'excluded_matches' => $excludedResults,
            'content_metadata' => $metadata,
        ];
    }

    /**
     * @param array<int,array<string,mixed>> $groups
     * @return array<int,array<string,mixed>>
     */
    private function evaluateGroups(
        string $metadata,
        array $groups,
        bool $required,
        bool $exclusion = false
    ): array {
        $results = [];
        foreach ($groups as $group) {
            if (!is_array($group)) {
                continue;
            }
            $match = $this->matchTermSet($metadata, is_array($group['terms'] ?? null) ? $group['terms'] : []);
            $concept = is_array($group['concept'] ?? null) ? $group['concept'] : [];

            if ($exclusion) {
                $strength = $match['primary_matched'] ? 1.0 : 0.0;
                $matched = $match['primary_matched'];
            } elseif ($required) {
                // Support 只能提高信心，不能單獨把 required 判成真正 primary match。
                $strength = $match['primary_matched']
                    ? 1.0
                    : ($match['strong_support_passed'] ? 0.55 : ($match['support_matched'] ? 0.18 : 0.0));
                $matched = $match['primary_matched'];
            } else {
                $strength = $match['primary_matched']
                    ? 1.0
                    : ($match['strong_support_passed'] ? 0.65 : ($match['support_matched'] ? 0.32 : 0.0));
                $matched = $match['primary_matched'] || $match['support_matched'];
            }

            $results[] = [
                'concept' => (string) ($concept['original_text'] ?? $concept['normalized_label'] ?? ''),
                'matched' => $matched,
                'primary_matched' => $match['primary_matched'],
                'support_matched' => $match['support_matched'],
                'strong_support_passed' => $match['strong_support_passed'],
                'support_evidence_score' => $match['support_evidence_score'],
                'matched_primary_terms' => $match['matched_primary_terms'],
                'matched_support_terms' => $match['matched_support_terms'],
                'match_strength' => $strength,
            ];
        }
        return $results;
    }

    /** @return array{primary:array<int,string>,support:array<int,string>,theme_elements:array<int,array<string,string>>} */
    private function collectConceptTerms(array $concept): array
    {
        $primary = [];
        $supportPhrases = [];
        $supportTokens = [];

        foreach ([
            (string) ($concept['original_text'] ?? ''),
            (string) ($concept['normalized_label'] ?? ''),
            (string) ($concept['search_term'] ?? ''),
        ] as $value) {
            $normalized = $this->normalizeText($value);
            if ($normalized !== '') {
                $primary[] = $normalized;
            }
            $this->addUsefulTokens($supportTokens, $value);
        }

        $facets = is_array($concept['search_facets'] ?? null) ? $concept['search_facets'] : [];
        $styleTerms = is_array($facets['style_terms'] ?? null) ? $facets['style_terms'] : [];
        foreach ($styleTerms as $term) {
            $normalized = $this->normalizeText((string) $term);
            if ($normalized === '') {
                continue;
            }
            $supportPhrases[] = $normalized;
            $this->addUsefulTokens($supportTokens, (string) $term);
        }

        $primary = $this->uniqueTerms($primary);
        $supportPhrases = $this->uniqueTerms($supportPhrases);
        $supportTokens = $this->uniqueTerms($supportTokens);

        $primaryLookup = array_fill_keys($primary, true);
        $support = [];
        foreach (array_merge($supportPhrases, $supportTokens) as $term) {
            if (!isset($primaryLookup[$term])) {
                $support[] = $term;
            }
        }

        return [
            'primary' => $primary,
            'support' => $this->uniqueTerms($support),
            'theme_elements' => $this->normalizeThemeElements($facets['theme_elements'] ?? []),
        ];
    }

    /** @param string[] $target */
    private function addUsefulTokens(array &$target, string $value): void
    {
        $normalized = $this->normalizeText($value);
        if ($normalized === '') {
            return;
        }
        foreach (preg_split('/\s+/u', $normalized) ?: [] as $token) {
            if ($this->textLength($token) < 3 || $this->isGenericToken($token)) {
                continue;
            }
            $target[] = $token;
        }
    }

    private function isGenericToken(string $token): bool
    {
        return in_array($token, self::GENERIC_SUPPORT_TOKENS, true);
    }

    /** @return array<string,mixed> */
    private function matchTermSet(string $metadata, array $termSet): array
    {
        $matchedPrimary = $this->findMatchedTerms($metadata, is_array($termSet['primary'] ?? null) ? $termSet['primary'] : []);
        $matchedSupport = $this->findMatchedTerms($metadata, is_array($termSet['support'] ?? null) ? $termSet['support'] : []);
        $matchedSupport = $this->collapsePhraseTokenMatches($matchedSupport);
        $supportEvidenceScore = $this->calculateSupportEvidence($matchedSupport);

        return [
            'primary_matched' => $matchedPrimary !== [],
            'support_matched' => $matchedSupport !== [],
            'strong_support_passed' => $supportEvidenceScore >= 0.70,
            'support_evidence_score' => round($supportEvidenceScore, 5),
            'matched_primary_terms' => $matchedPrimary,
            'matched_support_terms' => $matchedSupport,
        ];
    }

    /**
     * 若完整 phrase 已命中，移除該 phrase 內的單字 token，避免同一證據算三次。
     *
     * @param string[] $terms
     * @return string[]
     */
    private function collapsePhraseTokenMatches(array $terms): array
    {
        $normalized = $this->uniqueTerms($terms);
        $phrases = array_values(array_filter(
            $normalized,
            static fn(string $term): bool => str_contains($term, ' ')
        ));

        return array_values(array_filter(
            $normalized,
            static function (string $term) use ($phrases): bool {
                if (str_contains($term, ' ')) {
                    return true;
                }
                foreach ($phrases as $phrase) {
                    $words = preg_split('/\s+/u', $phrase) ?: [];
                    if (in_array($term, $words, true)) {
                        return false;
                    }
                }
                return true;
            }
        ));
    }

    /** @param string[] $matchedSupportTerms */
    private function calculateSupportEvidence(array $matchedSupportTerms): float
    {
        $score = 0.0;
        foreach ($matchedSupportTerms as $term) {
            $normalized = $this->normalizeText((string) $term);
            if ($normalized === '') {
                continue;
            }
            $wordCount = count(preg_split('/\s+/u', $normalized) ?: []);
            if ($wordCount >= 2) {
                $score += 0.50;
            } elseif (!$this->isGenericToken($normalized)) {
                $score += 0.08;
            }
        }
        return $this->clamp($score, 0.0, 1.0);
    }

    /**
     * Retrieval evidence 改用 SearchPlanner 已經產生的 query_family；
     * 不再從 query 字串事後猜 family。
     *
     * @return array<string,mixed>
     */
    private function calculateRetrievalEvidence(array $context): array
    {
        $queryHits = is_array($context['query_hits'] ?? null) ? $context['query_hits'] : [];
        $searchPlan = is_array($context['search_plan'] ?? null) ? $context['search_plan'] : [];
        $planById = [];
        foreach ($searchPlan as $plan) {
            if (!is_array($plan)) {
                continue;
            }
            $id = (string) ($plan['id'] ?? '');
            if ($id !== '') {
                $planById[$id] = $plan;
            }
        }

        $bestRankScore = 0.0;
        $bestFacetRankScore = 0.0;
        $hitCount = 0;
        $facetHitCount = 0;
        $families = [];

        foreach ($queryHits as $hit) {
            if (!is_array($hit)) {
                continue;
            }
            $rank = max(1, (int) ($hit['rank'] ?? 999));
            $rankScore = 1 / sqrt($rank);
            $bestRankScore = max($bestRankScore, $rankScore);
            $hitCount++;

            $queryId = (string) ($hit['query_id'] ?? '');
            $plan = $planById[$queryId] ?? [];
            $family = $this->normalizeFamily((string) ($hit['query_family'] ?? $plan['query_family'] ?? ''));

            if ($family !== '' && $family !== 'core') {
                $bestFacetRankScore = max($bestFacetRankScore, $rankScore);
                $facetHitCount++;
                $families[$family] = true;
            }
        }

        $overlapScore = min(1.0, $hitCount / max(1, count($searchPlan)));
        $semanticFamilyBonus = min(1.0, count($families) / 2);
        $score = $bestRankScore * 0.45
            + $bestFacetRankScore * 0.30
            + $semanticFamilyBonus * 0.15
            + $overlapScore * 0.10;

        return [
            'score' => $this->clamp($score, 0.0, 1.0),
            'best_rank_score' => $bestRankScore,
            'best_facet_rank_score' => $bestFacetRankScore,
            'facet_hit_count' => $facetHitCount,
            'independent_query_family_count' => count($families),
            'query_families' => array_keys($families),
            'overlap_score' => $overlapScore,
        ];
    }

    /**
     * 主題元素證據：
     * - metadata 直接出現具體元素 phrase。
     * - 或圖片由對應 element:* query family 搜回，且排名夠前。
     *
     * @return array{score:float,matched_elements:array<int,string>,matched_families:array<int,string>,retrieval_families:array<int,string>}
     */
    private function calculateThemeElementEvidence(string $metadata, array $concepts, array $context): array
    {
        $elements = [];
        foreach ($concepts as $concept) {
            if (!is_array($concept)) {
                continue;
            }
            $facets = is_array($concept['search_facets'] ?? null) ? $concept['search_facets'] : [];
            foreach ($this->normalizeThemeElements($facets['theme_elements'] ?? []) as $element) {
                $key = strtolower($element['family'] . '|' . $element['term']);
                $elements[$key] = $element;
            }
        }

        $matchedElements = [];
        $matchedFamilies = [];
        $metadataScore = 0.0;
        foreach ($elements as $element) {
            $term = $element['term'];
            if ($term !== '' && str_contains($metadata, $term)) {
                $matchedElements[] = $term;
                $matchedFamilies[$element['family']] = true;
                $wordCount = count(preg_split('/\s+/u', $term) ?: []);
                $metadataScore += $wordCount >= 2 ? 0.42 : 0.12;
            }
        }
        if (count($matchedFamilies) >= 2) {
            $metadataScore += 0.15;
        }
        $metadataScore = min(1.0, $metadataScore);

        $searchPlan = is_array($context['search_plan'] ?? null) ? $context['search_plan'] : [];
        $planById = [];
        foreach ($searchPlan as $plan) {
            if (is_array($plan) && (string) ($plan['id'] ?? '') !== '') {
                $planById[(string) $plan['id']] = $plan;
            }
        }

        $retrievalFamilies = [];
        $retrievalScore = 0.0;
        foreach (is_array($context['query_hits'] ?? null) ? $context['query_hits'] : [] as $hit) {
            if (!is_array($hit)) {
                continue;
            }
            $plan = $planById[(string) ($hit['query_id'] ?? '')] ?? [];
            $family = $this->normalizeFamily((string) ($hit['query_family'] ?? $plan['query_family'] ?? ''));
            if (!str_starts_with($family, 'element:') && !str_starts_with($family, 'element_')) {
                continue;
            }
            $rank = max(1, (int) ($hit['rank'] ?? 999));
            $rankScore = 1 / sqrt($rank);
            $retrievalScore = max($retrievalScore, $rankScore);
            $retrievalFamilies[$family] = true;
        }

        $score = max($metadataScore, $retrievalScore * 0.70)
            + min($metadataScore, $retrievalScore * 0.70) * 0.25;

        return [
            'score' => $this->clamp($score, 0.0, 1.0),
            'matched_elements' => array_values(array_unique($matchedElements)),
            'matched_families' => array_keys($matchedFamilies),
            'retrieval_families' => array_keys($retrievalFamilies),
        ];
    }

    private function calculateFacetEvidence(
        string $metadata,
        array $concepts,
        array $context,
        float $bestFacetRankScore
    ): float {
        $branch = is_array($context['branch'] ?? null) ? $context['branch'] : [];
        $direction = is_array($branch['semantic_direction'] ?? null) ? $branch['semantic_direction'] : [];
        $branchTerms = is_array($direction['terms'] ?? null) ? $direction['terms'] : [];

        if ($branchTerms === []) {
            $branchCode = strtoupper(trim((string) ($branch['code'] ?? '')));
            $styleIndex = match ($branchCode) {
                'A' => 0,
                'B' => 1,
                'C' => 2,
                default => null,
            };
            if ($styleIndex !== null) {
                foreach ($concepts as $concept) {
                    if (!is_array($concept)) {
                        continue;
                    }
                    $styleTerms = $concept['search_facets']['style_terms'] ?? [];
                    if (is_array($styleTerms) && isset($styleTerms[$styleIndex])) {
                        $branchTerms[] = (string) $styleTerms[$styleIndex];
                        break;
                    }
                }
            }
        }

        $metadataFacetScore = 0.0;
        foreach ($this->uniqueTerms(array_map('strval', $branchTerms)) as $term) {
            if (!str_contains($metadata, $term)) {
                continue;
            }
            $wordCount = count(preg_split('/\s+/u', $term) ?: []);
            $metadataFacetScore += $wordCount >= 2 ? 0.50 : 0.10;
        }
        $metadataFacetScore = min(1.0, $metadataFacetScore);
        $retrievalFacetScore = $bestFacetRankScore * 0.70;

        return $this->clamp(
            max($metadataFacetScore, $retrievalFacetScore)
            + min($metadataFacetScore, $retrievalFacetScore) * 0.20,
            0.0,
            1.0
        );
    }

    private function hasBranchFacetMetadataMatch(string $metadata, array $concepts, array $context): bool
    {
        $branch = is_array($context['branch'] ?? null) ? $context['branch'] : [];
        $direction = is_array($branch['semantic_direction'] ?? null) ? $branch['semantic_direction'] : [];
        $terms = is_array($direction['terms'] ?? null) ? $direction['terms'] : [];

        foreach ($terms as $term) {
            $normalized = $this->normalizeText((string) $term);
            if ($normalized !== '' && str_contains($metadata, $normalized)) {
                return true;
            }
        }

        $branchCode = strtoupper(trim((string) ($branch['code'] ?? '')));
        $styleIndex = match ($branchCode) {
            'A' => 0,
            'B' => 1,
            'C' => 2,
            default => null,
        };
        if ($styleIndex === null) {
            return false;
        }

        foreach ($concepts as $concept) {
            if (!is_array($concept)) {
                continue;
            }
            $styleTerms = $concept['search_facets']['style_terms'] ?? [];
            if (!is_array($styleTerms) || !isset($styleTerms[$styleIndex])) {
                continue;
            }
            $term = $this->normalizeText((string) $styleTerms[$styleIndex]);
            if ($term !== '' && str_contains($metadata, $term)) {
                return true;
            }
        }
        return false;
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
                $term = $this->normalizeText($element);
                $family = 'visual_element';
            } elseif (is_array($element)) {
                $term = $this->normalizeText((string) ($element['term'] ?? ''));
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
        }
        return $result;
    }

    private function buildPhotoMetadata(array $photo): string
    {
        $parts = [
            (string) ($photo['alt'] ?? ''),
            (string) ($photo['description'] ?? ''),
            (string) ($photo['title'] ?? ''),
            (string) ($photo['tags'] ?? ''),
        ];
        return $this->normalizeText(implode(' ', array_filter($parts)));
    }

    /** @param string[] $terms @return string[] */
    private function findMatchedTerms(string $metadata, array $terms): array
    {
        $matched = [];
        foreach ($terms as $term) {
            $term = $this->normalizeText((string) $term);
            if ($term !== '' && str_contains($metadata, $term)) {
                $matched[] = $term;
            }
        }
        return $this->uniqueTerms($matched);
    }

    /** @param string[] $terms @return string[] */
    private function uniqueTerms(array $terms): array
    {
        $clean = [];
        foreach ($terms as $term) {
            $term = $this->normalizeText((string) $term);
            if ($term !== '') {
                $clean[] = $term;
            }
        }
        return array_values(array_unique($clean));
    }

    private function normalizeFamily(string $value): string
    {
        $value = strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9:_\- ]+/', '', $value) ?? '';
        $value = preg_replace('/[\s\-]+/', '_', $value) ?? '';
        return trim($value, '_');
    }

    private function normalizeText(string $value): string
    {
        $value = $this->lowerText(trim($value));
        $value = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value) ?? '';
        $value = preg_replace('/\s+/u', ' ', $value) ?? '';
        return trim($value);
    }

    private function lowerText(string $value): string
    {
        return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    }

    private function textLength(string $value): int
    {
        if (function_exists('mb_strlen')) {
            return mb_strlen($value, 'UTF-8');
        }
        $matched = preg_match_all('/./us', $value, $matches);
        return $matched === false ? strlen($value) : count($matches[0]);
    }

    private function clamp(float $value, float $min, float $max): float
    {
        return min($max, max($min, $value));
    }
}
