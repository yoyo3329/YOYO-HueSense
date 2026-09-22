<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

/*
 * derive.php 只負責接收前端 POST。
 */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode(
        [
            'ok' => false,
            'message' => '只接受 POST 請求。',
        ],
        JSON_UNESCAPED_UNICODE
    );

    exit;
}

/*
 * 載入目前 HueSense 三個核心處理器。
 *
 * ColorRuleEngine：
 * concepts → Base Target
 *
 * BranchBuilder：
 * Base Target → A / B / C
 *
 * SearchPlanner：
 * A / B / C → 各自的搜尋詞
 */
require_once __DIR__ . '/../src/SearchPlanner.php';
require_once __DIR__ . '/../src/ColorRuleEngine.php';
require_once __DIR__ . '/../src/BranchBuilder.php';
require_once __DIR__ . '/../src/ConceptSanitizer.php';

try {
    /*
     * -------------------------
     * 1. 讀取前端 JSON
     * -------------------------
     */
    $payload = readJsonBody();
    $conceptSanitizer =
    new ConceptSanitizer();
    /*
     * app.js 目前送的是：
     *
     * {
     *   concepts: [...]
     * }
     *
     * 同時保留 interpretation.concepts
     * 作為相容入口。
     */
    $concepts =
    $conceptSanitizer->sanitize(
        $payload['concepts']
        ?? $payload['interpretation']['concepts']
        ?? []
    );

    if ($concepts === []) {
        throw new InvalidArgumentException(
            '至少需要保留一個可用概念。'
        );
    }

    /*
     * -------------------------
     * 2. 建立處理器
     * -------------------------
     */
    $ruleEngine =
        new ColorRuleEngine();

    $branchBuilder =
        new BranchBuilder();

    $planner =
        new SearchPlanner();

    /*
     * -------------------------
     * 3. ColorRuleEngine
     *
     * concepts
     * ↓
     * Base Target
     * -------------------------
     */
    $derived =
        $ruleEngine->derive(
            $concepts
        );

    /*
     * $derived 目前包含：
     *
     * target_profile
     * feature_weights
     * constraints
     * exclusion_terms
     * applied_rules
     */

    /*
     * -------------------------
     * 4. BranchBuilder
     *
     * Base Target
     * ↓
     * A / B / C
     * -------------------------
     */
    $branchData =
        $branchBuilder->build(
            $derived
        );

    /*
     * $branchData：
     *
     * [
     *   'base_target' => [...],
     *
     *   'branches' => [
     *      'A' => [...],
     *      'B' => [...],
     *      'C' => [...],
     *   ]
     * ]
     */

    /*
     * -------------------------
     * 5. SearchPlanner
     *
     * A / B / C
     * ↓
     * 各自的 SearchPlan
     * -------------------------
     */
    $branches =
        $planner->buildBranches(
            $concepts,
            $branchData['branches']
            ?? []
        );

    /*
     * -------------------------
     * 6. 舊版 app.js 相容
     * -------------------------
     *
     * 現在 app.js 還只會讀：
     *
     * data.search_plan
     *
     * 所以在前端還沒改成
     * branches.A/B/C 以前，
     * 暫時讓 search_plan 顯示 B。
     *
     * B 是目前最接近
     * 使用者原始需求的核心方向。
     */
    $legacySearchPlan =
        is_array(
            $branches['B']['search_plan']
            ?? null
        )
            ? $branches['B']['search_plan']
            : $planner->build(
                $concepts
            );

    /*
     * -------------------------
     * 7. 回傳 JSON
     * -------------------------
     */
    echo json_encode(
        [
            'ok' => true,

            /*
             * 清理後的完整 concepts。
             *
             * 這裡會保留：
             *
             * search_facets
             * priority_status
             * color_mapping_status
             * apply_to_anchor_rules
             * apply_to_visual_filter
             * retrieval_mode
             */
            'concepts' =>
                $concepts,

            /*
             * -----------------
             * 新架構資料
             * -----------------
             */

            /*
             * ColorRuleEngine
             * 算出的共同數值中心。
             */
            'base_target' =>
                $branchData[
                    'base_target'
                ]
                ?? [],

            /*
             * A / B / C。
             *
             * 每個 Branch 已包含：
             *
             * code
             * role
             * name
             * description
             * target_profile
             * feature_weights
             * constraints
             * delta_from_base
             * search_plan
             * visual_tags
             * excluded_visual_tags
             */
            'branches' =>
                $branches,

            /*
             * -----------------
             * 舊版相容資料
             * -----------------
             *
             * app.js 現在仍會讀
             * target_profile。
             *
             * 暫時保留，
             * 等 app.js 改成 branch 架構
             * 再移除。
             */
            'target_profile' =>
                $derived[
                    'target_profile'
                ]
                ?? [],

            /*
             * 舊版 app.js
             * 仍讀單一 search_plan。
             *
             * 暫時使用 B。
             */
            'search_plan' =>
                $legacySearchPlan,

            /*
             * ColorRuleEngine
             * 原本的其他資料。
             */
            'feature_weights' =>
                $derived[
                    'feature_weights'
                ]
                ?? [],

            'constraints' =>
                $derived[
                    'constraints'
                ]
                ?? [],

            'exclusion_terms' =>
                $derived[
                    'exclusion_terms'
                ]
                ?? [],

            'applied_rules' =>
                $derived[
                    'applied_rules'
                ]
                ?? [],
        ],

        JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
    );

} catch (InvalidArgumentException $error) {
    /*
     * 使用者傳入資料不完整。
     */
    http_response_code(422);

    echo json_encode(
        [
            'ok' => false,
            'message' =>
                $error->getMessage(),
        ],
        JSON_UNESCAPED_UNICODE
    );

} catch (Throwable $error) {
    /*
     * 程式本身發生例外。
     */
    http_response_code(500);

    echo json_encode(
        [
            'ok' => false,
            'message' =>
                $error->getMessage(),
        ],
        JSON_UNESCAPED_UNICODE
    );
}

/**
 * 讀取前端 POST JSON。
 *
 * @return array<string,mixed>
 */
function readJsonBody(): array
{
    $raw =
        file_get_contents(
            'php://input'
        );

    if (
        $raw === false
        || trim($raw) === ''
    ) {
        return [];
    }

    $decoded =
        json_decode(
            $raw,
            true
        );

    if (!is_array($decoded)) {
        throw new InvalidArgumentException(
            '請求資料格式錯誤。'
        );
    }

    return $decoded;
}

/**
 * 清理 SemanticInterpreter 傳入的 concepts，
 * 並保留新版搜尋與驗證流程需要的欄位。
 *
 * @param mixed $rawConcepts
 * @return array<int,array<string,mixed>>
 */


/**
 * 清理英文搜尋詞。
 *
 * 每一個搜尋片段
 * 最多保留 3 個單字。
 */
