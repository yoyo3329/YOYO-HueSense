<?php

declare(strict_types=1);

require_once __DIR__ . '/SerpApiGoogleImagesClient.php';

/**
 * ReferenceDiscoveryService
 *
 * IMPORTANT:
 * - Developer-only Reference Discovery test.
 * - It intentionally DOES NOT run Content Gate, CLIP, Vision, Ranking,
 *   ToneAnalyzer, or A/B/C.
 * - It returns a broad raw reference pool so humans can inspect the
 *   "teaching material" before any visual learning is enabled.
 *
 * Current Reference provider:
 * SerpApi Google Images API (engine=google_images).
 * Unsplash / Pexels / Pixabay remain separate Display Pool providers.
 */
final class ReferenceDiscoveryService
{
    /** @var array<string,mixed> */
    private array $config;

    /** @var array<string,object> */
    private array $providers = [];

    public function __construct(array $config)
    {
        $this->config = $config;

        $app = is_array($config['app'] ?? null) ? $config['app'] : [];

        // Reference Pool uses broad Web/Image Search only.
        // Unsplash / Pexels / Pixabay remain Display Pool providers elsewhere.
        if (($config['serpapi']['enabled'] ?? false) === true) {
            $this->providers['serpapi_google_images'] = new SerpApiGoogleImagesClient(
                $config['serpapi'],
                $app
            );
        }


        if ($this->providers === []) {
            throw new RuntimeException(
                'Reference Discovery 沒有可用 Provider。請在 config/config.php 啟用 serpapi 並設定 API Key。'
            );
        }
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public function discover(array $payload): array
    {
        $query = trim((string) ($payload['q'] ?? ''));
        if ($query === '') {
            throw new InvalidArgumentException('請輸入要測試的視覺概念。');
        }

        $target = max(50, min(100, (int) ($payload['target'] ?? 80)));
        $families = $this->buildQueryFamilies($query);

        if ($families === []) {
            $families = [
                ['family' => 'core', 'query' => $query],
            ];
        }

        $providerCount = max(1, count($this->providers));
        $familyCount = max(1, count($families));

        // SerpApi Google Images returns a broad image batch for each query.
        // Keep only the amount needed per query family, asking slightly above target for dedupe.
        $perProviderPerFamily = (int) ceil(($target * 1.15) / ($providerCount * $familyCount));
        $perProviderPerFamily = max(5, min(30, $perProviderPerFamily));

        $itemsById = [];
        $providerStats = [];
        $familyStats = [];
        $errors = [];

        foreach (array_keys($this->providers) as $providerId) {
            $providerStats[$providerId] = [
                'requested' => 0,
                'fetched' => 0,
                'unique_kept' => 0,
            ];
        }

        foreach ($families as $family) {
            $familyKey = (string) $family['family'];
            $familyStats[$familyKey] = [
                'query' => (string) $family['query'],
                'fetched' => 0,
                'unique_kept' => 0,
            ];

            foreach ($this->providers as $providerId => $provider) {
                $providerStats[$providerId]['requested'] += $perProviderPerFamily;

                try {
                    $response = $provider->searchPhotos(
                        (string) $family['query'],
                        1,
                        $perProviderPerFamily
                    );

                    $photos = is_array($response['results'] ?? null)
                        ? $response['results']
                        : [];

                    $providerStats[$providerId]['fetched'] += count($photos);
                    $familyStats[$familyKey]['fetched'] += count($photos);

                    foreach ($photos as $photo) {
                        if (!is_array($photo)) {
                            continue;
                        }

                        $id = trim((string) ($photo['id'] ?? ''));
                        $imageUrl = trim((string) ($photo['image_regular'] ?? $photo['image_small'] ?? ''));

                        if ($id === '' || $imageUrl === '') {
                            continue;
                        }

                        if (!isset($itemsById[$id])) {
                            $itemsById[$id] = [
                                'id' => $id,
                                'provider' => (string) ($photo['provider'] ?? $providerId),
                                'provider_name' => (string) ($photo['provider_name'] ?? ucfirst($providerId)),
                                'query_family' => $familyKey,
                                'query' => (string) $family['query'],
                                'all_query_families' => [$familyKey],
                                'all_queries' => [(string) $family['query']],
                                'image_small' => (string) ($photo['image_small'] ?? ''),
                                'image_regular' => $imageUrl,
                                'analysis_url' => (string) ($photo['analysis_url'] ?? ''),
                                'photo_url' => (string) ($photo['photo_url'] ?? ''),
                                'alt' => (string) ($photo['alt'] ?? ''),
                                'photographer' => (string) ($photo['photographer'] ?? ''),
                                'photographer_url' => (string) ($photo['photographer_url'] ?? ''),
                                'source_name' => (string) ($photo['source_name'] ?? ''),
                                'source_domain' => (string) ($photo['source_domain'] ?? ''),
                                'provider_rank' => (int) ($photo['serpapi_rank'] ?? 0),
                            ];
                            $providerStats[$providerId]['unique_kept']++;
                            $familyStats[$familyKey]['unique_kept']++;
                        } else {
                            if (!in_array($familyKey, $itemsById[$id]['all_query_families'], true)) {
                                $itemsById[$id]['all_query_families'][] = $familyKey;
                            }
                            if (!in_array((string) $family['query'], $itemsById[$id]['all_queries'], true)) {
                                $itemsById[$id]['all_queries'][] = (string) $family['query'];
                            }
                        }
                    }
                } catch (Throwable $error) {
                    $errors[] = [
                        'provider' => $providerId,
                        'query_family' => $familyKey,
                        'query' => (string) $family['query'],
                        'message' => $error->getMessage(),
                    ];
                }
            }
        }

        // Interleave providers + query families instead of simply taking the first N.
        $items = array_values($itemsById);
        usort(
            $items,
            static function (array $a, array $b): int {
                $aKey = ($a['query_family'] ?? '') . '|' . ($a['provider'] ?? '') . '|' . ($a['id'] ?? '');
                $bKey = ($b['query_family'] ?? '') . '|' . ($b['provider'] ?? '') . '|' . ($b['id'] ?? '');
                return strcmp($aKey, $bKey);
            }
        );

        if (count($items) > $target) {
            $items = $this->balancedSlice($items, $target, $families);
        }

        $finalProviderDistribution = [];
        $finalFamilyDistribution = [];

        foreach ($items as $item) {
            $source = trim((string) ($item['source_domain'] ?? ''));
            if ($source === '') {
                $source = trim((string) ($item['source_name'] ?? ''));
            }
            if ($source === '') {
                $source = 'unknown';
            }
            $family = (string) ($item['query_family'] ?? 'unknown');
            $finalProviderDistribution[$source] = ($finalProviderDistribution[$source] ?? 0) + 1;
            $finalFamilyDistribution[$family] = ($finalFamilyDistribution[$family] ?? 0) + 1;
        }

        ksort($finalProviderDistribution);
        ksort($finalFamilyDistribution);

        return [
            'ok' => true,
            'mode' => 'reference_discovery_debug',
            'pool_role' => 'REFERENCE_ONLY',
            'affects_display_search' => false,
            'filters_applied' => [
                'content_gate' => false,
                'clip' => false,
                'vision' => false,
                'ranking' => false,
                'tone_analyzer' => false,
                'abc' => false,
            ],
            'source_mode' => 'serpapi_google_images',
            'source_warning' =>
                'Reference Discovery 本頁只使用 SerpApi Google Images 建立 Web Reference Pool。Unsplash/Pexels/Pixabay 不參與此 Reference Pool，仍保留給後續 Display Pool 使用。這批 Reference 不會自動寫入正式 Profile。',
            'input' => $query,
            'target_reference_count' => $target,
            'reference_count' => count($items),
            'query_families' => $families,
            'source_distribution' => $finalProviderDistribution,
            'query_family_distribution' => $finalFamilyDistribution,
            'provider_debug' => $providerStats,
            'query_family_debug' => $familyStats,
            'provider_errors' => $errors,
            'dead_url_count' => null,
            'dead_url_ratio' => null,
            'dead_url_note' => '由測試頁在圖片實際載入時即時計算；後端不額外對每張 URL 發送 HEAD，以免測試本身產生大量額外請求。',
            'references' => $items,
        ];
    }

    /**
     * @return array<int,array{family:string,query:string}>
     */
    private function buildQueryFamilies(string $query): array
    {
        $canonical = strtolower(trim($query));

        // Conservative debug seed. It is NOT a validated profile.
        if (in_array($canonical, ['y2k', 'y2k aesthetic', '2000s y2k'], true)) {
            $seedPath = dirname(__DIR__) . '/data/reference-seeds/y2k.json';
            if (is_file($seedPath)) {
                $decoded = json_decode((string) file_get_contents($seedPath), true);
                if (is_array($decoded['query_families'] ?? null)) {
                    $result = [];
                    foreach ($decoded['query_families'] as $item) {
                        if (!is_array($item)) {
                            continue;
                        }
                        $family = trim((string) ($item['family'] ?? ''));
                        $q = trim((string) ($item['query'] ?? ''));
                        if ($family !== '' && $q !== '') {
                            $result[] = ['family' => $family, 'query' => $q];
                        }
                    }
                    if ($result !== []) {
                        return array_slice($result, 0, 6);
                    }
                }
            }
        }

        // Generic unknown concept: keep discovery conservative.
        // We intentionally do not invent domain facts here.
        return [
            ['family' => 'core', 'query' => $query],
            ['family' => 'aesthetic_context', 'query' => $query . ' aesthetic'],
            ['family' => 'editorial_context', 'query' => $query . ' editorial'],
        ];
    }

    /**
     * @param array<int,array<string,mixed>> $items
     * @param array<int,array{family:string,query:string}> $families
     * @return array<int,array<string,mixed>>
     */
    private function balancedSlice(array $items, int $target, array $families): array
    {
        $buckets = [];
        foreach ($items as $item) {
            $family = (string) ($item['query_family'] ?? 'unknown');
            $provider = (string) ($item['provider'] ?? 'unknown');
            $key = $family . '|' . $provider;
            $buckets[$key][] = $item;
        }

        $result = [];
        $seen = [];
        $keys = array_keys($buckets);
        $cursor = 0;

        while (count($result) < $target && $keys !== []) {
            $key = $keys[$cursor % count($keys)];

            if (!empty($buckets[$key])) {
                $item = array_shift($buckets[$key]);
                $id = (string) ($item['id'] ?? '');

                if ($id !== '' && !isset($seen[$id])) {
                    $seen[$id] = true;
                    $result[] = $item;
                }
            }

            if (empty($buckets[$key])) {
                unset($buckets[$key]);
                $keys = array_values(array_keys($buckets));
                $cursor = 0;
                continue;
            }

            $cursor++;
        }

        return $result;
    }
}
