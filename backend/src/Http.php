<?php
declare(strict_types=1);

namespace EasyMedRefill;

final class HttpError extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

final class Http
{
    /** @param array<string, mixed> $data */
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function html(string $body, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo $body;
        exit;
    }

    /** @return array<string, mixed> */
    public static function readJson(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            throw new HttpError(400, 'Empty request body');
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new HttpError(400, 'Body is not valid JSON');
        }
        return $data;
    }

    /** @return array<string, mixed> empty array when there is no body */
    public static function readJsonOrEmpty(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if (trim($raw) === '') {
            return [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        return is_string($value) && $value !== '' ? $value : null;
    }

    public static function requireApiKey(Config $config): void
    {
        $given = self::header('X-Api-Key') ?? '';
        $expected = (string) $config->get('api_key');
        if ($given === '' || !hash_equals($expected, $given)) {
            throw new HttpError(401, 'Invalid API key');
        }
    }
}
