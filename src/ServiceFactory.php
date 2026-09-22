<?php

declare(strict_types=1);

require_once __DIR__ . '/OpenRouterClient.php';
require_once __DIR__ . '/UnsplashClient.php';
require_once __DIR__ . '/PexelsClient.php';
require_once __DIR__ . '/PixabayClient.php';

final class ServiceFactory
{
    /** @param array<string, mixed> $config */
    public static function openRouter(array $config): ?OpenRouterClient
    {
        $ai = is_array($config['ai'] ?? null) ? $config['ai'] : [];
        $app = is_array($config['app'] ?? null) ? $config['app'] : [];

        if (($ai['enabled'] ?? true) !== true) {
            return null;
        }

        $provider = strtolower(trim((string) ($ai['provider'] ?? 'openrouter')));
        if ($provider !== 'openrouter') {
            throw new RuntimeException(
                '目前專案只支援 OpenRouter，請將 config/config.php 的 ai.provider 設為 openrouter。'
            );
        }

        $key = trim((string) ($ai['api_key'] ?? ''));
        if (!self::isConfiguredValue($key)) {
            return null;
        }

        return new OpenRouterClient($ai, $app);
    }

    /** @param array<string, mixed> $config */
    public static function unsplash(array $config): UnsplashClient
    {
        $unsplash = is_array($config['unsplash'] ?? null) ? $config['unsplash'] : [];
        $app = is_array($config['app'] ?? null) ? $config['app'] : [];

        $key = trim((string) ($unsplash['access_key'] ?? ''));
        if (!self::isConfiguredValue($key)) {
            throw new RuntimeException('請先到 config/config.php 貼上 Unsplash Access Key。');
        }

        return new UnsplashClient($unsplash, $app);
    }

    /** @param array<string, mixed> $config */
    public static function pexels(array $config): PexelsClient
    {
        $pexels = is_array($config['pexels'] ?? null) ? $config['pexels'] : [];
        $app = is_array($config['app'] ?? null) ? $config['app'] : [];

        $key = trim((string) ($pexels['api_key'] ?? ''));
        if (!self::isConfiguredValue($key)) {
            throw new RuntimeException('請先到 config/config.php 貼上 Pexels API Key。');
        }

        return new PexelsClient($pexels, $app);
    }

    /** @param array<string, mixed> $config */
    public static function pixabay(array $config): PixabayClient
    {
        $pixabay = is_array($config['pixabay'] ?? null) ? $config['pixabay'] : [];
        $app = is_array($config['app'] ?? null) ? $config['app'] : [];

        $key = trim((string) ($pixabay['api_key'] ?? ''));
        if (!self::isConfiguredValue($key)) {
            throw new RuntimeException('請先到 config/config.php 貼上 Pixabay API Key。');
        }

        return new PixabayClient($pixabay, $app);
    }

    /**
     * 回傳目前已啟用且有填 Key 的圖片 API。
     * 缺少其中一組 Key 時，仍可繼續使用其他已設定的圖庫。
     *
     * @param array<string, mixed> $config
     * @return array<string, UnsplashClient|PexelsClient|PixabayClient>
     */
    public static function photoProviders(array $config): array
    {
        $providers = [];

        $unsplash = is_array($config['unsplash'] ?? null) ? $config['unsplash'] : [];
        $unsplashEnabled = ($unsplash['enabled'] ?? true) === true;
        $unsplashKey = trim((string) ($unsplash['access_key'] ?? ''));
        if ($unsplashEnabled && self::isConfiguredValue($unsplashKey)) {
            $providers['unsplash'] = self::unsplash($config);
        }

        $pexels = is_array($config['pexels'] ?? null) ? $config['pexels'] : [];
        $pexelsEnabled = ($pexels['enabled'] ?? false) === true;
        $pexelsKey = trim((string) ($pexels['api_key'] ?? ''));
        if ($pexelsEnabled && self::isConfiguredValue($pexelsKey)) {
            $providers['pexels'] = self::pexels($config);
        }

        $pixabay = is_array($config['pixabay'] ?? null) ? $config['pixabay'] : [];
        $pixabayEnabled = ($pixabay['enabled'] ?? false) === true;
        $pixabayKey = trim((string) ($pixabay['api_key'] ?? ''));
        if ($pixabayEnabled && self::isConfiguredValue($pixabayKey)) {
            $providers['pixabay'] = self::pixabay($config);
        }

        if ($providers === []) {
            throw new RuntimeException(
                '沒有可用的圖片 API。請在 config/config.php 至少設定 Unsplash、Pexels 或 Pixabay 其中一組 Key。'
            );
        }

        return $providers;
    }

    private static function isConfiguredValue(string $value): bool
    {
        if ($value === '') {
            return false;
        }

        return !str_starts_with($value, 'PASTE_YOUR_');
    }
}
