<?php

declare(strict_types=1);

/**
 * OpenRouter Chat Completions 用戶端。
 *
 * API Key、API URL、模型、逾時、Structured Outputs 與路由設定
 * 全部由 config/config.php 的 ai 區塊傳入。本檔案不保存可更換設定。
 */
final class OpenRouterClient
{
    private string $apiKey;
    private string $apiUrl;
    private string $model;
    private float $temperature;
    private int $maxOutputTokens;
    private int $connectTimeout;
    private int $timeout;
    private string $userAgent;
    private string $referer;
    private string $title;
    private bool $structuredOutput;
    private string $defaultSchemaName;
    private bool $requireParameters;
    private bool $allowFallbacks;
    private string $requiredKeyPrefix;

    /** @var array<string, string> */
    private array $extraHeaders;

    /**
     * @param array<string, mixed> $aiConfig
     * @param array<string, mixed> $appConfig
     */
    public function __construct(array $aiConfig, array $appConfig = [])
    {
        $provider = strtolower(trim((string) ($aiConfig['provider'] ?? 'openrouter')));
        if ($provider !== 'openrouter') {
            throw new InvalidArgumentException(
                '目前語言模型用戶端只支援 OpenRouter；請將 config/config.php 的 ai.provider 設為 openrouter。'
            );
        }

        $this->apiKey = trim((string) ($aiConfig['api_key'] ?? ''));
        $this->apiUrl = trim((string) ($aiConfig['api_url'] ?? ''));
        $this->model = trim((string) ($aiConfig['model'] ?? ''));
        $this->temperature = (float) ($aiConfig['temperature'] ?? 0.1);
        $this->maxOutputTokens = max(1, (int) ($aiConfig['max_output_tokens'] ?? 1800));
        $this->connectTimeout = max(1, (int) ($aiConfig['connect_timeout'] ?? 8));
        $this->timeout = max(1, (int) ($aiConfig['timeout'] ?? 60));
        $this->userAgent = trim((string) ($aiConfig['user_agent'] ?? $appConfig['user_agent'] ?? 'ColorSearchTest'));
        $this->referer = trim((string) ($aiConfig['referer'] ?? $appConfig['url'] ?? ''));
        $this->title = trim((string) ($aiConfig['title'] ?? $appConfig['title'] ?? $appConfig['name'] ?? 'Color Search'));
        $this->structuredOutput = (bool) ($aiConfig['structured_output'] ?? true);
        $this->defaultSchemaName = trim((string) ($aiConfig['schema_name'] ?? 'semantic_interpretation'));
        $this->requireParameters = (bool) ($aiConfig['require_parameters'] ?? true);
        $this->allowFallbacks = (bool) ($aiConfig['allow_fallbacks'] ?? true);
        $this->requiredKeyPrefix = trim((string) ($aiConfig['required_key_prefix'] ?? 'sk-or-v1-'));
        $this->extraHeaders = $this->normalizeHeaders($aiConfig['extra_headers'] ?? []);

        $this->validateConfiguration();
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    public function createStructuredResponse(
        string $instructions,
        string $input,
        array $schema,
        string $schemaName = ''
    ): array {
        $resolvedSchemaName = $schemaName !== '' ? $schemaName : $this->defaultSchemaName;

        $payload = [
            'model' => $this->model,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => $instructions,
                ],
                [
                    'role' => 'user',
                    'content' => $input,
                ],
            ],
            'temperature' => $this->temperature,
            'max_tokens' => $this->maxOutputTokens,
            'stream' => false,
            'provider' => [
                // openrouter/free 會依此只選擇支援 response_format 等必要參數的模型。
                'require_parameters' => $this->requireParameters,
                'allow_fallbacks' => $this->allowFallbacks,
            ],
        ];

        if ($this->structuredOutput) {
            $payload['response_format'] = [
                'type' => 'json_schema',
                'json_schema' => [
                    'name' => $resolvedSchemaName,
                    'strict' => true,
                    'schema' => $schema,
                ],
            ];
        } else {
            $payload['response_format'] = ['type' => 'json_object'];
        }

        $response = $this->requestJson($payload);
        $text = $this->extractOutputText($response);

        if ($text === '') {
            throw new RuntimeException('OpenRouter 模型沒有回傳可解析的內容。');
        }

        $text = preg_replace('/^```(?:json)?\s*|\s*```$/iu', '', trim($text)) ?? trim($text);

        try {
            $decoded = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException(
                sprintf('OpenRouter 模型回傳的 %s JSON 無法解析：%s', $resolvedSchemaName, $error->getMessage())
            );
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('OpenRouter 模型回傳的 JSON 根節點不是物件。');
        }

        return $decoded;
    }

    private function validateConfiguration(): void
    {
        if ($this->apiKey === '') {
            throw new InvalidArgumentException('尚未在 config/config.php 設定 OpenRouter API Key。');
        }

        if (str_starts_with($this->apiKey, 'PASTE_YOUR_')) {
            throw new InvalidArgumentException('請將 config/config.php 的 ai.api_key 替換成真實 OpenRouter API Key。');
        }

        if ($this->requiredKeyPrefix !== '' && !str_starts_with($this->apiKey, $this->requiredKeyPrefix)) {
            throw new InvalidArgumentException(
                sprintf(
                    'OpenRouter API Key 格式不正確：應以 %s 開頭；目前填入的不是 OpenRouter Key。',
                    $this->requiredKeyPrefix
                )
            );
        }

        if ($this->apiUrl === '' || filter_var($this->apiUrl, FILTER_VALIDATE_URL) === false) {
            throw new InvalidArgumentException('config/config.php 的 OpenRouter API URL 不正確。');
        }

        $host = strtolower((string) parse_url($this->apiUrl, PHP_URL_HOST));
        if ($host !== 'openrouter.ai') {
            throw new InvalidArgumentException('目前只使用 OpenRouter；ai.api_url 必須指向 openrouter.ai。');
        }

        if ($this->model === '') {
            throw new InvalidArgumentException('config/config.php 的 OpenRouter 模型名稱不可為空白。');
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function requestJson(array $payload): array
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('PHP cURL 尚未啟用，請在 XAMPP 的 php.ini 啟用 extension=curl。');
        }

        $curl = curl_init($this->apiUrl);
        if ($curl === false) {
            throw new RuntimeException('無法建立 OpenRouter API 連線。');
        }

        $body = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $this->buildHeaders(),
            CURLOPT_USERAGENT => $this->userAgent,
        ]);

        $rawBody = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($rawBody === false) {
            throw new RuntimeException('連線 OpenRouter API 失敗：' . ($curlError ?: '未知錯誤'));
        }

        try {
            $decoded = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException('OpenRouter API 回傳無法解析的 HTTP 資料：' . $error->getMessage());
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('OpenRouter API 回傳格式錯誤。');
        }

        if ($status < 200 || $status >= 300) {
            $message = (string) ($decoded['error']['message'] ?? 'OpenRouter API 請求失敗。');

            if ($status === 401) {
                $message .= ' 請確認 ai.api_key 是從 OpenRouter API Keys 頁面複製、以 sk-or-v1- 開頭的 Key。';
            }

            throw new RuntimeException($message . '（HTTP ' . $status . '）');
        }

        return $decoded;
    }

    /** @return string[] */
    private function buildHeaders(): array
    {
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $this->apiKey,
        ];

        if ($this->referer !== '') {
            $headers[] = 'HTTP-Referer: ' . $this->referer;
        }
        if ($this->title !== '') {
            $headers[] = 'X-OpenRouter-Title: ' . $this->title;
        }

        foreach ($this->extraHeaders as $name => $value) {
            // 避免 extra_headers 意外覆蓋認證標頭。
            if (strcasecmp($name, 'Authorization') === 0) {
                continue;
            }
            $headers[] = $name . ': ' . $value;
        }

        return $headers;
    }

    /**
     * @param mixed $headers
     * @return array<string, string>
     */
    private function normalizeHeaders(mixed $headers): array
    {
        if (!is_array($headers)) {
            return [];
        }

        $result = [];
        foreach ($headers as $name => $value) {
            $headerName = trim((string) $name);
            $headerValue = trim((string) $value);
            if ($headerName !== '' && $headerValue !== '') {
                $result[$headerName] = $headerValue;
            }
        }

        return $result;
    }

    /** @param array<string, mixed> $response */
    private function extractOutputText(array $response): string
    {
        $content = $response['choices'][0]['message']['content'] ?? null;

        if (is_string($content)) {
            return trim($content);
        }

        if (is_array($content)) {
            $chunks = [];
            foreach ($content as $part) {
                if (is_array($part) && isset($part['text'])) {
                    $chunks[] = (string) $part['text'];
                }
            }
            return trim(implode('', $chunks));
        }

        $finishReason = trim((string) ($response['choices'][0]['finish_reason'] ?? ''));
        if ($finishReason !== '') {
            throw new RuntimeException('OpenRouter 模型未產生文字，完成原因：' . $finishReason);
        }

        return '';
    }
}
