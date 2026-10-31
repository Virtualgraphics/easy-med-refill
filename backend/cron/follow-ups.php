<?php
declare(strict_types=1);

/**
 * Sends a reminder for sent requests with no confirmation after
 * follow_up_after_days, up to max_follow_ups times, and marks them overdue
 * so the app can show it.
 * Cron: 0 8 * * *  php /path/to/backend/cron/follow-ups.php
 */
require __DIR__ . '/../src/bootstrap.php';

use EasyMedRefill\Config;
use EasyMedRefill\Db;
use EasyMedRefill\Mailer;
use EasyMedRefill\ReorderRepository;

$config = Config::load(__DIR__ . '/../config/config.php');
$repo = new ReorderRepository(Db::connect($config));
$mailer = new Mailer($config);

$days = (int) $config->get('follow_up_after_days', 3);
$max = (int) $config->get('max_follow_ups', 2);

$sent = 0;
$failed = 0;
foreach ($repo->awaitingFollowUp($days, $max) as $row) {
    try {
        $mailer->sendFollowUp($row);
        $repo->markFollowedUp((string) $row['id']);
        $sent++;
    } catch (\Throwable $e) {
        $repo->markFailed((string) $row['id'], $e->getMessage());
        $failed++;
    }
}
echo date('c') . " follow-ups: sent=$sent failed=$failed\n";
