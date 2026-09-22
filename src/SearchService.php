<?php

declare(strict_types=1);

require_once __DIR__ . '/ServiceFactory.php';
require_once __DIR__ . '/SemanticInterpreter.php';
require_once __DIR__ . '/SearchPlanner.php';
require_once __DIR__ . '/ColorRuleEngine.php';
require_once __DIR__ . '/BranchBuilder.php';
require_once __DIR__ . '/ContentSemanticValidator.php';
require_once __DIR__ . '/ConceptSanitizer.php';

final class SearchService
{
    private array $config;

    private array $searchConfig;

    private array $analysisConfig;

    private ConceptSanitizer $conceptSanitizer;

    private SearchPlanner $planner;

    private ColorRuleEngine $ruleEngine;

    private BranchBuilder $branchBuilder;

    private ContentSemanticValidator $contentValidator;


    public function __construct(
        array $config
    ) {
        /*
         * 整個網站的設定
         */
        $this->config =
            $config;


        /*
         * 搜尋相關設定
         */
        $this->searchConfig =
            is_array(
                $config['search']
                ?? null
            )
                ? $config['search']
                : [];


        /*
         * 圖片分析相關設定
         */
        $this->analysisConfig =
            is_array(
                $config['analysis']
                ?? null
            )
                ? $config['analysis']
                : [];


        /*
         * Concept 清洗工具
         */
        $this->conceptSanitizer =
            new ConceptSanitizer();


        /*
         * 搜尋計畫工具
         */
        $this->planner =
            new SearchPlanner();


        /*
         * 色彩規則工具
         */
        $this->ruleEngine =
            new ColorRuleEngine();


        /*
         * 建立 A / B / C Branch
         */
        $this->branchBuilder =
            new BranchBuilder();


        /*
         * 圖片內容驗證
         */
        $this->contentValidator =
            new ContentSemanticValidator();
    }


    /**
     * 整次圖片搜尋的主要入口。
     *
     * 之後會把 api/search.php
     * 原本的搜尋流程搬到這裡。
     *
     * @param array<string,mixed> $payload
     *
     * @return array<string,mixed>
     */
    public function search(array $payload): array
{
    /*
     * -------------------------
     * 1. 使用者搜尋文字 q
     * -------------------------
     */
    $input =
        trim(
            (string) (
                $payload['q']
                ?? ''
            )
        );


    /*
     * -------------------------
     * 2. Branch
     * -------------------------
     *
     * 如果前端沒有送 branch_id，
     * 預設使用 B。
     */
    $branchId =
        strtoupper(
            trim(
                (string) (
                    $payload['branch_id']
                    ?? 'B'
                )
            )
        );


    /*
     * 只允許 A / B / C。
     */
    if (
        !in_array(
            $branchId,
            ['A', 'B', 'C'],
            true
        )
    ) {
        throw new InvalidArgumentException(
            'branch_id 只接受 A、B 或 C。'
        );
    }


    /*
     * -------------------------
     * 3. 頁數 page
     * -------------------------
     *
     * 最小只能是第 1 頁。
     */
    $page =
        max(
            1,
            (int) (
                $payload['page']
                ?? 1
            )
        );


    /*
     * -------------------------
     * 4. 每頁張數設定
     * -------------------------
     */
    $defaultPerPage =
        max(
            1,
            (int) (
                $this->searchConfig[
                    'default_per_page'
                ]
                ?? 30
            )
        );

    $minPerPage =
        max(
            1,
            (int) (
                $this->searchConfig[
                    'min_per_page'
                ]
                ?? 12
            )
        );

    $maxPerPage =
        max(
            $minPerPage,
            (int) (
                $this->searchConfig[
                    'max_per_page'
                ]
                ?? 36
            )
        );


    /*
     * 前端要求的 per_page。
     *
     * 不能低於 minPerPage，
     * 也不能超過 maxPerPage。
     */
    $requestedPerPage =
        min(
            $maxPerPage,
            max(
                $minPerPage,
                (int) (
                    $payload['per_page']
                    ?? $defaultPerPage
                )
            )
        );


    /*
     * -------------------------
     * 5. 搜尋文字最大長度
     * -------------------------
     */
    $maxLength =
        max(
            1,
            (int) (
                $this->searchConfig[
                    'input_max_length'
                ]
                ?? 300
            )
        );


    /*
     * -------------------------
     * 6. 驗證：不能空白
     * -------------------------
     */
    if ($input === '') {
        throw new InvalidArgumentException(
            '請輸入你想搜尋的專案、場景或視覺感受。'
        );
    }


    /*
     * -------------------------
     * 7. 驗證：不能超過最大字數
     * -------------------------
     */
    if (
        $this->utf8Length($input)
        > $maxLength
    ) {
        throw new InvalidArgumentException(
            sprintf(
                '描述請控制在 %d 個字以內。',
                $maxLength
            )
        );
    }


    /*
     * -------------------------
     * 暫時測試回傳
     * -------------------------
     *
     * 現在還沒開始真正搜尋圖片。
     */
    /*
 * -------------------------
 * 8. 清理前端傳入的 concepts
 * -------------------------
 */
$concepts =
    $this->conceptSanitizer->sanitize(
        $payload['interpretation']['concepts']
        ?? $payload['concepts']
        ?? []
    );


/*
 * -------------------------
 * 9. 如果前端沒有可用 concepts
 * -------------------------
 *
 * 就交給 SemanticInterpreter
 * 分析使用者原始搜尋文字。
 */
if ($concepts === []) {

    $interpreter =
        new SemanticInterpreter(
            ServiceFactory::openRouter(
                $this->config
            )
        );

    $interpretation =
        $interpreter->interpret(
            $input
        );


    /*
     * AI 回傳的 concepts
     * 也必須再經過一次
     * ConceptSanitizer。
     */
    $concepts =
        $this->conceptSanitizer->sanitize(
            $interpretation['concepts']
            ?? []
        );

} else {

    /*
     * 如果前端本來就已經送了
     * 確認過的 concepts，
     * 就不用重新呼叫 AI。
     */
    $interpretation = [
        'input' =>
            $input,

        'summary' =>
            trim(
                (string) (
                    $payload['interpretation']['summary']
                    ?? '已使用確認後的語意概念搜尋。'
                )
            ),

        'overall_confidence' =>
            (float) (
                $payload['interpretation']['overall_confidence']
                ?? 1
            ),

        'source' =>
            (string) (
                $payload['interpretation']['source']
                ?? 'user_confirmed'
            ),

        'notice' =>
            '',

        'concepts' =>
            $concepts,
    ];
}


/*
 * -------------------------
 * 10. 最後還是沒有 concepts
 * -------------------------
 */
if ($concepts === []) {
    throw new InvalidArgumentException(
        '沒有可用的搜尋概念，請修改描述後重新解析。'
    );
}
/*
 * -------------------------
 * 11. concepts
 * ↓
 * ColorRuleEngine
 * ↓
 * Base Target
 * -------------------------
 */
$derived =
    $this->ruleEngine->derive(
        $concepts
    );


/*
 * -------------------------
 * 12. Base Target
 * ↓
 * BranchBuilder
 * ↓
 * A / B / C
 * -------------------------
 */
$branchData =
    $this->branchBuilder->build(
        $derived,
        $concepts
    );


/*
 * -------------------------
 * 13. A / B / C
 * ↓
 * SearchPlanner
 * ↓
 * 各自建立 search_plan
 * -------------------------
 */
$branches =
    $this->planner->buildBranches(
        $concepts,
        $branchData['branches']
        ?? []
    );


/*
 * -------------------------
 * 14. 找到這次指定的 Branch
 * -------------------------
 *
 * 前面已經有：
 *
 * $branchId = A / B / C
 *
 * 所以現在從全部 branches
 * 取出這次真正要用的那一組。
 */
$selectedBranch =
    $branches[$branchId]
    ?? null;


if (!is_array($selectedBranch)) {
    throw new RuntimeException(
        '無法建立指定的搜尋方向：'
        . $branchId
    );
}


/*
 * -------------------------
 * 15. 取得目前 Branch 的 SearchPlan
 * -------------------------
 */
$searchPlan =
    is_array(
        $selectedBranch[
            'search_plan'
        ]
        ?? null
    )
        ? $selectedBranch[
            'search_plan'
        ]
        : [];


/*
 * 如果最後完全沒有搜尋詞，
 * 就停止。
 */
if ($searchPlan === []) {
    throw new InvalidArgumentException(
        '無法建立搜尋線索，請補充具體主題、場景或氣氛。'
    );
}
/*
 * -------------------------
 * 16. 建立已啟用的圖片來源
 * -------------------------
 *
 * 目前可能包含：
 * Unsplash
 * Pexels
 * Pixabay
 */
$providers =
    ServiceFactory::photoProviders(
        $this->config
    );


/*
 * 啟用的圖片來源數量。
 */
$providerCount =
    max(
        1,
        count($providers)
    );


/*
 * -------------------------
 * 17. 每條 SearchPlan
 * 要向每個圖庫抓多少張
 * -------------------------
 */
$perQueryMin =
    max(
        1,
        (int) (
            $this->searchConfig[
                'per_query_min'
            ]
            ?? 8
        )
    );

$perQueryMax =
    max(
        $perQueryMin,
        (int) (
            $this->searchConfig[
                'per_query_max'
            ]
            ?? 18
        )
    );

$perQueryExtra =
    max(
        0,
        (int) (
            $this->searchConfig[
                'per_query_extra'
            ]
            ?? 2
        )
    );


/*
 * 多個圖庫同時搜尋時，
 * 把每條 query 要抓的圖片數量
 * 平均分配。
 */
$perQuery =
    min(
        $perQueryMax,
        max(
            $perQueryMin,

            (int) ceil(
                $requestedPerPage
                / count($searchPlan)
                / $providerCount
            )
            + $perQueryExtra
        )
    );


/*
 * -------------------------
 * 18. 各圖庫權重
 * -------------------------
 */
$providerWeights =
    is_array(
        $this->searchConfig[
            'provider_weights'
        ]
        ?? null
    )
        ? $this->searchConfig[
            'provider_weights'
        ]
        : [];


/*
 * -------------------------
 * 19. 搜尋過程暫存
 * -------------------------
 */

/*
 * 所有圖庫圖片最後會合併到這裡。
 *
 * key = photo id
 */
$merged = [];


/*
 * 記錄每一條 SearchPlan
 * 實際搜尋狀況。
 */
$queryReports = [];


/*
 * 記錄圖庫 API 錯誤。
 */
$providerErrors = [];


/*
 * 記錄所有圖庫中最大的總頁數。
 */
$maxPages = 1;


/*
 * -------------------------
 * 20. 執行 SearchPlan
 * -------------------------
 */
foreach (
    $searchPlan
    as $planIndex => $plan
) {

    /*
     * 取得目前這一條搜尋詞。
     */
    $query =
        trim(
            (string) (
                $plan['query']
                ?? ''
            )
        );


    /*
     * 沒有搜尋詞就跳過。
     */
    if ($query === '') {
        continue;
    }


    /*
     * 這條 SearchPlan 的權重。
     */
    $queryWeight =
        max(
            0.01,
            (float) (
                $plan['weight']
                ?? (
                    1
                    / count($searchPlan)
                )
            )
        );


    /*
     * 建立這條搜尋詞的報告。
     */
    $queryReport = [
        'id' =>
            (string) (
                $plan['id']
                ?? (
                    'query_'
                    . ($planIndex + 1)
                )
            ),

        'query' =>
            $query,

        'label' =>
            (string) (
                $plan['label']
                ?? ''
            ),

        'weight' =>
            round(
                $queryWeight,
                4
            ),

        'branch_code' =>
            $branchId,

        'query_family' =>
            (string) (
                $plan['query_family']
                ?? 'core'
            ),

        'exploration_type' =>
            (string) (
                $plan['exploration_type']
                ?? 'core'
            ),

        'theme_elements' =>
            is_array($plan['theme_elements'] ?? null)
                ? $plan['theme_elements']
                : [],

        'total' =>
            0,

        'returned' =>
            0,

        'providers' =>
            [],
    ];


    /*
     * -------------------------
     * 21. 同一條 query
     * 依序搜尋所有圖庫
     * -------------------------
     */
    foreach (
        $providers
        as $providerName => $client
    ) {

        /*
         * 圖庫自己的權重。
         */
        $providerWeight =
            max(
                0.01,
                (float) (
                    $providerWeights[
                        $providerName
                    ]
                    ?? 1.0
                )
            );


        /*
         * -------------------------
         * 真正呼叫圖片 API
         * -------------------------
         */
        try {

            $data =
                $client->searchPhotos(
                    $query,
                    $page,
                    $perQuery
                );

        } catch (
            Throwable $providerError
        ) {

            /*
             * 某個圖庫失敗，
             * 不讓整次搜尋立即死亡。
             */
            $providerErrors[] = [
                'provider' =>
                    $providerName,

                'query' =>
                    $query,

                'message' =>
                    $providerError
                        ->getMessage(),
            ];


            $queryReport[
                'providers'
            ][] = [
                'provider' =>
                    $providerName,

                'total' =>
                    0,

                'returned' =>
                    0,

                'error' =>
                    $providerError
                        ->getMessage(),
            ];


            continue;
        }


        /*
         * -------------------------
         * 22. 記錄 API 搜尋資訊
         * -------------------------
         */
        $providerTotal =
            (int) (
                $data['total']
                ?? 0
            );

        $providerReturned =
            count(
                $data['results']
                ?? []
            );


        /*
         * 找出所有圖庫中
         * 最大的 total_pages。
         */
        $maxPages =
            max(
                $maxPages,
                (int) (
                    $data[
                        'total_pages'
                    ]
                    ?? 1
                )
            );


        $queryReport['total'] +=
            $providerTotal;

        $queryReport['returned'] +=
            $providerReturned;


        $queryReport[
            'providers'
        ][] = [
            'provider' =>
                $providerName,

            'total' =>
                $providerTotal,

            'returned' =>
                $providerReturned,

            'error' =>
                '',
        ];


        /*
         * -------------------------
         * 23. 將圖片放進 merged
         * -------------------------
         */
        foreach (
            $data['results']
            ?? []
            as $rankIndex => $photo
        ) {

            if (!is_array($photo)) {
                continue;
            }


            /*
             * 每張圖片必須有 id。
             */
            $photoId =
                (string) (
                    $photo['id']
                    ?? ''
                );


            if ($photoId === '') {
                continue;
            }


            /*
             * 第一次看到這張圖，
             * 先建立資料。
             */
            if (
                !isset(
                    $merged[$photoId]
                )
            ) {
                $merged[$photoId] = [
                    'photo' =>
                        $photo,

                    'weighted_rank_sum' =>
                        0.0,

                    'hit_count' =>
                        0,

                    'query_hits' =>
                        [],
                ];
            }


            /*
             * -------------------------
             * 圖庫排名分數
             * -------------------------
             *
             * 排名越前面的圖片，
             * rankScore 越高。
             */
            $rank =
                $rankIndex + 1;

            $rankScore =
                1
                / sqrt($rank);


            /*
             * 累積：
             *
             * SearchPlan 權重
             * ×
             * 圖庫權重
             * ×
             * 圖片排名
             */
            $merged[
                $photoId
            ][
                'weighted_rank_sum'
            ] +=
                $queryWeight
                * $providerWeight
                * $rankScore;


            /*
             * 這張圖總共被幾條 query 找到。
             */
            $merged[
                $photoId
            ][
                'hit_count'
            ] += 1;


            /*
             * 記錄它是被哪一條 query 找到。
             */
            $merged[
                $photoId
            ][
                'query_hits'
            ][] = [
                'query_id' =>
                    (string) (
                        $plan['id']
                        ?? (
                            'query_'
                            . ($planIndex + 1)
                        )
                    ),

                'branch_code' =>
                    $branchId,

                'query_family' =>
                    (string) (
                        $plan['query_family']
                        ?? 'core'
                    ),

                'exploration_type' =>
                    (string) (
                        $plan['exploration_type']
                        ?? 'core'
                    ),

                'theme_elements' =>
                    is_array($plan['theme_elements'] ?? null)
                        ? $plan['theme_elements']
                        : [],

                'provider' =>
                    $providerName,

                'rank' =>
                    $rank,

                'weight' =>
                    round(
                        $queryWeight,
                        4
                    ),

                'provider_weight' =>
                    round(
                        $providerWeight,
                        4
                    ),
            ];
        }
    }


    /*
     * 完成這條 query，
     * 保存搜尋報告。
     */
    $queryReports[] =
        $queryReport;
}


/*
 * -------------------------
 * 24. 完全沒有候選圖片
 * -------------------------
 */
if ($merged === []) {

    /*
     * 如果原因是 API 出錯，
     * 顯示 API 錯誤。
     */
    if ($providerErrors !== []) {

        $messages =
            array_values(
                array_unique(
                    array_map(
                        static function (
                            array $error
                        ): string {
                            return
                                ucfirst(
                                    (string) (
                                        $error[
                                            'provider'
                                        ]
                                        ?? ''
                                    )
                                )
                                . '：'
                                . (string) (
                                    $error[
                                        'message'
                                    ]
                                    ?? ''
                                );
                        },
                        $providerErrors
                    )
                )
            );


        throw new RuntimeException(
            '圖片 API 搜尋失敗：'
            . implode(
                '；',
                $messages
            )
        );
    }


    /*
     * API 沒壞，
     * 但真的完全沒有圖片。
     */
    throw new RuntimeException(
        '目前已啟用的圖片 API 都沒有回傳候選圖片。'
    );
}
/*
 * -------------------------
 * 25. 計算 Retrieval Score
 * 需要的基準值
 * -------------------------
 */
$totalPlanWeight =
    array_sum(
        array_map(
            static fn(array $plan): float =>
                (float) (
                    $plan['weight']
                    ?? 0
                ),
            $searchPlan
        )
    )
    ?: 1.0;


/*
 * 目前啟用 Provider 中，
 * 找最高的 provider weight。
 */
$activeProviderWeightMax =
    max(
        array_map(
            static fn(
                string $providerName
            ): float =>
                max(
                    0.01,
                    (float) (
                        $providerWeights[
                            $providerName
                        ]
                        ?? 1.0
                    )
                ),
            array_keys($providers)
        )
    );


$semanticDenominator =
    $totalPlanWeight
    * $activeProviderWeightMax;


$planCount =
    max(
        1,
        count($searchPlan)
    );


/*
 * -------------------------
 * 26. Content Gate 統計
 * -------------------------
 */
$contentCheckedCount =
    0;

$contentRejectedCount =
    0;

$contentPassedCount =
    0;

$contentCandidateCount =
    0;


/*
 * PASS 與 CANDIDATE 都會進候選池；
 * 只有 REJECT 才會被淘汰。
 * 最後放進 results。
 */
$results =
    [];

/*
 * 測試階段：
 * 保存被 Content Gate 淘汰的圖片，
 * 方便檢查是否有誤殺。
 */
$rejectedResults =
    [];
/*
 * -------------------------
 * 27. Content Semantic Validation
 * -------------------------
 */
foreach (
    $merged
    as $entry
) {

    $photo =
        $entry['photo'];


    /*
     * 圖庫原始搜尋排名分數。
     */
    $retrievalRankScore =
        min(
            1,
            $entry[
                'weighted_rank_sum'
            ]
            / $semanticDenominator
        );


    /*
     * 同一張圖片被多少條
     * SearchPlan 搜到。
     */
    $queryOverlapScore =
        min(
            1,
            $entry[
                'hit_count'
            ]
            / $planCount
        );


    /*
     * =====================================
     * ContentSemanticValidator
     * =====================================
     *
     * 注意：
     *
     * 這裡不要再：
     *
     * new ContentSemanticValidator()
     *
     * 因為 constructor
     * 已經建立好了。
     */
    $contentValidation =
    $this->contentValidator->validate(
        $photo,
        $concepts,
        [
            /*
             * 這張圖片被哪些 query 搜到。
             */
            'query_hits' =>
                $entry[
                    'query_hits'
                ]
                ?? [],

            /*
             * 目前 Branch 的完整 SearchPlan。
             */
            'search_plan' =>
                $searchPlan,

            /*
             * 目前真正搜尋的 Branch。
             */
            'branch' =>
                $selectedBranch,

            /*
             * SearchService 已經算好的
             * retrieval evidence。
             */
            'retrieval_rank_score' =>
                $retrievalRankScore,

            'query_overlap_score' =>
                $queryOverlapScore,
        ]
    );


    $contentCheckedCount +=
        1;


    $contentRelevanceScore =
        (float) (
            $contentValidation[
                'content_relevance_score'
            ]
            ?? 0
        );


    $contentGateStatus =
        strtoupper(
            trim(
                (string) (
                    $contentValidation['content_gate_status']
                    ?? (
                        ($contentValidation['content_gate_passed'] ?? false)
                            ? 'PASS'
                            : 'REJECT'
                    )
                )
            )
        );

    if (!in_array($contentGateStatus, ['PASS', 'CANDIDATE', 'REJECT'], true)) {
        $contentGateStatus = 'CANDIDATE';
    }

    $contentGatePassed =
        $contentGateStatus !== 'REJECT';


    /*
     * -------------------------
     * Content Gate
     * -------------------------
     *
     * 沒通過就直接淘汰。
     */
   if (!$contentGatePassed) {

    $contentRejectedCount +=
        1;

    /*
     * 測試階段：
     * 被淘汰的圖片不要直接消失，
     * 另外放進 rejected_results。
     */
    $rejectedPhoto =
        $photo;

    $rejectedPhoto[
        'semantic_score'
    ] =
        round(
            $contentRelevanceScore,
            5
        );

    $rejectedPhoto[
        'retrieval_rank_score'
    ] =
        round(
            $retrievalRankScore,
            5
        );

    $rejectedPhoto[
        'query_overlap_score'
    ] =
        round(
            $queryOverlapScore,
            5
        );

    $rejectedPhoto[
        'content_relevance_score'
    ] =
        round(
            $contentRelevanceScore,
            5
        );

    $rejectedPhoto[
        'content_gate_passed'
    ] =
        false;

    $rejectedPhoto[
        'content_gate_status'
    ] =
        'REJECT';

    /*
     * 保存 Validator 的判斷細節。
     */
    $rejectedPhoto[
        'content_validation'
    ] = [
                'metadata_evidence_score' =>
            $contentValidation[
                'metadata_evidence_score'
            ]
            ?? 0,

        'retrieval_evidence_score' =>
            $contentValidation[
                'retrieval_evidence_score'
            ]
            ?? 0,

        'facet_evidence_score' =>
            $contentValidation[
                'facet_evidence_score'
            ]
            ?? 0,

        'theme_element_score' =>
            $contentValidation[
                'theme_element_score'
            ]
            ?? 0,

        'matched_theme_elements' =>
            $contentValidation[
                'matched_theme_elements'
            ]
            ?? [],

        'theme_element_families' =>
            $contentValidation[
                'theme_element_families'
            ]
            ?? [],

        'combined_evidence_score' =>
            $contentValidation[
                'combined_evidence_score'
            ]
            ?? 0,

        'retrieval_rescue_passed' =>
            $contentValidation[
                'retrieval_rescue_passed'
            ]
            ?? false,

        'best_facet_rank_score' =>
            $contentValidation[
                'best_facet_rank_score'
            ]
            ?? 0,

        'facet_hit_count' =>
            $contentValidation[
                'facet_hit_count'
            ]
            ?? 0,

        'independent_query_family_count' =>
            $contentValidation[
                'independent_query_family_count'
            ]
            ?? 0,

        'query_families' =>
            $contentValidation[
                'query_families'
            ]
            ?? [],

        'branch_facet_metadata_matched' =>
            $contentValidation[
                'branch_facet_metadata_matched'
            ]
            ?? false,

        'required_score' =>
            $contentValidation[
                'required_score'
            ]
            ?? 0,

        'preferred_score' =>
            $contentValidation[
                'preferred_score'
            ]
            ?? 0,

        'matched_required_count' =>
            $contentValidation[
                'matched_required_count'
            ]
            ?? 0,

        'required_count' =>
            $contentValidation[
                'required_count'
            ]
            ?? 0,

        'has_excluded_match' =>
            $contentValidation[
                'has_excluded_match'
            ]
            ?? false,

        'required_matches' =>
            $contentValidation[
                'required_matches'
            ]
            ?? [],

        'preferred_matches' =>
            $contentValidation[
                'preferred_matches'
            ]
            ?? [],

        'excluded_matches' =>
            $contentValidation[
                'excluded_matches'
            ]
            ?? [],

        'content_metadata' =>
            $contentValidation[
                'content_metadata'
            ]
            ?? '',
    ];

    /*
     * 保留這張圖片是由哪些 query 搜到的。
     */
    $rejectedPhoto[
        'query_hits'
    ] =
        $entry[
            'query_hits'
        ]
        ?? [];

    $rejectedPhoto[
        'search_branch'
    ] =
        $branchId;

    $rejectedResults[] =
        $rejectedPhoto;

    continue;
}


    /*
     * PASS / CANDIDATE 都保留。
     */
    if ($contentGateStatus === 'PASS') {
        $contentPassedCount += 1;
    } else {
        $contentCandidateCount += 1;
    }


    /*
     * -------------------------
     * 保留現有 app.js
     * 需要的欄位
     * -------------------------
     */
    /*
     * semantic_score 給前端時代表「內容相關度」，
     * 不再拿圖庫原始排名冒充 semantic score。
     */
    $photo['semantic_score'] =
        round(
            $contentRelevanceScore,
            5
        );


    $photo['retrieval_rank_score'] =
        round(
            $retrievalRankScore,
            5
        );


    $photo['query_overlap_score'] =
        round(
            $queryOverlapScore,
            5
        );


    $photo['content_relevance_score'] =
        round(
            $contentRelevanceScore,
            5
        );


    $photo['content_gate_passed'] =
        true;

    $photo['content_gate_status'] =
        $contentGateStatus;


    /*
     * Content Gate 測試資訊。
     */
    $photo['content_validation'] = [

            'metadata_evidence_score' =>
            $contentValidation[
                'metadata_evidence_score'
            ]
            ?? 0,

        'retrieval_evidence_score' =>
            $contentValidation[
                'retrieval_evidence_score'
            ]
            ?? 0,

        'facet_evidence_score' =>
            $contentValidation[
                'facet_evidence_score'
            ]
            ?? 0,

        'theme_element_score' =>
            $contentValidation[
                'theme_element_score'
            ]
            ?? 0,

        'matched_theme_elements' =>
            $contentValidation[
                'matched_theme_elements'
            ]
            ?? [],

        'theme_element_families' =>
            $contentValidation[
                'theme_element_families'
            ]
            ?? [],

        'theme_retrieval_families' =>
            $contentValidation[
                'theme_retrieval_families'
            ]
            ?? [],

        'content_gate_status' =>
            $contentGateStatus,

        'combined_evidence_score' =>
            $contentValidation[
                'combined_evidence_score'
            ]
            ?? 0,

        'retrieval_rescue_passed' =>
            $contentValidation[
                'retrieval_rescue_passed'
            ]
            ?? false,

        'best_facet_rank_score' =>
            $contentValidation[
                'best_facet_rank_score'
            ]
            ?? 0,

        'facet_hit_count' =>
            $contentValidation[
                'facet_hit_count'
            ]
            ?? 0,

        'independent_query_family_count' =>
            $contentValidation[
                'independent_query_family_count'
            ]
            ?? 0,

        'query_families' =>
            $contentValidation[
                'query_families'
            ]
            ?? [],

        'branch_facet_metadata_matched' =>
            $contentValidation[
                'branch_facet_metadata_matched'
            ]
            ?? false,

        'required_score' =>
            $contentValidation[
                'required_score'
            ]
            ?? 0,

        'preferred_score' =>
            $contentValidation[
                'preferred_score'
            ]
            ?? 0,

        'matched_required_count' =>
            $contentValidation[
                'matched_required_count'
            ]
            ?? 0,

        'required_count' =>
            $contentValidation[
                'required_count'
            ]
            ?? 0,

        'has_excluded_match' =>
            $contentValidation[
                'has_excluded_match'
            ]
            ?? false,

        'required_matches' =>
            $contentValidation[
                'required_matches'
            ]
            ?? [],

        'preferred_matches' =>
            $contentValidation[
                'preferred_matches'
            ]
            ?? [],

        'excluded_matches' =>
            $contentValidation[
                'excluded_matches'
            ]
            ?? [],

        'content_metadata' =>
            $contentValidation[
                'content_metadata'
            ]
            ?? '',
    ];


    /*
     * 記錄這張圖是被哪些
     * SearchPlan 找到。
     */
    $photo['query_hits'] =
        $entry['query_hits'];


    /*
     * 記錄目前搜尋 Branch。
     */
    $photo['search_branch'] =
        $branchId;


    /*
     * 通過 Content Gate
     * 才真正進 results。
     */
    $results[] =
        $photo;
}
/*
 * -------------------------
 * 28. Backend Ranking
 * -------------------------
 *
 * 不修改既有設定檔。
 * 這裡在程式層限制 retrieval rank 的支配力，
 * 並加入主題元素分數，讓內容 / 主題優先於圖庫熱門排序。
 */
$backendWeights =
    is_array($this->searchConfig['backend_rank_weights'] ?? null)
        ? $this->searchConfig['backend_rank_weights']
        : [];

$contentWeight =
    max(
        0.50,
        (float) ($backendWeights['content_relevance'] ?? 0.50)
    );

$themeWeight = 0.20;

$retrievalWeight =
    min(
        0.20,
        max(0.0, (float) ($backendWeights['semantic'] ?? 0.20))
    );

$overlapWeight =
    min(
        0.10,
        max(0.0, (float) ($backendWeights['query_overlap'] ?? 0.10))
    );

$totalBackendWeight =
    $contentWeight
    + $themeWeight
    + $retrievalWeight
    + $overlapWeight;

if ($totalBackendWeight <= 0) {
    $contentWeight = 0.50;
    $themeWeight = 0.20;
    $retrievalWeight = 0.20;
    $overlapWeight = 0.10;
    $totalBackendWeight = 1.0;
}

$contentWeight /= $totalBackendWeight;
$themeWeight /= $totalBackendWeight;
$retrievalWeight /= $totalBackendWeight;
$overlapWeight /= $totalBackendWeight;

usort(
    $results,
    static function (array $a, array $b) use (
        $contentWeight,
        $themeWeight,
        $retrievalWeight,
        $overlapWeight
    ): int {
        $score = static function (array $photo) use (
            $contentWeight,
            $themeWeight,
            $retrievalWeight,
            $overlapWeight
        ): float {
            $content = (float) ($photo['content_relevance_score'] ?? 0);
            $theme = (float) ($photo['content_validation']['theme_element_score'] ?? 0);
            $retrieval = (float) ($photo['retrieval_rank_score'] ?? 0);
            $overlap = (float) ($photo['query_overlap_score'] ?? 0);
            $gateStatus = strtoupper((string) ($photo['content_gate_status'] ?? 'CANDIDATE'));

            $gateMultiplier = $gateStatus === 'PASS' ? 1.0 : 0.94;

            return (
                ($content * $contentWeight)
                + ($theme * $themeWeight)
                + ($retrieval * $retrievalWeight)
                + ($overlap * $overlapWeight)
            ) * $gateMultiplier;
        };

        return $score($b) <=> $score($a);
    }
);

/*
 * 排序後做「軟性」來源 / 攝影師去重：
 * - exact URL 重複直接去掉
 * - 第一輪同攝影師最多 2 張
 * - provider 約 60% soft cap
 * - 如果候選真的不足，再逐步放寬，不為了平均來源而硬塞低分圖
 */
$results =
    $this->selectDiverseResults(
        $results,
        $requestedPerPage
    );

/*
 * -------------------------
 * 35. 正式 API Response
 * -------------------------
 */
return [
    'ok' =>
        true,

    'input' =>
        $input,

    'branch_id' =>
        $branchId,

    'page' =>
        $page,

    'per_page' =>
        $requestedPerPage,

    'total_pages' =>
        $maxPages,

    /*
     * 這一頁真正回傳的圖片數量。
     */
    'candidate_count' =>
        count($results),

    /*
     * Content Semantic Validation 統計。
     */
    'content_validation' => [
        'mode' =>
            'metadata_v3_theme_elements',

        'checked_count' =>
            $contentCheckedCount,

        'passed_count' =>
            $contentPassedCount,

        'candidate_count' =>
            $contentCandidateCount,

        'rejected_count' =>
            $contentRejectedCount,
    ],

    /*
     * 已啟用的圖片 Provider。
     */
    'providers' =>
        array_map(
            fn(string $name): array => [
                'id' =>
                    $name,

                'name' =>
                    $this->providerDisplayName(
                        $name
                    ),
            ],
            array_keys(
                $providers
            )
        ),

    /*
     * 圖庫 API 發生的錯誤。
     */
    'provider_errors' =>
        $providerErrors,

    /*
     * SemanticInterpreter 結果。
     */
    'interpretation' =>
        $interpretation,

    /*
     * 這一次真正執行過的搜尋計畫報告。
     */
    'search_plan' =>
        $queryReports,

    /*
     * A / B / C 共用 Base Target。
     */
    'base_target' =>
        $branchData[
            'base_target'
        ]
        ?? [],

    /*
     * 目前真正使用的 Branch。
     */
    'branch' => [
        'code' =>
            $selectedBranch[
                'code'
            ]
            ?? $branchId,

        'role' =>
            $selectedBranch[
                'role'
            ]
            ?? '',

        'name' =>
            $selectedBranch[
                'name'
            ]
            ?? '',

        'description' =>
            $selectedBranch[
                'description'
            ]
            ?? '',
        'semantic_direction' =>
    is_array(
        $selectedBranch[
            'semantic_direction'
        ]
        ?? null
    )
        ? $selectedBranch[
            'semantic_direction'
        ]
        : [],

        'target_profile' =>
            $selectedBranch[
                'target_profile'
            ]
            ?? [],

        'delta_from_base' =>
            $selectedBranch[
                'delta_from_base'
            ]
            ?? [],

        'visual_tags' =>
            $selectedBranch[
                'visual_tags'
            ]
            ?? [],

        'theme_elements' =>
            $selectedBranch[
                'theme_elements'
            ]
            ?? [],

        'excluded_visual_tags' =>
            $selectedBranch[
                'excluded_visual_tags'
            ]
            ?? [],
    ],

    /*
     * app.js 目前仍使用這些欄位。
     */
    'target_profile' =>
        $selectedBranch[
            'target_profile'
        ]
        ?? (
            $derived[
                'target_profile'
            ]
            ?? []
        ),

    'feature_weights' =>
        $selectedBranch[
            'feature_weights'
        ]
        ?? (
            $derived[
                'feature_weights'
            ]
            ?? []
        ),

    'constraints' =>
        $selectedBranch[
            'constraints'
        ]
        ?? (
            $derived[
                'constraints'
            ]
            ?? []
        ),

    /*
     * ColorRuleEngine 產生的排除與規則資訊。
     */
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

    /*
     * 可以安全交給前端使用的圖片分析設定。
     */
    'analysis_config' =>
        $this->publicAnalysisConfig(),

    /*
     * 可以公開給前端的基本設定。
     */
    'public_config' => [
        'input_max_length' =>
            $maxLength,

        'default_per_page' =>
            $defaultPerPage,
    ],

    /*
     * 正式圖片搜尋結果。
     */
    /*
 * 正式通過 Content Gate 的結果。
 */
'results' =>
    $results,

/*
 * 測試階段：
 * 被 Content Gate 淘汰的結果。
 *
 * 正式上線前可以移除。
 */
'rejected_results' =>
    $rejectedResults,
];

}

/**
 * @param array<int, array<string, mixed>> $rankedResults
 * @return array<int, array<string, mixed>>
 */
private function selectDiverseResults(
    array $rankedResults,
    int $limit
): array {
    $limit = max(1, $limit);
    $providerSoftCap = max(2, (int) ceil($limit * 0.60));

    $selected = [];
    $selectedIds = [];
    $selectedUrls = [];
    $photographerCounts = [];
    $providerCounts = [];

    $tryAdd = static function (
        array $photo,
        bool $enforceProviderCap,
        bool $enforcePhotographerCap
    ) use (
        &$selected,
        &$selectedIds,
        &$selectedUrls,
        &$photographerCounts,
        &$providerCounts,
        $providerSoftCap,
        $limit
    ): bool {
        if (count($selected) >= $limit) {
            return false;
        }

        $id = strtolower(trim((string) ($photo['id'] ?? '')));
        $url = trim((string) ($photo['analysis_url'] ?? $photo['image_regular'] ?? $photo['image_small'] ?? ''));
        $provider = strtolower(trim((string) ($photo['provider'] ?? 'unknown')));
        $photographer = strtolower(trim((string) ($photo['photographer'] ?? 'unknown')));

        if ($id !== '' && isset($selectedIds[$id])) {
            return false;
        }

        if ($url !== '' && isset($selectedUrls[$url])) {
            return false;
        }

        if (
            $enforceProviderCap
            && (($providerCounts[$provider] ?? 0) >= $providerSoftCap)
        ) {
            return false;
        }

        if (
            $enforcePhotographerCap
            && $photographer !== ''
            && $photographer !== 'unknown'
            && (($photographerCounts[$photographer] ?? 0) >= 2)
        ) {
            return false;
        }

        $selected[] = $photo;

        if ($id !== '') {
            $selectedIds[$id] = true;
        }
        if ($url !== '') {
            $selectedUrls[$url] = true;
        }

        $providerCounts[$provider] = ($providerCounts[$provider] ?? 0) + 1;
        $photographerCounts[$photographer] = ($photographerCounts[$photographer] ?? 0) + 1;

        return true;
    };

    /* 第一輪：provider + photographer 都採 soft cap。 */
    foreach ($rankedResults as $photo) {
        if (!is_array($photo)) {
            continue;
        }
        $tryAdd($photo, true, true);
        if (count($selected) >= $limit) {
            return $selected;
        }
    }

    /* 第二輪：來源不夠時放寬 provider，但仍避免同攝影師洗版。 */
    foreach ($rankedResults as $photo) {
        if (!is_array($photo)) {
            continue;
        }
        $tryAdd($photo, false, true);
        if (count($selected) >= $limit) {
            return $selected;
        }
    }

    /* 第三輪：真的沒圖時才放寬攝影師限制；exact duplicate 仍不放。 */
    foreach ($rankedResults as $photo) {
        if (!is_array($photo)) {
            continue;
        }
        $tryAdd($photo, false, false);
        if (count($selected) >= $limit) {
            break;
        }
    }

    return $selected;
}

private function providerDisplayName(
    string $provider
): string {
    return match (
        strtolower($provider)
    ) {
        'unsplash' =>
            'Unsplash',

        'pexels' =>
            'Pexels',

        'pixabay' =>
            'Pixabay',

        default =>
            ucfirst($provider),
    };
}
private function publicAnalysisConfig(): array
{
    $analysisConfig =
        $this->analysisConfig;

    return [
        'concurrency' =>
            max(
                1,
                min(
                    8,
                    (int) (
                        $analysisConfig[
                            'concurrency'
                        ]
                        ?? 5
                    )
                )
            ),

        'final_score_weights' =>
            is_array(
                $analysisConfig[
                    'final_score_weights'
                ]
                ?? null
            )
                ? $analysisConfig[
                    'final_score_weights'
                ]
                : [],

        'semantic_exclusion' =>
            is_array(
                $analysisConfig[
                    'semantic_exclusion'
                ]
                ?? null
            )
                ? $analysisConfig[
                    'semantic_exclusion'
                ]
                : [],

        'qualification' =>
            is_array(
                $analysisConfig[
                    'qualification'
                ]
                ?? null
            )
                ? $analysisConfig[
                    'qualification'
                ]
                : [],
    ];
}
private function utf8Length(
    string $value
): int {
    if (
        function_exists(
            'mb_strlen'
        )
    ) {
        return mb_strlen(
            $value,
            'UTF-8'
        );
    }

    $matched =
        preg_match_all(
            '/./us',
            $value,
            $matches
        );

    return $matched === false
        ? strlen($value)
        : count($matches[0]);
}
}