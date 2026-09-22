<?php

declare(strict_types=1);

final class PexelsClient
{
    private string $apiKey;
    private string $apiBaseUrl;
    private string $siteUrl;
    private int $connectTimeout;
    private int $timeout;
    private int $perPageLimit;
    private string $userAgent;
    private string $orientation;
    private string $size;
    private string $color;
    private string $locale;
    private string $analysisSource;

    /**
     * @param array<string, mixed> $pexelsConfig
     * @param array<string, mixed> $appConfig
     */
    public function __construct(array $pexelsConfig, array $appConfig = [])
    {
        $this->apiKey = trim((string) ($pexelsConfig['api_key'] ?? ''));
        $this->apiBaseUrl = rtrim(
            trim((string) ($pexelsConfig['api_base_url'] ?? 'https://api.pexels.com/v1')),
            '/'
        );
        $this->siteUrl = trim((string) ($pexelsConfig['site_url'] ?? 'https://www.pexels.com/'));
        $this->connectTimeout = max(1, (int) ($pexelsConfig['connect_timeout'] ?? 8));
        $this->timeout = max(1, (int) ($pexelsConfig['timeout'] ?? 20));
        $this->perPageLimit = min(80, max(1, (int) ($pexelsConfig['per_page_limit'] ?? 40)));
        $this->userAgent = trim((string) ($appConfig['user_agent'] ?? 'ColorSearchTest')) ?: 'ColorSearchTest';
        $this->orientation = trim((string) ($pexelsConfig['orientation'] ?? ''));
        $this->size = trim((string) ($pexelsConfig['size'] ?? ''));
        $this->color = trim((string) ($pexelsConfig['color'] ?? ''));
        $this->locale = trim((string) ($pexelsConfig['locale'] ?? ''));
        $this->analysisSource = trim((string) ($pexelsConfig['analysis_source'] ?? 'tiny')) ?: 'tiny';

        if ($this->apiKey === '') {
            throw new InvalidArgumentException('尚未設定 Pexels API Key。');
        }

        if ($this->apiBaseUrl === '' || filter_var($this->apiBaseUrl, FILTER_VALIDATE_URL) === false) {
            throw new InvalidArgumentException('Pexels API Base URL 不正確。');
        }
    }

    /** @return array<string, mixed> */
    public function searchPhotos(string $query, int $page = 1, int $perPage = 20): array
    {
        $query = trim($query);
        if ($query === '') {
            throw new InvalidArgumentException('搜尋文字不可為空白。');
        }

        $params = [
            'query' => $query,
            'page' => max(1, $page),
            'per_page' => min($this->perPageLimit, max(1, $perPage)),
        ];

        if ($this->orientation !== '') {
            $params['orientation'] = $this->orientation;
        }
        if ($this->size !== '') {
            $params['size'] = $this->size;
        }
        if ($this->color !== '') {
            $params['color'] = $this->color;
        }
        if ($this->locale !== '') {
            $params['locale'] = $this->locale;
        }

        $url = $this->apiBaseUrl . '/search?' . http_build_query(
            $params,
            '',
            '&',
            PHP_QUERY_RFC3986
        );

        $payload = $this->requestJson($url);
        $results = [];

        foreach (($payload['photos'] ?? []) as $photo) {
            if (!is_array($photo)) {
                continue;
            }

            $photoId = (string) ($photo['id'] ?? '');
            if ($photoId === '') {
                continue;
            }

            $src = is_array($photo['src'] ?? null) ? $photo['src'] : [];
            $photoUrl = (string) ($photo['url'] ?? '');
            $photographerUrl = (string) ($photo['photographer_url'] ?? '');
            $analysisUrl = $this->pickImageSource($src, $this->analysisSource);

            $results[] = [
                // 加上來源前綴，避免和 Unsplash 的 ID 撞號。
                'id' => 'pexels_' . $photoId,
                'provider_id' => $photoId,
                'provider' => 'pexels',
                'provider_name' => 'Pexels',
                'provider_url' => $this->siteUrl,

                'width' => (int) ($photo['width'] ?? 0),
                'height' => (int) ($photo['height'] ?? 0),
                'color' => (string) ($photo['avg_color'] ?? '#e9e8e4'),
                'alt' => (string) ($photo['alt'] ?? 'Pexels photo'),

                'image_small' => (string) ($src['medium'] ?? $src['small'] ?? $analysisUrl),
                'image_regular' => (string) ($src['large'] ?? $src['large2x'] ?? $src['medium'] ?? ''),
                'analysis_url' => $analysisUrl,

                'photo_url' => $photoUrl,
                'download_location' => '',
                'photographer' => (string) ($photo['photographer'] ?? 'Pexels photographer'),
                'photographer_url' => $photographerUrl,
                'pexels_url' => $this->siteUrl,
                'likes' => 0,
            ];
        }

        $total = max(0, (int) ($payload['total_results'] ?? 0));
        $actualPerPage = max(1, (int) ($payload['per_page'] ?? $params['per_page']));

        return [
            'total' => $total,
            'total_pages' => max(1, (int) ceil($total / $actualPerPage)),
            'results' => $results,
        ];
    }

    /** @return array<string, mixed> */
    private function requestJson(string $url): array
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('PHP cURL 尚未啟用，請在 XAMPP 的 php.ini 啟用 extension=curl。');
        }

        $curl = curl_init($url);
        if ($curl === false) {
            throw new RuntimeException('無法建立 Pexels API 連線。');
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_HTTPHEADER => [
                // Pexels 是直接放 Key，不要加 Bearer。
                'Authorization: ' . $this->apiKey,
                'Accept: application/json',
            ],
            CURLOPT_USERAGENT => $this->userAgent,
        ]);

        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($body === false) {
            throw new RuntimeException('連線 Pexels 失敗：' . ($curlError ?: '未知錯誤'));
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Pexels 回傳了無法解析的資料。');
        }

        if ($status < 200 || $status >= 300) {
            $message = trim((string) ($decoded['error'] ?? 'Pexels API 請求失敗。'));
            throw new RuntimeException($message . '（HTTP ' . $status . '）');
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $src
     */
    private function pickImageSource(array $src, string $preferred): string
    {
        $allowed = ['tiny', 'small', 'medium', 'large', 'large2x', 'landscape', 'portrait', 'original'];
        if (in_array($preferred, $allowed, true) && !empty($src[$preferred])) {
            return (string) $src[$preferred];
        }

        foreach (['tiny', 'small', 'medium', 'large'] as $key) {
            if (!empty($src[$key])) {
                return (string) $src[$key];
            }
        }

        return '';
    }
}
