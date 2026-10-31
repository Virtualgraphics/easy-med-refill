<?php
declare(strict_types=1);

/**
 * Alternative front controller for when the subdomain's web root is the
 * backend folder itself (instead of backend/public). src/, config/ and
 * cron/ are then inside the web root and are protected by their .htaccess.
 */
require __DIR__ . '/src/bootstrap.php';

use EasyMedRefill\Api;
use EasyMedRefill\Config;

$config = Config::load(__DIR__ . '/config/config.php');
(new Api($config))->handle(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'
);
