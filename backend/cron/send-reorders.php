<?php
declare(strict_types=1);

/**
 * Sends queued reorder emails (those whose immediate send failed).
 * Cron: every 10 minutes: php /path/to/backend/cron/send-reorders.php
 */
require __DIR__ . '/../src/bootstrap.php';

use EasyMedRefill\Config;
use EasyMedRefill\Db;
use EasyMedRefill\Mailer;
use EasyMedRefill\ReorderRepository;

$config = Config::load(__DIR__ . '/../config/config.php');
$repo = new ReorderRepository(Db::connect($config));
$mailer = new Mailer($config);

$sent = 0;
$failed = 0;
foreach ($repo->queued() as $row) {
    try {
        $mailer->sendReorder($row);
        $repo->markSent((string) $row['id']);
        $sent++;
    } catch (\Throwable $e) {
        $repo->markFailed((string) $row['id'], $e->getMessage());
        $failed++;
    }
}
echo date('c') . " send-reorders: sent=$sent failed=$failed\n";
