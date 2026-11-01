<?php
declare(strict_types=1);

namespace EasyMedRefill;

/**
 * Turns a photo of a paper medication list into structured rows using
 * Muse Spark with a fixed JSON schema. Extraction only: the prompt forbids
 * inferring doses or adding anything that is not printed. The image is
 * processed in memory and never stored.
 */
final class PlanExtractor
{
    public const MAX_IMAGE_BYTES = 8_000_000;

    private const SYSTEM_PROMPT = <<<'TXT'
You read photographs of Swiss medication lists (Medikationsplan, Medikamentenliste, Rezept) and transcribe them.
Rules:
- Transcribe only what is printed or handwritten. Never add, guess, correct or recommend medications or doses.
- One row per medication line. Keep the product name exactly as written (brand or generic), with strength separately.
- Intake pattern: Swiss lists use columns or a pattern like "1-0-1-0" meaning morning-noon-evening-night units per intake. Fill morning/noon/evening/night with the printed numbers (fractions like 1/2 become 0.5).
- If the intake is written as text instead, convert it only when unambiguous: "1x täglich abends" -> evening 1; "2 Tabletten morgens" -> morning 2; "morgens und abends je 1" -> morning 1, evening 1; "1x täglich" without a time -> morning 1. Always keep the original wording in intake_note. If the text gives no countable units (e.g. "dünn auftragen", "zum Duschen"), leave all four at 0.
- If nothing about intake is printed, use 0 for all four and set as_needed=false.
- as_needed=true only if the list says "bei Bedarf", "Reserve", "PRN", "au besoin", "al bisogno" or similar.
- intake_note: timing or instructions printed for that row, e.g. "vor dem Essen", "1x wöchentlich". If the frequency is weekly, say so here.
- reason: the printed indication/purpose for that row, if any.
- Ignore patient name, birth date, address, insurance and doctor details completely. Set patient_fields_seen=true if such fields are visible.
- If the image is not a medication list or is unreadable, return an empty medications array and explain in notes.
Language of the list may be German, French, Italian or English.
TXT;

    private const USER_PROMPT = 'Transcribe this medication list into the JSON schema. Do not infer anything that is not visible.';

    /** @return array<string, mixed> */
    public static function schema(): array
    {
        $nullableString = ['type' => ['string', 'null']];
        return [
            'type' => 'object',
            'properties' => [
                'medications' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'name' => ['type' => 'string', 'description' => 'Product name as printed, without strength'],
                            'active_ingredient' => $nullableString,
                            'strength' => $nullableString + ['description' => 'e.g. "1 mg", "500 mg", "10 mmol"'],
                            'form' => $nullableString + ['description' => 'e.g. Tablette, Kapsel, Sachet'],
                            'morning' => ['type' => 'number'],
                            'noon' => ['type' => 'number'],
                            'evening' => ['type' => 'number'],
                            'night' => ['type' => 'number'],
                            'as_needed' => ['type' => 'boolean'],
                            'intake_note' => $nullableString,
                            'reason' => $nullableString,
                        ],
                        'required' => ['name', 'active_ingredient', 'strength', 'form', 'morning', 'noon', 'evening', 'night', 'as_needed', 'intake_note', 'reason'],
                        'additionalProperties' => false,
                    ],
                ],
                'patient_fields_seen' => ['type' => 'boolean'],
                'notes' => $nullableString,
            ],
            'required' => ['medications', 'patient_fields_seen', 'notes'],
            'additionalProperties' => false,
        ];
    }

    /**
     * @return array<string, mixed> { medications: [...], patient_fields_seen: bool, notes: ?string }
     */
    public static function extract(MetaClient $client, string $imageBase64, string $mime): array
    {
        if (!in_array($mime, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'], true)) {
            throw new HttpError(422, 'Unsupported image type');
        }
        $bytes = base64_decode($imageBase64, true);
        if ($bytes === false || strlen($bytes) === 0) {
            throw new HttpError(422, 'Image is not valid base64');
        }
        if (strlen($bytes) > self::MAX_IMAGE_BYTES) {
            throw new HttpError(413, 'Image is too large; please retake at a lower resolution');
        }
        unset($bytes);

        $result = $client->extractJson(self::SYSTEM_PROMPT, self::USER_PROMPT, "data:$mime;base64,$imageBase64", 'MedicationList', self::schema());

        $medications = [];
        foreach (is_array($result['medications'] ?? null) ? $result['medications'] : [] as $row) {
            if (!is_array($row) || trim((string) ($row['name'] ?? '')) === '') {
                continue;
            }
            $medications[] = [
                'name' => mb_substr(trim((string) $row['name']), 0, 190),
                'active_ingredient' => self::str($row['active_ingredient'] ?? null),
                'strength' => self::str($row['strength'] ?? null, 64),
                'form' => self::str($row['form'] ?? null, 64),
                'morning' => self::num($row['morning'] ?? 0),
                'noon' => self::num($row['noon'] ?? 0),
                'evening' => self::num($row['evening'] ?? 0),
                'night' => self::num($row['night'] ?? 0),
                'as_needed' => (bool) ($row['as_needed'] ?? false),
                'intake_note' => self::str($row['intake_note'] ?? null),
                'reason' => self::str($row['reason'] ?? null),
            ];
        }
        return [
            'medications' => $medications,
            'patient_fields_seen' => (bool) ($result['patient_fields_seen'] ?? false),
            'notes' => self::str($result['notes'] ?? null, 500),
        ];
    }

    private static function str(mixed $v, int $max = 190): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $s = trim($v);
        return $s === '' ? null : mb_substr($s, 0, $max);
    }

    private static function num(mixed $v): float
    {
        return is_numeric($v) ? max(0.0, round((float) $v, 3)) : 0.0;
    }
}
