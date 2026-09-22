<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => '只接受 POST 請求。'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/../src/ConfigLoader.php';
require_once __DIR__ . '/../src/ServiceFactory.php';
require_once __DIR__ . '/../src/SemanticInterpreter.php';
require_once __DIR__ . '/../src/SearchPlanner.php';
require_once __DIR__ . '/../src/ColorRuleEngine.php';

try {
    $payload = readJsonBody();
    $input = trim((string) ($payload['q'] ?? ''));
    $config = ConfigLoader::load();
    $searchConfig = is_array($config['search'] ?? null) ? $config['search'] : [];
    $maxLength = max(1, (int) ($searchConfig['input_max_length'] ?? 300));

    if ($input === '') {
        throw new InvalidArgumentException('請先輸入完整描述。');
    }

    if (utf8Length($input) > $maxLength) {
        throw new InvalidArgumentException(sprintf('描述請控制在 %d 個字以內。', $maxLength));
    }

    $interpreter = new SemanticInterpreter(ServiceFactory::openRouter($config));
    $interpretation = $interpreter->interpret($input);

    $ruleEngine = new ColorRuleEngine();
    $planner = new SearchPlanner();
    $derived = $ruleEngine->derive($interpretation['concepts']);
    $searchPlan = $planner->build($interpretation['concepts']);

    echo json_encode([
        'ok' => true,
        'interpretation' => $interpretation,
        'target_profile' => $derived['target_profile'],
        'feature_weights' => $derived['feature_weights'],
        'constraints' => $derived['constraints'],
        'exclusion_terms' => $derived['exclusion_terms'],
        'applied_rules' => $derived['applied_rules'],
        'search_plan' => $searchPlan,
        'public_config' => [
            'input_max_length' => $maxLength,
            'default_per_page' => (int) ($searchConfig['default_per_page'] ?? 30),
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
}

/** @return array<string, mixed> */
function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new InvalidArgumentException('請求資料格式錯誤。');
    }

    return $decoded;
}

function utf8Length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    $matched = preg_match_all('/./us', $value, $matches);
    return $matched === false ? strlen($value) : count($matches[0]);
}
