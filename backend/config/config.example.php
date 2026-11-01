<?php
/**
 * Copy to config/config.php (gitignored) and fill in the secrets.
 * Keep config/ outside the web root; only public/ is served.
 */
return [
    'db' => [
        'host' => 'ehozimoc.mysql.db.internal',
        'port' => 3306,
        'name' => 'ehozimoc_easymedrefill',
        'user' => 'ehozimoc_medi',
        'password' => 'FILL_ME',
    ],
    'smtp' => [
        'host' => 'asmtp.mail.hostpoint.ch',
        'port' => 465,                       // implicit TLS; 587 switches to STARTTLS
        'user' => 'reorder@easy-medrefill.com',
        'password' => 'FILL_ME',
        'from' => 'reorder@easy-medrefill.com',
        'from_name' => 'Easy MedRefill',
        // 'reply_to' => 'reorder@easy-medrefill.com',
    ],
    // Shared secret the app sends as X-Api-Key. Generate with: openssl rand -hex 32
    'api_key' => 'FILL_ME',
    // Public base URL, used for the confirmation links in emails.
    'base_url' => 'https://api.easy-medrefill.com',
    // Meta Model API key (dev.meta.ai). Used server-side only: photo list extraction, shortage feed.
    'meta_api_key' => 'FILL_ME',
    'meta_api_base' => 'https://api.meta.ai/v1',
    'meta_model' => 'muse-spark-1.3',
    // Follow-up email after this many days without confirmation, at most max_follow_ups times.
    'follow_up_after_days' => 3,
    'max_follow_ups' => 2,
];
