<?php
declare(strict_types=1);

/**
 * Refreshes the shortage list the app downloads and matches on the device:
 * the simulated demo feed plus the federal BWL list read by Muse Spark.
 * Cron: every 6 hours: php /path/to/backend/cron/fetch-shortages.php
 */
require __DIR__ . '/../src/bootstrap.php';

use EasyMedRefill\Config;
use EasyMedRefill\Db;
use EasyMedRefill\ShortageFeed;

$config = Config::load(__DIR__ . '/../config/config.php');
$result = ShortageFeed::refresh($config, Db::connect($config), in_array('--force', $argv ?? [], true));

echo date('c') . ' fetch-shortages: simulated=' . $result['simulated']
    . ' bwl=' . ($result['bwl'] === null ? 'skipped' : $result['bwl'])
    . ($result['bwl_error'] ? ' bwl_error=' . $result['bwl_error'] : '') . "\n";
