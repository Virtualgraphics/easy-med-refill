<?php
declare(strict_types=1);

namespace EasyMedRefill;

use PDO;

/**
 * Builds the shortage list the app downloads and matches on the device.
 *
 * Sources:
 *  - bwl: the federal "Wirkstoffliste Teilmengenabgabe" (BWL Meldestelle),
 *    a monthly PDF of active ingredients in supply disruption. Muse Spark
 *    reads the PDF by URL and returns ATC code + ingredient rows.
 *  - simulated: cron/shortages.simulated.json for demos.
 *  drugshortage.ch is NOT fetched: its terms require a licence for use in
 *  other products. That stays a partnership conversation.
 */
final class ShortageFeed
{
    public const BWL_PAGE = 'https://www.bwl.admin.ch/de/meldestelle-heilmittel';

    /** Re-read the BWL list at most this often (seconds). */
    public const BWL_MIN_INTERVAL = 6 * 3600;

    private const INSTRUCTIONS = <<<'TXT'
You transcribe an official Swiss federal document (BWL "Wirkstoffliste Teilmengenabgabe"): a list of active ingredients
affected by supply disruptions, each line with an ATC code and the substance name, sometimes with a synonym in parentheses.
Rules: transcribe every listed line exactly once; keep the ATC code as printed (e.g. J01CR02); put the main substance name in
active_ingredient and any alternative names or components (from parentheses or slashes) in synonyms; copy the "Gültig ab" date
as YYYY-MM-DD into valid_from. Do not add, infer or comment on anything.
TXT;

    /** @return array<string, mixed> */
    private static function schema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'valid_from' => ['type' => ['string', 'null'], 'description' => 'YYYY-MM-DD'],
                'entries' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'atc' => ['type' => 'string'],
                            'active_ingredient' => ['type' => 'string'],
                            'synonyms' => ['type' => 'array', 'items' => ['type' => 'string']],
                        ],
                        'required' => ['atc', 'active_ingredient', 'synonyms'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            'required' => ['valid_from', 'entries'],
            'additionalProperties' => false,
        ];
    }

    /** Finds the newest "Liste Teilmengen DD.MM.YYYY-D.pdf" link on the BWL page. */
    public static function currentBwlPdfUrl(): ?string
    {
        $html = self::httpGet(self::BWL_PAGE);
        if ($html === null) {
            return null;
        }
        if (!preg_match_all('#https://www\.bwl\.admin\.ch/dam/de/sd-web/[^"\s]+/Liste%20Teilmengen%20(\d{2})\.(\d{2})\.(\d{4})-D\.pdf#', $html, $m, PREG_SET_ORDER)) {
            return null;
        }
        usort($m, static fn(array $a, array $b): int => strcmp("$b[3]$b[2]$b[1]", "$a[3]$a[2]$a[1]"));
        return $m[0][0];
    }

    /**
     * Reads the current BWL list through Muse Spark.
     * @return array<int, array{source: string, product_code: string, active_ingredient: ?string, status: ?string}>
     */
    public static function fetchBwl(MetaClient $client): array
    {
        $url = self::currentBwlPdfUrl();
        if ($url === null) {
            throw new \RuntimeException('BWL list PDF not found on the Meldestelle page');
        }
        $result = $client->extractJsonFromFileUrl(
            self::INSTRUCTIONS,
            'Transcribe this list into the JSON schema.',
            $url,
            'BwlShortageList',
            self::schema()
        );
        $validFrom = is_string($result['valid_from'] ?? null) ? $result['valid_from'] : null;
        $rows = [];
        foreach (is_array($result['entries'] ?? null) ? $result['entries'] : [] as $entry) {
            $atc = strtoupper(trim((string) ($entry['atc'] ?? '')));
            $ingredient = trim((string) ($entry['active_ingredient'] ?? ''));
            if (!preg_match('/^[A-Z]\d{2}[A-Z]{2}\d{2}$/', $atc) || $ingredient === '') {
                continue;
            }
            $synonyms = array_values(array_filter(array_map('trim', is_array($entry['synonyms'] ?? null) ? $entry['synonyms'] : []), 'strlen'));
            $names = implode(' / ', array_unique(array_merge([$ingredient], $synonyms)));
            $rows[] = [
                'source' => 'bwl',
                'product_code' => 'ATC:' . $atc,
                'active_ingredient' => mb_substr($names, 0, 190),
                'status' => mb_substr('Versorgungsstörung gemeldet (BWL Wirkstoffliste' . ($validFrom ? ", gültig ab $validFrom" : '') . ')', 0, 64),
            ];
        }
        return $rows;
    }

    /** @return array<int, array{source: string, product_code: string, active_ingredient: ?string, status: ?string}> */
    public static function loadSimulated(): array
    {
        $raw = @file_get_contents(__DIR__ . '/../cron/shortages.simulated.json');
        $data = $raw === false ? [] : json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    /**
     * Replaces the rows of each source present in $rows. Sources absent from
     * $rows are left untouched, so a failed fetch never wipes good data.
     * @param array<int, array{source: string, product_code: string, active_ingredient: ?string, status: ?string}> $rows
     */
    public static function store(PDO $pdo, array $rows): int
    {
        $now = Db::now();
        $sources = array_values(array_unique(array_map(static fn(array $r): string => (string) $r['source'], $rows)));
        $pdo->beginTransaction();
        try {
            foreach ($sources as $source) {
                $pdo->prepare('DELETE FROM shortages WHERE source = ?')->execute([$source]);
            }
            $insert = $pdo->prepare('INSERT INTO shortages (source, product_code, active_ingredient, status, fetched_at) VALUES (?, ?, ?, ?, ?)');
            foreach ($rows as $row) {
                $insert->execute([$row['source'], $row['product_code'], $row['active_ingredient'] ?? null, $row['status'] ?? null, $now]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return count($rows);
    }

    /** Seconds since the BWL rows were last fetched, or null if never. */
    public static function bwlAgeSeconds(PDO $pdo): ?int
    {
        $row = $pdo->query("SELECT MAX(fetched_at) AS t FROM shortages WHERE source = 'bwl'")->fetch();
        if (!$row || !$row['t']) {
            return null;
        }
        return time() - strtotime((string) $row['t'] . ' UTC');
    }

    /**
     * Full refresh: simulated feed always, BWL via Muse when stale or forced.
     * @return array{simulated: int, bwl: int|null, bwl_error: ?string}
     */
    public static function refresh(Config $config, PDO $pdo, bool $force = false): array
    {
        $simulated = self::store($pdo, self::loadSimulated());

        $age = self::bwlAgeSeconds($pdo);
        if (!$force && $age !== null && $age < self::BWL_MIN_INTERVAL) {
            return ['simulated' => $simulated, 'bwl' => null, 'bwl_error' => null];
        }
        try {
            $rows = self::fetchBwl(MetaClient::fromConfig($config));
            $bwl = self::store($pdo, $rows);
            return ['simulated' => $simulated, 'bwl' => $bwl, 'bwl_error' => null];
        } catch (\Throwable $e) {
            error_log('[easymedrefill] BWL fetch failed: ' . $e->getMessage());
            return ['simulated' => $simulated, 'bwl' => null, 'bwl_error' => mb_substr($e->getMessage(), 0, 200)];
        }
    }

    private static function httpGet(string $url): ?string
    {
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERAGENT => 'EasyMedRefill/1.0 (+https://easy-medrefill.com)',
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return $body === false || $status >= 400 ? null : (string) $body;
    }
}
