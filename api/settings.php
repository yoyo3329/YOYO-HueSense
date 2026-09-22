<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

require_once __DIR__ . '/../src/ConfigLoader.php';

try {
    $config = ConfigLoader::load();
    $search = is_array($config['search'] ?? null) ? $config['search'] : [];

    echo json_encode([
        'ok' => true,
        'public_config' => [
            'input_max_length' => max(1, (int) ($search['input_max_length'] ?? 300)),
            'default_per_page' => max(1, (int) ($search['default_per_page'] ?? 30)),
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
}
