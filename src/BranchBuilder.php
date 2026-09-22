<?php

declare(strict_types=1);

final class BranchBuilder
{
    /**
     * ColorRuleEngine 如果某個欄位意外沒有傳進來，
     * BranchBuilder 使用這組安全預設值。
     *
     * 這些不是 AI 產生的數字，
     * 是系統內部固定 fallback。
     */
    private const DEFAULT_TARGET = [
        'meanLightness' => 0.55,
        'meanChroma' => 0.10,
        'temperature' => 0.00,
        'contrast' => 0.45,
        'visualWeight' => 0.50,
        'neutralRatio' => 0.45,
        'darkRatio' => 0.25,
    ];

    /**
     * 每個感知特徵允許的數值範圍。
     *
     * temperature：
     * -1 = 偏冷
     *  0 = 中性
     * +1 = 偏暖
     */
    private const FEATURE_RANGES = [
    /*
     * OKLab L。
     * 目前圖片分析使用 sRGB → linear RGB → OKLab，
     * L 的有效分析範圍為 0～1。
     */
    'meanLightness' => [0.0, 1.0],

    /*
     * OKLCH Chroma。
     *
     * W3C 的 0.40 是 OKLCH C 的百分比 reference range，
     * 並不是「sRGB 圖片實際能達到的最大 Chroma」。
     *
     * HueSense 目前 tone-analyzer.js 的輸入是 sRGB，
     * 並使用 Ottosson 的 sRGB → OKLab 轉換矩陣。
     *
     * 依目前這套轉換，在 sRGB cube 內計算，
     * 最高 Chroma 約為 0.32249（接近純洋紅 #FF00FF）。
     *
     * 因此保留少量浮點與實作誤差空間，
     * 使用 0.33 作為目前 sRGB 分析流程的安全上界。
     */
    'meanChroma' => [0.0, 0.33],

    /*
     * HueSense 自訂冷暖指標。
     *
     * tone-analyzer.js 使用 hue cosine 的
     * chroma-weighted average。
     * cosine 本身介於 -1～1，
     * 因此加權平均也介於 -1～1。
     */
    'temperature' => [-1.0, 1.0],

    /*
     * 圖片 tonal contrast：
     * P90(OKLab L) - P10(OKLab L)。
     *
     * L 為 0～1，
     * 因此差值必定位於 0～1。
     */
    'contrast' => [0.0, 1.0],

    /*
     * HueSense 視覺重量為正規化衍生指標，
     * tone-analyzer.js 最後 clamp 至 0～1。
     */
    'visualWeight' => [0.0, 1.0],

    /*
     * 中性色像素數 / 全部像素數。
     */
    'neutralRatio' => [0.0, 1.0],

    /*
     * 深色像素數 / 全部像素數。
     */
    'darkRatio' => [0.0, 1.0],
];

    /**
     * BranchBuilder 的主要入口。
     *
     * 傳入 ColorRuleEngine::derive() 的結果，
     * 回傳 Base Target + A/B/C 三個方向。
     *
     * @param array<string,mixed> $derived
     *
     * @return array{
     *     base_target: array<string,float>,
     *     branches: array<string,array<string,mixed>>
     * }
     */
        public function build(
            array $derived,
            array $concepts = []
        ): array
    {
        /*
         * 1. 取得 ColorRuleEngine 算出的共同色彩中心。
         */
        $baseTarget = $this->normalizeTarget(
            is_array(
                $derived['target_profile'] ?? null
            )
                ? $derived['target_profile']
                : []
        );

        /*
         * 2. 取得各特徵權重。
         *
         * 目前 A/B/C 先共用 ColorRuleEngine 的權重。
         * 之後真的需要時再個別調整。
         */
        $featureWeights =
            is_array(
                $derived['feature_weights'] ?? null
            )
                ? $derived['feature_weights']
                : [];

        /*
         * 3. 取得使用者的硬限制。
         *
         * 例如：
         * 不要太暗
         * 不要高對比
         */
        $constraints =
            is_array(
                $derived['constraints'] ?? null
            )
                ? array_values(
                    $derived['constraints']
                )
                : [];

        /*
         * 4. 搜尋圖片以前，
         * 就先建立真正的 A / B / C。
         */
        return [
            'base_target' => $baseTarget,

            'branches' => [
                'A' => $this->buildBranch(
                    'A',
                    $baseTarget,
                    $featureWeights,
                    $constraints,
                    $concepts
                ),

                'B' => $this->buildBranch(
                    'B',
                    $baseTarget,
                    $featureWeights,
                    $constraints,
                    $concepts
                    
                ),

                'C' => $this->buildBranch(
                    'C',
                    $baseTarget,
                    $featureWeights,
                    $constraints,
                    $concepts
                ),
            ],
        ];
    }

    /**
     * 建立單一方向。
     *
     * @param array<string,float> $baseTarget
     * @param array<string,mixed> $featureWeights
     * @param array<int,mixed> $constraints
     *
     * @return array<string,mixed>
     */
    private function buildBranch(
        string $code,
        array $baseTarget,
        array $featureWeights,
        array $constraints,
        array $concepts
    ): array {
        /*
         * 先依照 A/B/C 規則，
         * 從 Base Target 派生出新方向。
         */
        $target = $this->applyPreset(
            $code,
            $baseTarget
        );

        /*
         * 再套使用者的硬限制。
         *
         * 這很重要：
         *
         * 使用者說：
         * 「黑暗，但不要過度暗沉」
         *
         * C 可以比 B 深，
         * 但不能深到違反「不要太暗」。
         */
        $target = $this->applyConstraints(
            $target,
            $constraints
        );

        /*
         * 最後再保證所有數值
         * 都沒有超出安全範圍。
         */
        $target = $this->normalizeTarget(
            $target
        );

        return [
            /*
             * 固定方向 ID。
             *
             * 以後 app.js：
             *
             * selectedBranch = "B"
             *
             * 就是真的 B，
             * 不會再因為 K-means 重新分群改變。
             */
            'code' => $code,

            /*
             * 程式內部角色名稱。
             */
            'role' =>
                $this->roleFor($code),

            /*
             * 暫時提供前台名稱。
             *
             * 之後也可以再讓語意層產生
             * 更符合使用者描述的名稱。
             */
            'name' =>
                $this->nameFor($code),

            'description' =>
                $this->descriptionFor($code),

            /*
 * Branch 的語意探索方向。
 *
 * 現在先建立結構，
 * 下一步再由使用者 concepts /
 * search_facets 動態填入。
 *
 * 不取代 target_profile，
 * 而是與 tone bias 並存。
 */
            'semantic_direction' =>
                $this->semanticDirectionFor(
                    $code,
                    $concepts
                ),

            'target_profile' =>
                $target,

            /*
             * 暫時共用 Base 的權重。
             */
            'feature_weights' =>
                $featureWeights,

            /*
             * A/B/C 都必須遵守
             * 使用者原本的硬限制。
             */
            'constraints' =>
                $constraints,

            /*
             * 記錄：
             *
             * 此方向到底比 Base 改了多少。
             *
             * 後面 SearchPlanner
             * 可以利用這個資料生成
             * branch-specific 搜尋詞。
             */
            'delta_from_base' =>
                $this->deltaFromBase(
                    $baseTarget,
                    $target
                ),
        ];
    }

    /**
     * A/B/C 的核心差異。
     *
     * A：
     * 比 Base 更明亮、柔和、輕盈。
     *
     * B：
     * 完整保留 Base，
     * 最接近使用者原始需求。
     *
     * C：
     * 比 Base 更深、對比更明顯、
     * 視覺重量更高。
     *
     * @param array<string,float> $base
     *
     * @return array<string,float>
     */
    private function applyPreset(
        string $code,
        array $base
    ): array {
        /*
         * 一定先複製 Base。
         *
         * 不可以直接修改原本的 Base Target。
         */
        $target = $base;

        /*
         * -------------------------
         * A｜柔亮延伸
         * -------------------------
         */
        if ($code === 'A') {
            /*
             * 明度稍微提高。
             */
            $target['meanLightness'] += 0.08;

            /*
             * 色度稍微降低，
             * 避免太鮮豔。
             */
            $target['meanChroma'] -= 0.02;

            /*
             * 對比降低。
             */
            $target['contrast'] -= 0.08;

            /*
             * 畫面重量降低。
             */
            $target['visualWeight'] -= 0.08;

            /*
             * 中性色比例增加。
             */
            $target['neutralRatio'] += 0.08;

            /*
             * 深色區比例降低。
             */
            $target['darkRatio'] -= 0.07;

            /*
             * 冷暖稍微靠近中性。
             *
             * 例如：
             *
             * Base = +0.40 偏暖
             * A = +0.30
             *
             * 不會突然把暖色翻成冷色。
             */
            $target['temperature'] *= 0.75;

            return $target;
        }

        /*
         * -------------------------
         * C｜深沉聚焦
         * -------------------------
         */
        if ($code === 'C') {
            /*
             * 明度降低。
             */
            $target['meanLightness'] -= 0.08;

            /*
             * 色度稍微增加。
             *
             * 只增加一點，
             * 不要讓方向直接變成高彩度。
             */
            $target['meanChroma'] += 0.015;

            /*
             * 對比提高。
             */
            $target['contrast'] += 0.10;

            /*
             * 視覺重量提高。
             */
            $target['visualWeight'] += 0.10;

            /*
             * 中性色比例稍微降低。
             */
            $target['neutralRatio'] -= 0.06;

            /*
             * 深色區增加。
             */
            $target['darkRatio'] += 0.08;

            /*
             * 加強 Base 原本的冷暖方向。
             *
             * Base 是暖：
             * C 更暖一些。
             *
             * Base 是冷：
             * C 更冷一些。
             *
             * 不會自行改變方向。
             */
            $target['temperature'] *= 1.15;

            return $target;
        }

        /*
         * -------------------------
         * B｜核心平衡
         * -------------------------
         *
         * B 不做任何位移。
         *
         * 它就是 ColorRuleEngine
         * 算出來的共同色彩中心。
         */
        return $target;
    }

    /**
     * 套用 ColorRuleEngine 的限制。
     *
     * 這版特別做成可以接受幾種格式，
     * 方便配合你目前的 constraints。
     *
     * 支援例如：
     *
     * [
     *     'feature' => 'darkRatio',
     *     'operator' => '<=',
     *     'value' => 0.72
     * ]
     *
     * 或：
     *
     * [
     *     'key' => 'meanLightness',
     *     'min' => 0.26
     * ]
     *
     * 或：
     *
     * [
     *     'metric' => 'contrast',
     *     'max' => 0.65
     * ]
     *
     * @param array<string,float> $target
     * @param array<int,mixed> $constraints
     *
     * @return array<string,float>
     */
    private function applyConstraints(
        array $target,
        array $constraints
    ): array {
        foreach ($constraints as $constraint) {
            if (!is_array($constraint)) {
                continue;
            }

            /*
             * 找到 constraint 是限制哪個特徵。
             */
            $feature =
                $this->constraintFeature(
                    $constraint
                );

            /*
             * 找不到，或不是 BranchBuilder
             * 認識的數值特徵，就跳過。
             */
            if (
                $feature === null
                || !array_key_exists(
                    $feature,
                    $target
                )
            ) {
                continue;
            }

            $value =
                (float) $target[$feature];

            /*
             * -------------------------
             * min
             * -------------------------
             */
            if (
                isset($constraint['min'])
                && is_numeric(
                    $constraint['min']
                )
            ) {
                $value = max(
                    $value,
                    (float) $constraint['min']
                );
            }

            /*
             * -------------------------
             * max
             * -------------------------
             */
            if (
                isset($constraint['max'])
                && is_numeric(
                    $constraint['max']
                )
            ) {
                $value = min(
                    $value,
                    (float) $constraint['max']
                );
            }

            /*
             * -------------------------
             /*
 * ColorRuleEngine 目前正式使用：
 *
 * mode = minimum
 * → 此 feature 最低不能小於 threshold
 *
 * mode = maximum
 * → 此 feature 最高不能大於 threshold
 */
$mode = trim(
    (string) (
        $constraint['mode']
        ?? ''
    )
);

$thresholdRaw =
    $constraint['threshold']
    ?? null;

if (
    $mode !== ''
    && is_numeric($thresholdRaw)
) {
    $threshold =
        (float) $thresholdRaw;

    /*
     * minimum：
     * 數值最低不能低於 threshold。
     *
     * 例如：
     * meanLightness >= 0.46
     */
    if ($mode === 'minimum') {
        $value = max(
            $value,
            $threshold
        );
    }

    /*
     * maximum：
     * 數值最高不能超過 threshold。
     *
     * 例如：
     * darkRatio <= 0.38
     */
    elseif ($mode === 'maximum') {
        $value = min(
            $value,
            $threshold
        );
    }
}

            /*
             * 再做一次安全 Clamp。
             */
            $target[$feature] =
                $this->clampFeature(
                    $feature,
                    $value
                );
        }

        return $target;
    }

    /**
     * 找 constraint 指的是哪個感知特徵。
     *
     * @param array<string,mixed> $constraint
     */
    private function constraintFeature(
        array $constraint
    ): ?string {
        /*
         * 因為現在 ColorRuleEngine
         * constraints 的欄位命名可能還會調整，
         * 這裡同時接受：
         *
         * feature
         * key
         * metric
         */
        foreach (
            [
                'feature',
                'key',
                'metric',
            ] as $field
        ) {
            $value = trim(
                (string) (
                    $constraint[$field]
                    ?? ''
                )
            );

            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    /**
     * 整理 Target。
     *
     * 作用：
     *
     * 1. 補缺少欄位
     * 2. 轉 float
     * 3. 防止數值超界
     *
     * @param array<string,mixed> $target
     *
     * @return array<string,float>
     */
    private function normalizeTarget(
        array $target
    ): array {
        $normalized = [];

        foreach (
            self::DEFAULT_TARGET
            as $feature => $fallback
        ) {
            $raw =
                $target[$feature]
                ?? $fallback;

            $value =
                is_numeric($raw)
                    ? (float) $raw
                    : $fallback;

            $normalized[$feature] =
                $this->clampFeature(
                    $feature,
                    $value
                );
        }

        return $normalized;
    }

    /**
     * 計算每個 branch
     * 相對 Base 的實際差值。
     *
     * 例如：
     *
     * Base meanLightness = 0.50
     * A    meanLightness = 0.58
     *
     * delta = +0.08
     *
     * @param array<string,float> $base
     * @param array<string,float> $target
     *
     * @return array<string,float>
     */

    //以下:這個 Branch 相對 Base 到底移動多少。
    private function deltaFromBase(
        array $base,
        array $target
    ): array {
        $delta = [];

        foreach (
            self::DEFAULT_TARGET
            as $feature => $_
        ) {
            $delta[$feature] =
                round(
                    (
                        $target[$feature]
                        ?? 0.0
                    )
                    -
                    (
                        $base[$feature]
                        ?? 0.0
                    ),
                    4
                );
        }

        return $delta;
    }

    /**
     * 根據每個 feature 自己的範圍做 clamp。
     */
    private function clampFeature(
        string $feature,
        float $value
    ): float {
        [$min, $max] =
            self::FEATURE_RANGES[$feature]
            ?? [0.0, 1.0];

        return $this->clamp(
            $value,
            (float) $min,
            (float) $max
        );
    }

    /**
     * 程式內部的方向角色。
     */
    /**
 * Branch 的語意探索角色。
 *
 * 注意：
 * 這裡目前只定義「角色」，cccccccccccccccccccccccc
 * 不把 Y2K、summer 等具體風格寫死。
 *
 * 下一階段會由 concepts /
 * search_facets 動態產生真正內容。
 *
 * @return array<string,mixed>
 */
/**
 * Branch 的語意探索角色。
 *
 * 現在只建立 A / B / C 的角色結構。
 * 下一階段再由 concepts / search_facets
 * 動態填入真正的主題子風格。
 *
 * @return array<string,mixed>
 */
/**
 * 建立 Branch 的語意探索方向。
 *
 * 目前先從 SemanticInterpreter 已經產生的
 * search_facets.style_terms 取得候選詞。
 *
 * A：
 * 使用第一組 style term。
 *
 * B：
 * 保留核心需求，不額外指定子方向。
 *
 * C：
 * 使用另一組 style term。
 *
 * 如果 style_terms 不足，
 * 不強迫硬塞不存在的方向。
 *
 * @param array<int,mixed> $concepts
 *
 * @return array<string,mixed>
 */
private function semanticDirectionFor(
    string $code,
    array $concepts
): array {
    $styleTerms = [];

    /*
     * 收集所有 concept 的 style_terms。
     */
    foreach ($concepts as $concept) {
        if (!is_array($concept)) {
            continue;
        }

        $facets =
            is_array(
                $concept['search_facets']
                ?? null
            )
                ? $concept['search_facets']
                : [];

        $terms =
            is_array(
                $facets['style_terms']
                ?? null
            )
                ? $facets['style_terms']
                : [];

        foreach ($terms as $term) {
            $term =
                trim(
                    (string) $term
                );

            if ($term === '') {
                continue;
            }

            $styleTerms[] =
                $term;
        }
    }

    /*
     * 移除重複詞。
     */
    $styleTerms =
        array_values(
            array_unique(
                $styleTerms
            )
        );

    /*
     * B：
     * 保留核心方向。
     *
     * 不額外塞入子風格，
     * 避免 B 偏離使用者原始需求。
     */
    if ($code === 'B') {
        return [
            'type' =>
                'core',

            'terms' =>
                [],
        ];
    }

    /*
     * A：
     * 第一個可用的 style term。
     */
    if ($code === 'A') {
        return [
            'type' =>
                'alternative_1',

            'terms' =>
                isset($styleTerms[0])
                    ? [$styleTerms[0]]
                    : [],
        ];
    }

    /*
     * C：
     * 使用第二個不同的 style term。
     *
     * 如果目前只有一個，
     * 就先保持空白，
     * 不假裝存在第二種風格。
     */
    $cTerms = [];

if (isset($styleTerms[2])) {
    $cTerms = [
        $styleTerms[2],
    ];
} elseif (isset($styleTerms[1])) {
    $cTerms = [
        $styleTerms[1],
    ];
}

return [
    'type' =>
        'alternative_2',

    'terms' =>
        $cTerms,
];
}


/**
 * 程式內部的方向角色。
 */
private function roleFor(
    string $code
): string {
    return match ($code) {
        'A' =>
            'alternative_1',

        'C' =>
            'alternative_2',

        default =>
            'core',
    };
}


/**
 * 暫時的前台名稱。
 *
 * 這不是最終動態命名。
 */
private function nameFor(
    string $code
): string {
    return match ($code) {
        'A' =>
            '探索方向 A',

        'C' =>
            '探索方向 C',

        default =>
            '核心方向',
    };
}


/**
 * 暫時的方向說明。
 */
private function descriptionFor(
    string $code
): string {
    return match ($code) {
        'A' =>
            '從核心需求延伸出的第一個視覺探索方向，保留既有色調偏移，同時預留主題子風格。',

        'C' =>
            '從核心需求延伸出的第二個視覺探索方向，保留既有色調偏移，同時預留主題子風格。',

        default =>
            '保留 ColorRuleEngine 的共同色彩中心，作為最接近原始需求的核心方向。',
    };
}

    /**
     * 一般數值 Clamp。
     */
    private function clamp(
        float $value,
        float $min,
        float $max
    ): float {
        return min(
            $max,
            max(
                $min,
                $value
            )
        );
    }
}