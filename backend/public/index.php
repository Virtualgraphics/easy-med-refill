<?php
declare(strict_types=1);

/**
 * Easy MedRefill API front controller.
 * Document root of api.easy-medrefill.com must point at this "public" folder;
 * everything else (src, config, cron) stays outside the web root.
 */
require __DIR__ . '/../src/bootstrap.php';

use EasyMedRefill\Api;
use EasyMedRefill\Config;

$config = Config::load(__DIR__ . '/../config/config.php');
(new Api($config))->handle(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'
);
