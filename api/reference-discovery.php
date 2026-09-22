<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(
        ['ok' => false, 'message' => '只接受 GET 或 POST 請求。'],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

require_once __DIR__ . '/../src/ConfigLoader.php';
require_once __DIR__ . '/../src/ReferenceDiscoveryService.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input');
        $payload = ($raw !== false && trim($raw) !== '')
            ? json_decode($raw, true)
            : [];
        if (!is_array($payload)) {
            throw new InvalidArgumentException('請求 JSON 格式錯誤。');
        }
    } else {
        $payload = $_GET;
    }

    $config = ConfigLoader::load();
    $service = new ReferenceDiscoveryService($config);

    echo json_encode(
        $service->discover($payload),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(
        ['ok' => false, 'message' => $error->getMessage()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(
        ['ok' => false, 'message' => $error->getMessage()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
}
