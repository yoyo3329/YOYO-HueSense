<?php

declare(strict_types=1);

final class PixabayClient
{
    private string $apiKey;
    private string $apiBaseUrl;
    private string $siteUrl;
    private int $connectTimeout;
    private int $timeout;
    private int $perPageLimit;
    private string $userAgent;

    private string $lang;
    private string $imageType;
    private string $orientation;
    private string $category;
    private string $colors;
    private int $minWidth;
    private int $minHeight;
    private bool $editorsChoice;
    private bool $safeSearch;
    private string $order;
    private string $analysisSource;

    private bool $cacheEnabled;
    private int $cacheTtl;
    private string $cacheDirectory;

    /**
     * @param array<string, mixed> $pixabayConfig
     * @param array<string, mixed> $appConfig
     */
    public function __construct(array $pixabayConfig, array $appConfig = [])
    {
        $this->apiKey = trim((string) ($pixabayConfig['api_key'] ?? ''));
        $this->apiBaseUrl = rtrim(
            trim((string) ($pixabayConfig['api_base_url'] ?? 'https://pixabay.com/api')),
            '/'
        );
        $this->siteUrl = rtrim(
            trim((string) ($pixabayConfig['site_url'] ?? 'https://pixabay.com/')),
            '/'
        ) . '/';
        $this->connectTimeout = max(1, (int) ($pixabayConfig['connect_timeout'] ?? 8));
        $this->timeout = max(1, (int) ($pixabayConfig['timeout'] ?? 20));
        $this->perPageLimit = min(200, max(3, (int) ($pixabayConfig['per_page_limit'] ?? 40)));
        $this->userAgent = trim((string) ($appConfig['user_agent'] ?? 'ColorSearchTest')) ?: 'ColorSearchTest';

        $this->lang = $this->enumValue(
            (string) ($pixabayConfig['lang'] ?? 'en'),
            ['cs', 'da', 'de', 'en', 'es', 'fr', 'id', 'it', 'hu', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'fi', 'sv', 'tr', 'vi', 'th', 'bg', 'ru', 'el', 'ja', 'ko', 'zh'],
            'en'
        );
        $this->imageType = $this->enumValue(
            (string) ($pixabayConfig['image_type'] ?? 'photo'),
            ['all', 'photo', 'illustration', 'vector'],
            'photo'
        );
        $this->orientation = $this->enumValue(
            (string) ($pixabayConfig['orientation'] ?? 'all'),
            ['all', 'horizontal', 'vertical'],
            'all'
        );
        $this->category = trim((string) ($pixabayConfig['category'] ?? ''));
        $this->colors = trim((string) ($pixabayConfig['colors'] ?? ''));
        $this->minWidth = max(0, (int) ($pixabayConfig['min_width'] ?? 0));
        $this->minHeight = max(0, (int) ($pixabayConfig['min_height'] ?? 0));
        $this->editorsChoice = ($pixabayConfig['editors_choice'] ?? false) === true;
        $this->safeSearch = ($pixabayConfig['safesearch'] ?? true) === true;
        $this->order = $this->enumValue(
            (string) ($pixabayConfig['order'] ?? 'popular'),
            ['popular', 'latest'],
            'popular'
        );
        $this->analysisSource = $this->enumValue(
            (string) ($pixabayConfig['analysis_source'] ?? 'webformat'),
            ['preview', 'webformat', 'large'],
            'webformat'
        );

        $cache = is_array($pixabayConfig['cache'] ?? null) ? $pixabayConfig['cache'] : [];
        $this->cacheEnabled = ($cache['enabled'] ?? true) === true;
        $this->cacheTtl = max(60, (int) ($cache['ttl'] ?? 86400));
        $this->cacheDirectory = trim((string) ($cache['directory'] ?? (__DIR__ . '/../cache/pixabay')));

        if ($this->apiKey === '') {
            throw new InvalidArgumentException('尚未設定 Pixabay API Key。');
        }

        if ($this->apiBaseUrl === '' || filter_var($this->apiBaseUrl, FILTER_VALIDATE_URL) === false) {
            throw new InvalidArgumentException('Pixabay API Base URL 不正確。');
        }
    }

    /** @return array<string, mixed> */
    public function searchPhotos(string $query, int $page = 1, int $perPage = 20): array
    {
        $query = $this->truncateUtf8(trim($query), 100);
        if ($query === '') {
            throw new InvalidArgumentException('搜尋文字不可為空白。');
        }

        $params = [
            'key' => $this->apiKey,
            'q' => $query,
            'lang' => $this->lang,
            'image_type' => $this->imageType,
            'orientation' => $this->orientation,
            'editors_choice' => $this->editorsChoice ? 'true' : 'false',
            'safesearch' => $this->safeSearch ? 'true' : 'false',
            'order' => $this->order,
            'page' => max(1, $page),
            'per_page' => min($this->perPageLimit, max(3, $perPage)),
            'pretty' => 'false',
        ];

        if ($this->category !== '') {
            $params['category'] = $this->category;
        }
        if ($this->colors !== '') {
            $params['colors'] = $this->colors;
        }
        if ($this->minWidth > 0) {
            $params['min_width'] = $this->minWidth;
        }
        if ($this->minHeight > 0) {
            $params['min_height'] = $this->minHeight;
        }

        $url = $this->apiBaseUrl . '/?' . http_build_query(
            $params,
            '',
            '&',
            PHP_QUERY_RFC3986
        );

        $payload = $this->requestJson($url);
        $results = [];

        foreach (($payload['hits'] ?? []) as $photo) {
            if (!is_array($photo)) {
                continue;
            }

            $photoId = (string) ($photo['id'] ?? '');
            if ($photoId === '') {
                continue;
            }

            $pageUrl = trim((string) ($photo['pageURL'] ?? ''));
            $previewUrl = trim((string) ($photo['previewURL'] ?? ''));
            $webformatUrl = trim((string) ($photo['webformatURL'] ?? ''));
            $largeUrl = trim((string) ($photo['largeImageURL'] ?? ''));
            $analysisUrl = $this->pickAnalysisUrl($previewUrl, $webformatUrl, $largeUrl);

            $userId = (string) ($photo['user_id'] ?? '');
            $user = trim((string) ($photo['user'] ?? ''));
            $photographerUrl = $this->buildPhotographerUrl($user, $userId);
            $tags = trim((string) ($photo['tags'] ?? ''));

            $results[] = [
                'id' => 'pixabay_' . $photoId,
                'provider_id' => $photoId,
                'provider' => 'pixabay',
                'provider_name' => 'Pixabay',
                'provider_url' => $this->siteUrl,

                'width' => (int) ($photo['imageWidth'] ?? $photo['webformatWidth'] ?? 0),
                'height' => (int) ($photo['imageHeight'] ?? $photo['webformatHeight'] ?? 0),
                'color' => '#e9e8e4',
                'alt' => $tags !== '' ? $tags : 'Pixabay image',

                'image_small' => $webformatUrl !== '' ? $webformatUrl : $previewUrl,
                'image_regular' => $largeUrl !== '' ? $largeUrl : $webformatUrl,
                'analysis_url' => $analysisUrl,

                'photo_url' => $pageUrl,
                'download_location' => '',
                'photographer' => $user !== '' ? $user : 'Pixabay contributor',
                'photographer_url' => $photographerUrl !== '' ? $photographerUrl : $pageUrl,
                'pixabay_url' => $this->siteUrl,
                'likes' => (int) ($photo['likes'] ?? 0),
            ];
        }

        $total = max(0, (int) ($payload['totalHits'] ?? $payload['total'] ?? 0));
        $actualPerPage = max(3, (int) $params['per_page']);

        return [
            'total' => $total,
            'total_pages' => max(1, (int) ceil($total / $actualPerPage)),
            'results' => $results,
        ];
    }

    /** @return array<string, mixed> */
    private function requestJson(string $url): array
    {
        $cached = $this->readCache($url);
        if ($cached !== null) {
            return $cached;
        }

        if (!function_exists('curl_init')) {
            throw new RuntimeException('PHP cURL 尚未啟用，請在 XAMPP 的 php.ini 啟用 extension=curl。');
        }

        $curl = curl_init($url);
        if ($curl === false) {
            throw new RuntimeException('無法建立 Pixabay API 連線。');
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
            ],
            CURLOPT_USERAGENT => $this->userAgent,
        ]);

        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($body === false) {
            throw new RuntimeException('連線 Pixabay 失敗：' . ($curlError ?: '未知錯誤'));
        }

        $decoded = json_decode($body, true);

        if ($status < 200 || $status >= 300) {
            $message = is_array($decoded)
                ? trim((string) ($decoded['error'] ?? $decoded['message'] ?? 'Pixabay API 請求失敗。'))
                : trim(strip_tags($body));

            if ($message === '') {
                $message = 'Pixabay API 請求失敗。';
            }

            throw new RuntimeException($message . '（HTTP ' . $status . '）');
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('Pixabay 回傳了無法解析的資料。');
        }

        $this->writeCache($url, $decoded);
        return $decoded;
    }

    /** @return array<string, mixed>|null */
    private function readCache(string $url): ?array
    {
        if (!$this->cacheEnabled || $this->cacheDirectory === '') {
            return null;
        }

        $path = $this->cachePath($url);
        if (!is_file($path)) {
            return null;
        }

        $modified = filemtime($path);
        if ($modified === false || (time() - $modified) > $this->cacheTtl) {
            @unlink($path);
            return null;
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            return null;
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /** @param array<string, mixed> $payload */
    private function writeCache(string $url, array $payload): void
    {
        if (!$this->cacheEnabled || $this->cacheDirectory === '') {
            return;
        }

        if (!is_dir($this->cacheDirectory) && !@mkdir($this->cacheDirectory, 0775, true) && !is_dir($this->cacheDirectory)) {
            return;
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            return;
        }

        @file_put_contents($this->cachePath($url), $json, LOCK_EX);
    }

    private function cachePath(string $url): string
    {
        return rtrim($this->cacheDirectory, '/\\') . DIRECTORY_SEPARATOR . hash('sha256', $url) . '.json';
    }

    private function pickAnalysisUrl(string $preview, string $webformat, string $large): string
    {
        return match ($this->analysisSource) {
            'preview' => $preview !== '' ? $preview : ($webformat !== '' ? $webformat : $large),
            'large' => $large !== '' ? $large : ($webformat !== '' ? $webformat : $preview),
            default => $webformat !== '' ? $webformat : ($preview !== '' ? $preview : $large),
        };
    }

    private function buildPhotographerUrl(string $user, string $userId): string
    {
        if ($user === '' || $userId === '') {
            return '';
        }

        $slug = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $user), '-'));
        if ($slug === '') {
            $slug = rawurlencode($user);
        }

        return $this->siteUrl . 'users/' . $slug . '-' . rawurlencode($userId) . '/';
    }

    private function truncateUtf8(string $value, int $maxLength): string
    {
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $maxLength, 'UTF-8');
        }

        return substr($value, 0, $maxLength);
    }

    /** @param string[] $allowed */
    private function enumValue(string $value, array $allowed, string $default): string
    {
        $value = strtolower(trim($value));
        return in_array($value, $allowed, true) ? $value : $default;
    }
}
