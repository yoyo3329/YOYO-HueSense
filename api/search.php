<?php

declare(strict_types=1);


/*
 * -------------------------
 * API 回傳格式
 * -------------------------
 *
 * 告訴瀏覽器：
 * 這支 API 回傳 JSON。
 */
header(
    'Content-Type: application/json; charset=utf-8'
);


/*
 * 搜尋結果不要被瀏覽器快取。
 */
header(
    'Cache-Control: no-store, max-age=0'
);


/*
 * -------------------------
 * 只接受 GET / POST
 * -------------------------
 */
if (
    !in_array(
        $_SERVER['REQUEST_METHOD'],
        ['GET', 'POST'],
        true
    )
) {

    http_response_code(405);

    echo json_encode(
        [
            'ok' => false,
            'message' =>
                '只接受 GET 或 POST 請求。',
        ],
        JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
    );

    exit;
}


/*
 * -------------------------
 * 這支 API 真正需要的檔案
 * -------------------------
 */

/*
 * 負責讀 config。
 */
require_once
    __DIR__
    . '/../src/ConfigLoader.php';


/*
 * 負責整套搜尋流程。
 */
require_once
    __DIR__
    . '/../src/SearchService.php';


try {

    /*
     * -------------------------
     * 1. 收前端 Request
     * -------------------------
     *
     * GET：
     *
     * search.php?q=summer
     *
     * POST：
     *
     * 從 JSON body 讀取。
     */
    $payload =
        $_SERVER['REQUEST_METHOD'] === 'POST'
            ? readJsonBody()
            : $_GET;


    /*
     * -------------------------
     * 2. 載入網站設定
     * -------------------------
     */
    $config =
        ConfigLoader::load();


    /*
     * -------------------------
     * 3. 建立 SearchService
     * -------------------------
     */
    $searchService =
        new SearchService(
            $config
        );


    /*
     * -------------------------
     * 4. 執行完整搜尋
     * -------------------------
     *
     * SearchService 裡現在已經包含：
     *
     * SemanticInterpreter
     * ColorRuleEngine
     * BranchBuilder
     * SearchPlanner
     * Provider Search
     * Merge
     * Content Gate
     * Backend Ranking
     * 正式 Response
     */
    $result =
        $searchService->search(
            $payload
        );


    /*
     * -------------------------
     * 5. 回傳 JSON 給前端
     * -------------------------
     */
    echo json_encode(
        $result,
        JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
    );


} catch (
    InvalidArgumentException $error
) {

    /*
     * -------------------------
     * 使用者輸入錯誤
     * -------------------------
     *
     * 例如：
     * q 空白
     * branch_id 錯誤
     * JSON 格式錯誤
     */
    http_response_code(422);

    echo json_encode(
        [
            'ok' => false,
            'message' =>
                $error->getMessage(),
        ],
        JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
    );


} catch (
    Throwable $error
) {

    /*
     * -------------------------
     * 系統錯誤
     * -------------------------
     *
     * 例如：
     * Provider API 問題
     * Config 問題
     * PHP 執行錯誤
     */
    http_response_code(500);

    echo json_encode(
        [
            'ok' => false,
            'message' =>
                $error->getMessage(),
        ],
        JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
    );
}


/**
 * -------------------------
 * 讀取 POST JSON
 * -------------------------
 *
 * @return array<string,mixed>
 */
function readJsonBody(): array
{
    $raw =
        file_get_contents(
            'php://input'
        );


    /*
     * 沒有 body。
     */
    if (
        $raw === false
        || trim($raw) === ''
    ) {
        return [];
    }


    /*
     * JSON
     * ↓
     * PHP array
     */
    $decoded =
        json_decode(
            $raw,
            true
        );


    /*
     * JSON 格式不正確。
     */
    if (!is_array($decoded)) {
        throw new InvalidArgumentException(
            '請求資料格式錯誤。'
        );
    }


    return $decoded;
}