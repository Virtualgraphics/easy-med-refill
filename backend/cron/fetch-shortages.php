<?php
declare(strict_types=1);

/**
 * Refreshes the shortage list the app downloads and matches on the device.
 * For the hackathon this loads the simulated feed next to this script;
 * a drugshortage.ch / BWL fetch replaces loadFeed() once a data partnership exists.
 * Cron: 0 */6 * * *  php /path/to/backend/cron/fetch-shortages.php
 */
require __DIR__ . '/../src/bootstrap.php';

use EasyMedRefill\Config;
use EasyMedRefill\Db;

/** @return array<int, array{source: string, product_code: string, active_ingredient: ?string, status: ?string}> */
function loadFeed(): array
{
    $raw = file_get_contents(__DIR__ . '/shortages.simulated.json');
    $data = $raw === false ? [] : json_decode($raw, true);
    return is_array($data) ? $data : [];
}

$config = Config::load(__DIR__ . '/../config/config.php');
$pdo = Db::connect($config);
$now = Db::now();

$feed = loadFeed();
$pdo->beginTransaction();
try {
    $sources = array_values(array_unique(array_map(static fn(array $r): string => (string) $r['source'], $feed)));
    foreach ($sources as $source) {
        $pdo->prepare('DELETE FROM shortages WHERE source = ?')->execute([$source]);
    }
    $insert = $pdo->prepare('INSERT INTO shortages (source, product_code, active_ingredient, status, fetched_at) VALUES (?, ?, ?, ?, ?)');
    foreach ($feed as $row) {
        $insert->execute([$row['source'], $row['product_code'], $row['active_ingredient'] ?? null, $row['status'] ?? null, $now]);
    }
    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    throw $e;
}
echo date('c') . ' fetch-shortages: ' . count($feed) . " entries\n";
