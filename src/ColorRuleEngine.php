<?php

declare(strict_types=1);

final class ColorRuleEngine
{
    /** @var array<string, float> */
    private const PRIORITY_MULTIPLIERS = [
        'main' => 1.35,
        'secondary' => 1.0,
        'slight' => 0.6,
        'exclude' => 1.2,
    ];

    /**
     * 固定、可重現的色彩規則。未設定的欄位不參與平均，不視為 0。
     *
     * @var array<string, array<string, mixed>>
     */
    private const RULES = [
        /*
         * HueSense 25 個感受詞校準規則
         *
         * 理論定位：參考 Kobayashi Color Image Scale 的「暖—冷、柔—硬、
         * 清澄—混濁」概念架構，用於檢查本系統七維參數的內部一致性。
         * 下列精確數值為本研究的 heuristic（經驗式）操作化參數，並非
         * Kobayashi 原始形容詞座標或專有資料表。
         *
         * 七個主要維度：
         * meanLightness、meanChroma、temperature、contrast、visualWeight、
         * neutralRatio、darkRatio。
         *
         * 論文表格的三軸檢查值可由下式重現：
         * 暖冷分數（0–100） = (temperature + 1) × 50
         * 柔硬分數（0–100） = (contrast + visualWeight) × 50
         * 清濁分數（-100–100） = meanChroma × 500 - neutralRatio × 100
         */
        'bright' => [
            'label' => '明亮',
            'reference_scores' => ['warm_cool' => 55, 'soft_hard' => 34, 'clear_grayish' => 10],
            'targets' => [
                'meanLightness' => 0.78,
                'meanChroma' => 0.11,
                'temperature' => 0.10,
                'contrast' => 0.32,
                'visualWeight' => 0.36,
                'neutralRatio' => 0.45,
                'darkRatio' => 0.10,
            ],
        ],
        'deep' => [
            'label' => '深沉',
            'reference_scores' => ['warm_cool' => 48, 'soft_hard' => 72, 'clear_grayish' => -20],
            'targets' => [
                'meanLightness' => 0.30,
                'meanChroma' => 0.07,
                'temperature' => -0.04,
                'contrast' => 0.64,
                'visualWeight' => 0.80,
                'neutralRatio' => 0.55,
                'darkRatio' => 0.68,
            ],
        ],
        'calm' => [
            'label' => '沉穩',
            'reference_scores' => ['warm_cool' => 48, 'soft_hard' => 52, 'clear_grayish' => -42],
            'targets' => [
                'meanLightness' => 0.42,
                'meanChroma' => 0.046,
                'temperature' => -0.04,
                'contrast' => 0.44,
                'visualWeight' => 0.60,
                'neutralRatio' => 0.65,
                'darkRatio' => 0.46,
            ],
        ],
        'soft' => [
            'label' => '柔和',
            'reference_scores' => ['warm_cool' => 53, 'soft_hard' => 28, 'clear_grayish' => -47],
            'targets' => [
                'meanLightness' => 0.70,
                'meanChroma' => 0.05,
                'temperature' => 0.06,
                'contrast' => 0.22,
                'visualWeight' => 0.34,
                'neutralRatio' => 0.72,
                'darkRatio' => 0.12,
            ],
        ],
        'vivid' => [
            'label' => '鮮明',
            'reference_scores' => ['warm_cool' => 54, 'soft_hard' => 67, 'clear_grayish' => 64],
            'targets' => [
                'meanLightness' => 0.62,
                'meanChroma' => 0.18,
                'temperature' => 0.08,
                'contrast' => 0.62,
                'visualWeight' => 0.72,
                'neutralRatio' => 0.26,
                'darkRatio' => 0.16,
            ],
        ],
        'warm' => [
            'label' => '溫暖',
            'reference_scores' => ['warm_cool' => 86, 'soft_hard' => 39, 'clear_grayish' => 17],
            'targets' => [
                'meanLightness' => 0.64,
                'meanChroma' => 0.12,
                'temperature' => 0.72,
                'contrast' => 0.34,
                'visualWeight' => 0.44,
                'neutralRatio' => 0.43,
                'darkRatio' => 0.18,
            ],
        ],
        'cool' => [
            'label' => '冷靜',
            'reference_scores' => ['warm_cool' => 20, 'soft_hard' => 42, 'clear_grayish' => -29],
            'targets' => [
                'meanLightness' => 0.56,
                'meanChroma' => 0.064,
                'temperature' => -0.60,
                'contrast' => 0.36,
                'visualWeight' => 0.48,
                'neutralRatio' => 0.61,
                'darkRatio' => 0.22,
            ],
        ],
        'natural' => [
            'label' => '自然',
            'reference_scores' => ['warm_cool' => 61, 'soft_hard' => 40, 'clear_grayish' => -20],
            'targets' => [
                'meanLightness' => 0.58,
                'meanChroma' => 0.07,
                'temperature' => 0.22,
                'contrast' => 0.34,
                'visualWeight' => 0.46,
                'neutralRatio' => 0.55,
                'darkRatio' => 0.20,
            ],
        ],
        'modern' => [
            'label' => '現代',
            'reference_scores' => ['warm_cool' => 37, 'soft_hard' => 57, 'clear_grayish' => -42],
            'targets' => [
                'meanLightness' => 0.62,
                'meanChroma' => 0.052,
                'temperature' => -0.26,
                'contrast' => 0.56,
                'visualWeight' => 0.58,
                'neutralRatio' => 0.68,
                'darkRatio' => 0.18,
            ],
        ],
        'mature' => [
            'label' => '成熟',
            'reference_scores' => ['warm_cool' => 52, 'soft_hard' => 60, 'clear_grayish' => -26],
            'targets' => [
                'meanLightness' => 0.43,
                'meanChroma' => 0.064,
                'temperature' => 0.04,
                'contrast' => 0.54,
                'visualWeight' => 0.66,
                'neutralRatio' => 0.58,
                'darkRatio' => 0.42,
            ],
        ],
        'friendly' => [
            'label' => '親切',
            'reference_scores' => ['warm_cool' => 72, 'soft_hard' => 33, 'clear_grayish' => -4],
            'targets' => [
                'meanLightness' => 0.72,
                'meanChroma' => 0.08,
                'temperature' => 0.44,
                'contrast' => 0.28,
                'visualWeight' => 0.38,
                'neutralRatio' => 0.44,
                'darkRatio' => 0.10,
            ],
        ],
        'luxurious' => [
            'label' => '奢華',
            'reference_scores' => ['warm_cool' => 61, 'soft_hard' => 77, 'clear_grayish' => 17],
            'targets' => [
                'meanLightness' => 0.34,
                'meanChroma' => 0.12,
                'temperature' => 0.22,
                'contrast' => 0.72,
                'visualWeight' => 0.82,
                'neutralRatio' => 0.43,
                'darkRatio' => 0.50,
            ],
        ],
        'lively' => [
            'label' => '活潑',
            'reference_scores' => ['warm_cool' => 65, 'soft_hard' => 43, 'clear_grayish' => 52],
            'targets' => [
                'meanLightness' => 0.68,
                'meanChroma' => 0.16,
                'temperature' => 0.30,
                'contrast' => 0.40,
                'visualWeight' => 0.46,
                'neutralRatio' => 0.28,
                'darkRatio' => 0.10,
            ],
        ],
        'professional' => [
            'label' => '專業',
            'reference_scores' => ['warm_cool' => 32, 'soft_hard' => 57, 'clear_grayish' => -44],
            'targets' => [
                'meanLightness' => 0.56,
                'meanChroma' => 0.052,
                'temperature' => -0.36,
                'contrast' => 0.54,
                'visualWeight' => 0.60,
                'neutralRatio' => 0.70,
                'darkRatio' => 0.24,
            ],
        ],
        'technological' => [
            'label' => '科技感',
            'reference_scores' => ['warm_cool' => 18, 'soft_hard' => 65, 'clear_grayish' => 13],
            'targets' => [
                'meanLightness' => 0.56,
                'meanChroma' => 0.10,
                'temperature' => -0.64,
                'contrast' => 0.64,
                'visualWeight' => 0.66,
                'neutralRatio' => 0.37,
                'darkRatio' => 0.22,
            ],
        ],
        'minimalist' => [
            'label' => '簡約',
            'reference_scores' => ['warm_cool' => 40, 'soft_hard' => 40, 'clear_grayish' => -65],
            'targets' => [
                'meanLightness' => 0.74,
                'meanChroma' => 0.03,
                'temperature' => -0.20,
                'contrast' => 0.36,
                'visualWeight' => 0.44,
                'neutralRatio' => 0.80,
                'darkRatio' => 0.08,
            ],
        ],
        'elegant' => [
            'label' => '優雅',
            'reference_scores' => ['warm_cool' => 45, 'soft_hard' => 55, 'clear_grayish' => -43],
            'targets' => [
                'meanLightness' => 0.60,
                'meanChroma' => 0.05,
                'temperature' => -0.10,
                'contrast' => 0.50,
                'visualWeight' => 0.60,
                'neutralRatio' => 0.68,
                'darkRatio' => 0.18,
            ],
        ],
        'romantic' => [
            'label' => '浪漫',
            'reference_scores' => ['warm_cool' => 60, 'soft_hard' => 30, 'clear_grayish' => 5],
            'targets' => [
                'meanLightness' => 0.72,
                'meanChroma' => 0.10,
                'temperature' => 0.20,
                'contrast' => 0.24,
                'visualWeight' => 0.36,
                'neutralRatio' => 0.45,
                'darkRatio' => 0.10,
            ],
        ],
        'refreshing' => [
            'label' => '清爽',
            'reference_scores' => ['warm_cool' => 30, 'soft_hard' => 34, 'clear_grayish' => 4],
            'targets' => [
                'meanLightness' => 0.76,
                'meanChroma' => 0.08,
                'temperature' => -0.40,
                'contrast' => 0.30,
                'visualWeight' => 0.38,
                'neutralRatio' => 0.36,
                'darkRatio' => 0.08,
            ],
        ],
        'mysterious' => [
            'label' => '神秘',
            'reference_scores' => ['warm_cool' => 35, 'soft_hard' => 73, 'clear_grayish' => 10],
            'targets' => [
                'meanLightness' => 0.28,
                'meanChroma' => 0.10,
                'temperature' => -0.30,
                'contrast' => 0.66,
                'visualWeight' => 0.80,
                'neutralRatio' => 0.40,
                'darkRatio' => 0.68,
            ],
        ],
        'vintage' => [
            'label' => '復古',
            'reference_scores' => ['warm_cool' => 65, 'soft_hard' => 44, 'clear_grayish' => -10],
            'targets' => [
                'meanLightness' => 0.48,
                'meanChroma' => 0.08,
                'temperature' => 0.30,
                'contrast' => 0.40,
                'visualWeight' => 0.48,
                'neutralRatio' => 0.50,
                'darkRatio' => 0.30,
            ],
        ],
        'pure' => [
            'label' => '純淨',
            'reference_scores' => ['warm_cool' => 45, 'soft_hard' => 27, 'clear_grayish' => -72],
            'targets' => [
                'meanLightness' => 0.90,
                'meanChroma' => 0.02,
                'temperature' => -0.10,
                'contrast' => 0.20,
                'visualWeight' => 0.34,
                'neutralRatio' => 0.82,
                'darkRatio' => 0.02,
            ],
        ],
        'bold' => [
            'label' => '大膽',
            'reference_scores' => ['warm_cool' => 50, 'soft_hard' => 70, 'clear_grayish' => 58],
            'targets' => [
                'meanLightness' => 0.56,
                'meanChroma' => 0.16,
                'temperature' => 0.00,
                'contrast' => 0.66,
                'visualWeight' => 0.74,
                'neutralRatio' => 0.22,
                'darkRatio' => 0.20,
            ],
        ],
        'playful' => [
            'label' => '俏皮',
            'reference_scores' => ['warm_cool' => 58, 'soft_hard' => 41, 'clear_grayish' => 35],
            'targets' => [
                'meanLightness' => 0.74,
                'meanChroma' => 0.13,
                'temperature' => 0.16,
                'contrast' => 0.38,
                'visualWeight' => 0.44,
                'neutralRatio' => 0.30,
                'darkRatio' => 0.06,
            ],
        ],
        'healing' => [
            'label' => '療癒',
            'reference_scores' => ['warm_cool' => 48, 'soft_hard' => 30, 'clear_grayish' => -43],
            'targets' => [
                'meanLightness' => 0.72,
                'meanChroma' => 0.05,
                'temperature' => -0.04,
                'contrast' => 0.24,
                'visualWeight' => 0.36,
                'neutralRatio' => 0.68,
                'darkRatio' => 0.10,
            ],
        ],

        /*
         * 功能性／複合語意規則：不是上述 25 感受詞量表的一部分。
         * 保留供「黑暗、低對比、高彩度、悶熱」等直接條件使用。
         */
        'dark' => [
            'targets' => ['meanLightness' => 0.28, 'darkRatio' => 0.68, 'visualWeight' => 0.76],
            'weights' => ['meanLightness' => 1.0, 'darkRatio' => 1.0, 'visualWeight' => 0.76],
        ],
        'light_weight' => [
            'targets' => ['meanLightness' => 0.72, 'visualWeight' => 0.28, 'darkRatio' => 0.10],
            'weights' => ['meanLightness' => 0.72, 'visualWeight' => 1.0, 'darkRatio' => 0.65],
        ],
        'heavy' => [
            'targets' => ['meanLightness' => 0.34, 'visualWeight' => 0.78, 'darkRatio' => 0.62],
            'weights' => ['meanLightness' => 0.62, 'visualWeight' => 1.0, 'darkRatio' => 0.82],
        ],
        'neutral' => [
            'targets' => ['meanChroma' => 0.035, 'neutralRatio' => 0.78, 'highChromaRatio' => 0.04],
            'weights' => ['meanChroma' => 0.80, 'neutralRatio' => 1.0, 'highChromaRatio' => 0.62],
        ],
        'low_contrast' => [
            'targets' => ['contrast' => 0.20],
            'weights' => ['contrast' => 1.0],
        ],
        'high_contrast' => [
            'targets' => ['contrast' => 0.65, 'accentRatio' => 0.22],
            'weights' => ['contrast' => 1.0, 'accentRatio' => 0.45],
        ],
        'high_chroma' => [
            'targets' => ['meanChroma' => 0.17, 'highChromaRatio' => 0.48],
            'weights' => ['meanChroma' => 0.86, 'highChromaRatio' => 1.0],
        ],
        'low_chroma' => [
            'targets' => ['meanChroma' => 0.055, 'highChromaRatio' => 0.06, 'neutralRatio' => 0.54],
            'weights' => ['meanChroma' => 1.0, 'highChromaRatio' => 0.86, 'neutralRatio' => 0.52],
        ],
        'oppressive' => [
            'targets' => ['meanLightness' => 0.30, 'contrast' => 0.48, 'visualWeight' => 0.82, 'darkRatio' => 0.65],
            'weights' => ['meanLightness' => 0.62, 'contrast' => 0.62, 'visualWeight' => 1.0, 'darkRatio' => 0.88],
        ],
        'humid_heat' => [
            'targets' => ['temperature' => 0.38, 'meanChroma' => 0.10, 'contrast' => 0.38, 'visualWeight' => 0.66],
            'weights' => ['temperature' => 0.65, 'meanChroma' => 0.35, 'contrast' => 0.42, 'visualWeight' => 0.82],
        ],
    ];

    /** @var array<string, array<int, array<string, mixed>>> */
    private const NEGATIVE_CONSTRAINTS = [
        'bright' => [
            ['feature' => 'meanLightness', 'mode' => 'maximum', 'threshold' => 0.64, 'tolerance' => 0.26],
        ],
        'dark' => [
            ['feature' => 'darkRatio', 'mode' => 'maximum', 'threshold' => 0.38, 'tolerance' => 0.42],
            ['feature' => 'meanLightness', 'mode' => 'minimum', 'threshold' => 0.46, 'tolerance' => 0.3],
        ],
        'soft' => [
            ['feature' => 'contrast', 'mode' => 'minimum', 'threshold' => 0.3, 'tolerance' => 0.35],
        ],
        'vivid' => [
            ['feature' => 'highChromaRatio', 'mode' => 'maximum', 'threshold' => 0.28, 'tolerance' => 0.5],
            ['feature' => 'meanChroma', 'mode' => 'maximum', 'threshold' => 0.12, 'tolerance' => 0.12],
        ],
        'high_chroma' => [
            ['feature' => 'highChromaRatio', 'mode' => 'maximum', 'threshold' => 0.28, 'tolerance' => 0.5],
            ['feature' => 'meanChroma', 'mode' => 'maximum', 'threshold' => 0.12, 'tolerance' => 0.12],
        ],
        'low_chroma' => [
            ['feature' => 'meanChroma', 'mode' => 'minimum', 'threshold' => 0.08, 'tolerance' => 0.12],
        ],
        'warm' => [
            ['feature' => 'temperature', 'mode' => 'maximum', 'threshold' => 0.18, 'tolerance' => 1.0],
        ],
        'cool' => [
            ['feature' => 'temperature', 'mode' => 'minimum', 'threshold' => -0.18, 'tolerance' => 1.0],
        ],
        'low_contrast' => [
            ['feature' => 'contrast', 'mode' => 'minimum', 'threshold' => 0.3, 'tolerance' => 0.45],
        ],
        'high_contrast' => [
            ['feature' => 'contrast', 'mode' => 'maximum', 'threshold' => 0.52, 'tolerance' => 0.45],
        ],
        'heavy' => [
            ['feature' => 'visualWeight', 'mode' => 'maximum', 'threshold' => 0.58, 'tolerance' => 0.45],
        ],
        'light_weight' => [
            ['feature' => 'visualWeight', 'mode' => 'minimum', 'threshold' => 0.4, 'tolerance' => 0.45],
        ],
    ];

    /**
     * @param array<int, array<string, mixed>> $concepts
     * @return array<string, mixed>
     */
    public function derive(array $concepts): array
    {
        $targetSums = [];
        $weightSums = [];
        $featureWeights = [];
        $constraints = [];
        $exclusionTerms = [];
        $appliedRules = [];

        foreach ($concepts as $concept) {
            if (!is_array($concept)) {
                continue;
            }

            $category = (string) ($concept['category'] ?? 'atmosphere');
            $priority = (string) ($concept['priority'] ?? 'secondary');
            $intensity = $this->clamp((float) ($concept['intensity'] ?? 1.0), 0.5, 1.5);
            $ruleId = (string) ($concept['color_rule'] ?? 'none');
            $conceptWeight = (self::PRIORITY_MULTIPLIERS[$priority] ?? 1.0) * $intensity;
            $isExclusion = $category === 'exclusion' || $priority === 'exclude';

            if ($isExclusion) {
                $searchTerm = trim((string) ($concept['search_term'] ?? ''));
                if ($searchTerm !== '') {
                    $exclusionTerms[] = strtolower($searchTerm);
                }

                foreach (self::NEGATIVE_CONSTRAINTS[$ruleId] ?? [] as $constraint) {
                    $constraints[] = [
                        ...$constraint,
                        'weight' => $this->clamp($conceptWeight, 0.4, 2.0),
                        'concept' => (string) ($concept['original_text'] ?? $ruleId),
                    ];
                }
                continue;
            }

            $rule = self::RULES[$ruleId] ?? null;
            if (!is_array($rule)) {
                continue;
            }

            $appliedRules[] = [
                'rule' => $ruleId,
                'concept' => (string) ($concept['original_text'] ?? $ruleId),
                'weight' => round($conceptWeight, 3),
            ];

            foreach (($rule['targets'] ?? []) as $feature => $target) {
                $localFeatureWeight = (float) (($rule['weights'] ?? [])[$feature] ?? 1.0);
                $finalWeight = $conceptWeight * $localFeatureWeight;

                $targetSums[$feature] = ($targetSums[$feature] ?? 0.0) + (float) $target * $finalWeight;
                $weightSums[$feature] = ($weightSums[$feature] ?? 0.0) + $finalWeight;
                $featureWeights[$feature] = ($featureWeights[$feature] ?? 0.0) + $finalWeight;
            }
        }

        $targetProfile = [];
        foreach ($targetSums as $feature => $sum) {
            $targetProfile[$feature] = round($sum / max(0.000001, $weightSums[$feature] ?? 1.0), 5);
        }

        if ($featureWeights !== []) {
            $maxWeight = max($featureWeights);
            foreach ($featureWeights as $feature => $weight) {
                $featureWeights[$feature] = round($weight / max(0.000001, $maxWeight), 5);
            }
        }

        return [
            'target_profile' => $targetProfile,
            'feature_weights' => $featureWeights,
            'constraints' => $constraints,
            'exclusion_terms' => array_values(array_unique($exclusionTerms)),
            'applied_rules' => $appliedRules,
        ];
    }

    private function clamp(float $value, float $min, float $max): float
    {
        return min($max, max($min, $value));
    }
}
