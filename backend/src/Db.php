<?php
declare(strict_types=1);

namespace EasyMedRefill;

use PDO;

final class Db
{
    private static ?PDO $pdo = null;

    public static function connect(Config $config): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        $db = $config->section('db');
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $db['host'],
            (int) ($db['port'] ?? 3306),
            $db['name']
        );
        self::$pdo = new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return self::$pdo;
    }

    public static function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }
}
