<?php
declare(strict_types=1);

namespace EasyMedRefill;

use PDO;

final class Api
{
    private PDO $pdo;
    private ReorderRepository $reorders;

    public function __construct(private readonly Config $config)
    {
    }

    public function handle(string $method, string $path): void
    {
        try {
            $this->route($method, rtrim($path, '/') ?: '/');
        } catch (HttpError $e) {
            Http::json(['error' => $e->getMessage()], $e->status);
        } catch (\Throwable $e) {
            error_log('[easymedrefill] ' . get_class($e) . ': ' . $e->getMessage());
            Http::json(['error' => 'Internal error'], 500);
        }
    }

    private function route(string $method, string $path): void
    {
        if ($path === '/health') {
            Http::json(['ok' => true, 'time' => Db::now()]);
        }

        if (preg_match('#^/p/([a-f0-9]{32})(/confirm)?$#', $path, $m)) {
            $this->practice($method, $m[1], isset($m[2]));
        }

        if (str_starts_with($path, '/v1/')) {
            Http::requireApiKey($this->config);
            if ($path !== '/v1/extract-plan') {
                $this->db();
            }
            if ($method === 'POST' && $path === '/v1/reorders') {
                $this->createReorder();
            }
            if ($method === 'GET' && preg_match('#^/v1/reorders/([A-Z0-9]{4,16})$#', $path, $m)) {
                $this->reorderStatus($m[1]);
            }
            if ($method === 'POST' && $path === '/v1/devices') {
                $this->registerDevice();
            }
            if ($method === 'GET' && $path === '/v1/shortages') {
                $this->shortages();
            }
            if ($method === 'POST' && $path === '/v1/shortages/refresh') {
                set_time_limit(120);
                $force = (bool) (Http::readJsonOrEmpty()['force'] ?? false);
                Http::json(ShortageFeed::refresh($this->config, $this->pdo, $force));
            }
            if ($method === 'POST' && $path === '/v1/extract-plan') {
                $this->extractPlan();
            }
        }

        throw new HttpError(404, 'Not found');
    }

    private function db(): void
    {
        $this->pdo = Db::connect($this->config);
        $this->reorders = new ReorderRepository($this->pdo);
    }

    // ---- reorders -------------------------------------------------------

    private function createReorder(): void
    {
        $payload = $this->validateReorder(Http::readJson());

        // Idempotent: the app may retry after a network error.
        $existing = $this->reorders->findById((string) $payload['request_id']);
        $row = $existing ?? $this->reorders->create($payload);

        if ($row['status'] === 'queued') {
            try {
                (new Mailer($this->config))->sendReorder($row);
                $this->reorders->markSent((string) $row['id']);
                $row['status'] = 'sent';
            } catch (\Throwable $e) {
                // Stays queued; cron/send-reorders.php retries.
                $this->reorders->markFailed((string) $row['id'], $e->getMessage());
                error_log('[easymedrefill] send failed for ' . $row['reference'] . ': ' . $e->getMessage());
            }
        }

        Http::json(['reference' => $row['reference'], 'status' => $row['status']], $existing ? 200 : 201);
    }

    private function reorderStatus(string $reference): void
    {
        $row = $this->reorders->findByReference($reference);
        if ($row === null) {
            throw new HttpError(404, 'Unknown reference');
        }
        Http::json(ReorderRepository::publicStatus($row));
    }

    /**
     * @param array<string, mixed> $in
     * @return array<string, mixed>
     */
    private function validateReorder(array $in): array
    {
        $fail = static fn(string $msg): never => throw new HttpError(422, $msg);

        $id = (string) ($in['request_id'] ?? '');
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
            $fail('request_id must be a UUID');
        }
        $language = (string) ($in['language'] ?? 'de');
        if (!in_array($language, ['de', 'en'], true)) {
            $fail('language must be de or en');
        }
        $provider = is_array($in['provider'] ?? null) ? $in['provider'] : [];
        if (!in_array($provider['kind'] ?? null, ['practice', 'pharmacy'], true)) {
            $fail('provider.kind must be practice or pharmacy');
        }
        if (trim((string) ($provider['name'] ?? '')) === '') {
            $fail('provider.name is required');
        }
        $email = (string) ($provider['email'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $fail('provider.email must be a valid address');
        }
        // One request covers every medication ordered together (pickup, not
        // mail). Older app builds sent a single top-level medication.
        $rawItems = $in['items'] ?? null;
        if (!is_array($rawItems) && isset($in['medication'])) {
            $rawItems = [[
                'medication' => $in['medication'],
                'quantity_packs' => $in['quantity_packs'] ?? null,
                'units_remaining' => $in['units_remaining'] ?? null,
                'needed_by' => $in['needed_by'] ?? null,
            ]];
        }
        if (!is_array($rawItems) || count($rawItems) < 1 || count($rawItems) > 20) {
            $fail('items must list between 1 and 20 medications');
        }
        $items = [];
        foreach (array_values($rawItems) as $index => $item) {
            $item = is_array($item) ? $item : [];
            $medication = is_array($item['medication'] ?? null) ? $item['medication'] : [];
            if (trim((string) ($medication['name'] ?? '')) === '') {
                $fail("items[$index].medication.name is required");
            }
            $quantity = $item['quantity_packs'] ?? null;
            if (!is_int($quantity) || $quantity < 1 || $quantity > 99) {
                $fail("items[$index].quantity_packs must be a whole number between 1 and 99");
            }
            $itemNeededBy = $item['needed_by'] ?? null;
            if ($itemNeededBy !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $itemNeededBy)) {
                $fail("items[$index].needed_by must be YYYY-MM-DD");
            }
            $items[] = [
                'medication' => [
                    'name' => mb_substr(trim((string) $medication['name']), 0, 190),
                    'strength' => self::optionalString($medication['strength'] ?? null, 64),
                    'form' => self::optionalString($medication['form'] ?? null, 64),
                    'gtin' => self::optionalString($medication['gtin'] ?? null, 14),
                    'pharmacode' => self::optionalString($medication['pharmacode'] ?? null, 16),
                ],
                'quantity_packs' => $quantity,
                'units_remaining' => is_numeric($item['units_remaining'] ?? null) ? (float) $item['units_remaining'] : null,
                'needed_by' => $itemNeededBy === null ? null : (string) $itemNeededBy,
            ];
        }
        $message = is_array($in['message'] ?? null) ? $in['message'] : [];
        if (trim((string) ($message['subject'] ?? '')) === '' || trim((string) ($message['body'] ?? '')) === '') {
            $fail('message.subject and message.body are required');
        }
        $neededBy = $in['needed_by'] ?? null;
        if ($neededBy !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $neededBy)) {
            $fail('needed_by must be YYYY-MM-DD');
        }
        $patientRef = $in['patient_reference'] ?? null;

        return [
            'request_id' => strtolower($id),
            'language' => $language,
            'patient_reference' => $patientRef === null ? null : mb_substr(trim((string) $patientRef), 0, 64),
            'provider' => [
                'kind' => $provider['kind'],
                'name' => mb_substr(trim((string) $provider['name']), 0, 190),
                'email' => mb_substr($email, 0, 190),
            ],
            'items' => $items,
            'needed_by' => $neededBy === null ? null : (string) $neededBy,
            'message' => [
                'subject' => mb_substr(trim((string) $message['subject']), 0, 255),
                'body' => mb_substr((string) $message['body'], 0, 10000),
            ],
        ];
    }

    private static function optionalString(mixed $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        return $s === '' ? null : mb_substr($s, 0, $max);
    }

    // ---- practice page --------------------------------------------------

    private function practice(string $method, string $token, bool $confirm): void
    {
        $this->db();
        $row = $this->reorders->findByToken($token);
        if ($row === null) {
            Http::html('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">Unknown or expired link.</p>', 404);
        }
        if ($confirm && $method === 'POST') {
            if ($row['status'] !== 'confirmed') {
                $this->reorders->markConfirmed((string) $row['id']);
                $row = $this->reorders->findByToken($token) ?? $row;
            }
            Http::html(PracticePage::render($row, true));
        }
        Http::html(PracticePage::render($row));
    }

    // ---- devices and shortages -----------------------------------------

    private function registerDevice(): void
    {
        $in = Http::readJson();
        $id = (string) ($in['device_id'] ?? '');
        $token = (string) ($in['push_token'] ?? '');
        $platform = (string) ($in['platform'] ?? '');
        if (!preg_match('/^[0-9a-f-]{36}$/i', $id) || $token === '' || !in_array($platform, ['ios', 'android'], true)) {
            throw new HttpError(422, 'device_id (UUID), push_token and platform are required');
        }
        $now = Db::now();
        $this->pdo->prepare(
            'INSERT INTO devices (id, push_token, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE push_token = VALUES(push_token), platform = VALUES(platform), updated_at = VALUES(updated_at)'
        )->execute([strtolower($id), mb_substr($token, 0, 255), $platform, $now, $now]);
        Http::json(['ok' => true]);
    }

    /**
     * Photo of a paper medication list -> structured rows via Muse Spark.
     * Nothing is persisted: the image lives only in this request.
     */
    private function extractPlan(): void
    {
        set_time_limit(120);
        $in = Http::readJson();
        $image = (string) ($in['image_base64'] ?? '');
        $mime = (string) ($in['mime'] ?? 'image/jpeg');
        if ($image === '') {
            throw new HttpError(422, 'image_base64 is required');
        }
        $client = MetaClient::fromConfig($this->config);
        try {
            $result = PlanExtractor::extract($client, $image, $mime);
        } catch (HttpError $e) {
            throw $e;
        } catch (\Throwable $e) {
            error_log('[easymedrefill] extract-plan failed: ' . $e->getMessage());
            throw new HttpError(502, 'The list could not be read right now. Please try again.');
        }
        Http::json($result);
    }

    private function shortages(): void
    {
        $rows = $this->pdo->query('SELECT product_code, active_ingredient, source, status, fetched_at FROM shortages ORDER BY source, product_code')->fetchAll();
        Http::json(['shortages' => $rows, 'count' => count($rows)]);
    }
}
