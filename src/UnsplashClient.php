<?php

declare(strict_types=1);

final class UnsplashClient
{
    private string $accessKey;
    private string $apiBaseUrl;
    private string $siteUrl;
    private int $connectTimeout;
    private int $timeout;
    private int $perPageLimit;
    private string $orderBy;
    private string $contentFilter;
    private string $userAgent;

    /** @var array<string, mixed> */
    private array $analysisImage;

    /** @var array<string, string> */
    private array $utm;

    /**
     * @param array<string, mixed> $unsplashConfig
     * @param array<string, mixed> $appConfig
     */
    public function __construct(array $unsplashConfig, array $appConfig = [])
    {
        $this->accessKey = trim((string) ($unsplashConfig['access_key'] ?? ''));
        $this->apiBaseUrl = rtrim(trim((string) ($unsplashConfig['api_base_url'] ?? '')), '/');
        $this->siteUrl = trim((string) ($unsplashConfig['site_url'] ?? 'https://unsplash.com/'));
        $this->connectTimeout = max(1, (int) ($unsplashConfig['connect_timeout'] ?? 8));
        $this->timeout = max(1, (int) ($unsplashConfig['timeout'] ?? 20));
        $this->perPageLimit = min(30, max(1, (int) ($unsplashConfig['per_page_limit'] ?? 30)));
        $this->orderBy = trim((string) ($unsplashConfig['order_by'] ?? 'relevant')) ?: 'relevant';
        $this->contentFilter = trim((string) ($unsplashConfig['content_filter'] ?? 'high')) ?: 'high';
        $this->userAgent = trim((string) ($appConfig['user_agent'] ?? 'ColorSearchTest')) ?: 'ColorSearchTest';
        $this->analysisImage = is_array($unsplashConfig['analysis_image'] ?? null)
            ? $unsplashConfig['analysis_image']
            : [];
        $this->utm = [
            'source' => trim((string) ($unsplashConfig['utm']['source'] ?? $appConfig['name'] ?? 'color_search_test')),
            'medium' => trim((string) ($unsplashConfig['utm']['medium'] ?? 'referral')),
        ];

        if ($this->accessKey === '') {
            throw new InvalidArgumentException('尚未設定 Unsplash Access Key。');
        }
        if ($this->apiBaseUrl === '' || filter_var($this->apiBaseUrl, FILTER_VALIDATE_URL) === false) {
            throw new InvalidArgumentException('Unsplash API Base URL 不正確。');
        }
    }

    /** @return array<string, mixed> */
    public function searchPhotos(string $query, int $page = 1, int $perPage = 20): array
    {
        $query = trim($query);
        if ($query === '') {
            throw new InvalidArgumentException('搜尋文字不可為空白。');
        }

        $params = http_build_query([
            'query' => $query,
            'page' => max(1, $page),
            'per_page' => min($this->perPageLimit, max(1, $perPage)),
            'order_by' => $this->orderBy,
            'content_filter' => $this->contentFilter,
        ], '', '&', PHP_QUERY_RFC3986);

        $url = $this->apiBaseUrl . '/search/photos?' . $params;
        $payload = $this->requestJson($url);

        $results = [];
        foreach (($payload['results'] ?? []) as $photo) {
            if (!is_array($photo)) {
                continue;
            }

            $user = is_array($photo['user'] ?? null) ? $photo['user'] : [];
            $urls = is_array($photo['urls'] ?? null) ? $photo['urls'] : [];
            $links = is_array($photo['links'] ?? null) ? $photo['links'] : [];
            $userLinks = is_array($user['links'] ?? null) ? $user['links'] : [];

            $rawUrl = (string) ($urls['raw'] ?? $urls['small'] ?? '');

            $photoId = (string) ($photo['id'] ?? '');
            if ($photoId === '') {
                continue;
            }

            $providerUrl = $this->withUtm($this->siteUrl);

            $results[] = [
                // 加上來源前綴，避免與 Pexels 的數字 ID 撞號。
                'id' => 'unsplash_' . $photoId,
                'provider_id' => $photoId,
                'provider' => 'unsplash',
                'provider_name' => 'Unsplash',
                'provider_url' => $providerUrl,

                'width' => (int) ($photo['width'] ?? 0),
                'height' => (int) ($photo['height'] ?? 0),
                'color' => (string) ($photo['color'] ?? '#e9e8e4'),
                'alt' => (string) ($photo['alt_description'] ?? $photo['description'] ?? 'Unsplash photo'),
                'image_small' => (string) ($urls['small'] ?? ''),
                'image_regular' => (string) ($urls['regular'] ?? $urls['small'] ?? ''),
                'analysis_url' => $this->buildAnalysisUrl($rawUrl),
                'photo_url' => $this->withUtm((string) ($links['html'] ?? '')),
                'download_location' => (string) ($links['download_location'] ?? ''),
                'photographer' => (string) ($user['name'] ?? 'Unsplash photographer'),
                'photographer_url' => $this->withUtm((string) ($userLinks['html'] ?? '')),
                'unsplash_url' => $providerUrl,
                'likes' => (int) ($photo['likes'] ?? 0),
            ];
        }

        return [
            'total' => (int) ($payload['total'] ?? 0),
            'total_pages' => (int) ($payload['total_pages'] ?? 0),
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
            throw new RuntimeException('無法建立 Unsplash API 連線。');
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_HTTPHEADER => [
                'Authorization: Client-ID ' . $this->accessKey,
                'Accept-Version: v1',
                'Accept: application/json',
            ],
            CURLOPT_USERAGENT => $this->userAgent,
        ]);

        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($body === false) {
            throw new RuntimeException('連線 Unsplash 失敗：' . ($curlError ?: '未知錯誤'));
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Unsplash 回傳了無法解析的資料。');
        }

        if ($status < 200 || $status >= 300) {
            $message = 'Unsplash API 請求失敗。';
            if (isset($decoded['errors']) && is_array($decoded['errors'])) {
                $message = implode('、', array_map('strval', $decoded['errors']));
            }
            throw new RuntimeException($message . '（HTTP ' . $status . '）');
        }

        return $decoded;
    }

    private function buildAnalysisUrl(string $url): string
    {
        if ($url === '') {
            return '';
        }

        $separator = str_contains($url, '?') ? '&' : '?';
        $width = max(16, (int) ($this->analysisImage['width'] ?? 96));
        $height = max(16, (int) ($this->analysisImage['height'] ?? 96));
        $quality = min(100, max(1, (int) ($this->analysisImage['quality'] ?? 60)));
        $fit = trim((string) ($this->analysisImage['fit'] ?? 'crop')) ?: 'crop';
        $format = trim((string) ($this->analysisImage['format'] ?? 'jpg')) ?: 'jpg';

        return $url . $separator . http_build_query([
            'w' => $width,
            'h' => $height,
            'fit' => $fit,
            'crop' => 'entropy',
            'auto' => 'format',
            'fm' => $format,
            'q' => $quality,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    private function withUtm(string $url): string
    {
        if ($url === '') {
            return '';
        }

        $separator = str_contains($url, '?') ? '&' : '?';
        return $url . $separator . http_build_query([
            'utm_source' => $this->utm['source'] ?: 'color_search_test',
            'utm_medium' => $this->utm['medium'] ?: 'referral',
        ], '', '&', PHP_QUERY_RFC3986);
    }
}
