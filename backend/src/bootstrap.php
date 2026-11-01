<?php
declare(strict_types=1);

/** No Composer on purpose: plain requires keep deployment to a file upload. */
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
date_default_timezone_set('Europe/Zurich');
mb_internal_encoding('UTF-8');

require __DIR__ . '/Config.php';
require __DIR__ . '/Db.php';
require __DIR__ . '/Http.php';
require __DIR__ . '/Smtp.php';
require __DIR__ . '/Mailer.php';
require __DIR__ . '/ReorderRepository.php';
require __DIR__ . '/PracticePage.php';
require __DIR__ . '/MetaClient.php';
require __DIR__ . '/PlanExtractor.php';
require __DIR__ . '/ShortageFeed.php';
require __DIR__ . '/Api.php';
