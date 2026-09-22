<?php

declare(strict_types=1);

/**
 * Thin adapter for SerpApi's Google Images API.
 *
 * Official engine: google_images
 * Response collection: images_results[]
 */
final class SerpApiGoogleImagesClient
{
    private string $apiKey;
    private string $apiBaseUrl;
    private string $engine;
    private int $connectTimeout;
    private int $timeout;
    private string $hl;
    private string $gl;
    private string $safe;
    private string $device;
    private string $userAgent;

    /**
     * @param array<string,mixed> $serpApiConfig
     * @param array<string,mixed> $appConfig
     */
    public function __construct(array $serpApiConfig, array $appConfig = [])
    {
        $this->apiKey = trim((string) ($serpApiConfig['api_key'] ?? ''));
        $this->apiBaseUrl = trim((string) (
            $serpApiConfig['api_base_url']
            ?? 'https://serpapi.com/search.json'
        ));
        $this->engine = trim((string) ($serpApiConfig['engine'] ?? 'google_images'));
        $this->connectTimeout = max(1, (int) ($serpApiConfig['connect_timeout'] ?? 8));
        $this->timeout = max(1, (int) ($serpApiConfig['timeout'] ?? 30));
        $this->hl = trim((string) ($serpApiConfig['hl'] ?? 'en'));
        $this->gl = trim((string) ($serpApiConfig['gl'] ?? 'us'));
        $safe = trim((string) ($serpApiConfig['safe'] ?? 'active'));
        $this->safe = in_array($safe, ['active', 'off'], true) ? $safe : 'active';
        $device = trim((string) ($serpApiConfig['device'] ?? 'desktop'));
        $this->device = in_array($device, ['desktop', 'tablet', 'mobile'], true)
            ? $device
            : 'desktop';
        $this->userAgent = trim((string) (
            $appConfig['user_agent']
            ?? 'HueSense-ReferenceDiscovery'
        ));

        if ($this->apiKey === '') {
            throw new InvalidArgumentException('尚未設定 SerpApi API Key。');
        }

        if (
            $this->apiBaseUrl === ''
            || filter_var($this->apiBaseUrl, FILTER_VALIDATE_URL) === false
        ) {
            throw new InvalidArgumentException('SerpApi API URL 不正確。');
        }

        if ($this->engine !== 'google_images') {
            throw new InvalidArgumentException(
                'Reference Discovery 目前只支援 SerpApi engine=google_images。'
            );
        }
    }

    /**
     * Keep the same method shape as the existing image-provider adapters.
     * One SerpApi Google Images page normally yields a large batch; this method
     * only keeps the requested number for the current query family.
     *
     * @return array<string,mixed>
     */
    public function searchPhotos(string $query, int $page = 1, int $perPage = 20): array
    {
        $query = trim($query);
        if ($query === '') {
            throw new InvalidArgumentException('SerpApi 圖片搜尋文字不可為空白。');
        }

        $page = max(1, $page);
        $perPage = max(1, min(100, $perPage));

        $params = [
            'engine' => $this->engine,
            'q' => $query,
            'api_key' => $this->apiKey,
            'ijn' => $page - 1,
            'hl' => $this->hl,
            'gl' => $this->gl,
            'safe' => $this->safe,
            'device' => $this->device,
            'output' => 'json',
        ];

        $url = $this->apiBaseUrl . '?' . http_build_query(
            $params,
            '',
            '&',
            PHP_QUERY_RFC3986
        );

        $payload = $this->requestJson($url);
        $rawResults = is_array($payload['images_results'] ?? null)
            ? $payload['images_results']
            : [];

        $results = [];
        foreach ($rawResults as $image) {
            if (!is_array($image)) {
                continue;
            }

            $originalImageUrl = trim((string) ($image['original'] ?? ''));
            $thumbnailUrl = trim((string) ($image['thumbnail'] ?? ''));
            $sourcePageUrl = trim((string) ($image['link'] ?? ''));

            // SerpApi may expose internal x-raw-image:// references for PDFs.
            // They are not browser-loadable images, so skip them structurally.
            if (str_starts_with($originalImageUrl, 'x-raw-image://')) {
                $originalImageUrl = '';
            }

            if ($originalImageUrl === '' && $thumbnailUrl === '') {
                continue;
            }

            $title = trim((string) ($image['title'] ?? ''));
            $source = trim((string) ($image['source'] ?? ''));
            $position = (int) ($image['position'] ?? (count($results) + 1));

            $idSource = $originalImageUrl !== ''
                ? $originalImageUrl
                : ($sourcePageUrl !== '' ? $sourcePageUrl : $thumbnailUrl);

            $id = 'serpapi_google_images_' . substr(
                hash('sha256', $idSource),
                0,
                20
            );

            $results[] = [
                'id' => $id,
                'provider_id' => $id,
                'provider' => 'serpapi_google_images',
                'provider_name' => 'SerpApi Google Images',
                'provider_url' => 'https://serpapi.com/google-images-api',
                'width' => (int) ($image['original_width'] ?? 0),
                'height' => (int) ($image['original_height'] ?? 0),
                'color' => '#e9e8e4',
                'alt' => $title !== '' ? $title : 'Google Images result',
                'image_small' => $thumbnailUrl !== '' ? $thumbnailUrl : $originalImageUrl,
                'image_regular' => $originalImageUrl !== '' ? $originalImageUrl : $thumbnailUrl,
                'analysis_url' => $originalImageUrl !== '' ? $originalImageUrl : $thumbnailUrl,
                'photo_url' => $sourcePageUrl,
                'download_location' => '',
                'photographer' => $source !== '' ? $source : 'Web source',
                'photographer_url' => $sourcePageUrl,
                'serpapi_rank' => $position,
                'source_name' => $source,
                'source_domain' => $this->extractDomain($sourcePageUrl),
            ];

            if (count($results) >= $perPage) {
                break;
            }
        }

        return [
            'total' => count($results),
            'total_pages' => 1,
            'results' => $results,
        ];
    }

    /** @return array<string,mixed> */
    private function requestJson(string $url): array
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException(
                'PHP cURL 尚未啟用，請在 XAMPP php.ini 啟用 extension=curl。'
            );
        }

        $curl = curl_init($url);
        if ($curl === false) {
            throw new RuntimeException('無法建立 SerpApi Google Images 連線。');
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
            ],
            // Let cURL negotiate/decode compressed responses automatically.
            CURLOPT_ENCODING => '',
            CURLOPT_USERAGENT => $this->userAgent,
        ]);

        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($body === false) {
            throw new RuntimeException(
                '連線 SerpApi Google Images 失敗：' . ($curlError ?: '未知錯誤')
            );
        }

        $decoded = json_decode($body, true);

        if ($status < 200 || $status >= 300) {
            $message = 'SerpApi Google Images API 請求失敗。';
            if (is_array($decoded) && isset($decoded['error'])) {
                $error = $decoded['error'];
                if (is_string($error)) {
                    $message = trim($error);
                } elseif (is_array($error)) {
                    $encoded = json_encode(
                        $error,
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                    );
                    if (is_string($encoded) && $encoded !== '') {
                        $message = $encoded;
                    }
                }
            } elseif (is_string($body) && trim($body) !== '') {
                $message = trim(mb_substr(strip_tags($body), 0, 500));
            }

            throw new RuntimeException($message . '（HTTP ' . $status . '）');
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('SerpApi Google Images 回傳了無法解析的 JSON。');
        }

        if (isset($decoded['error'])) {
            $error = $decoded['error'];
            $message = is_string($error)
                ? trim($error)
                : (string) json_encode($error, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            throw new RuntimeException('SerpApi：' . ($message !== '' ? $message : '搜尋失敗'));
        }

        return $decoded;
    }

    private function extractDomain(string $url): string
    {
        if ($url === '') {
            return '';
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (!is_string($host)) {
            return '';
        }

        return strtolower((string) preg_replace('/^www\./i', '', $host));
    }
}
