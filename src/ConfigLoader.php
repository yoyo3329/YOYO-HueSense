<?php

declare(strict_types=1);

final class ConfigLoader
{
    /** @return array<string, mixed> */
    public static function load(): array
    {
        $path = __DIR__ . '/../config/config.php';
        if (!is_file($path)) {
            throw new RuntimeException('找不到 config/config.php。');
        }

        $config = require $path;
        if (!is_array($config)) {
            throw new RuntimeException('config/config.php 格式錯誤。');
        }

        return $config;
    }
}
