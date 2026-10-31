<?php
declare(strict_types=1);

namespace EasyMedRefill;

final class Config
{
    /** @param array<string, mixed> $values */
    private function __construct(private array $values)
    {
    }

    public static function load(string $path): self
    {
        if (!is_file($path)) {
            throw new \RuntimeException("Missing config file: copy config/config.example.php to config/config.php");
        }
        /** @var array<string, mixed> $values */
        $values = require $path;
        foreach (['db', 'smtp', 'api_key', 'base_url'] as $key) {
            if (empty($values[$key])) {
                throw new \RuntimeException("Config key '$key' is missing");
            }
        }
        return new self($values);
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->values[$key] ?? $default;
    }

    /** @return array<string, mixed> */
    public function section(string $key): array
    {
        $section = $this->values[$key] ?? [];
        return is_array($section) ? $section : [];
    }
}
