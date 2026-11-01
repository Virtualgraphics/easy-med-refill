<?php
declare(strict_types=1);

namespace EasyMedRefill;

/**
 * Minimal client for the Meta Model API (Muse Spark) chat completions
 * endpoint with structured JSON output. Server-side only; the API key
 * never reaches the app.
 */
final class MetaClient
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl = 'https://api.meta.ai/v1',
        private readonly string $model = 'muse-spark-1.3',
        private readonly int $timeoutSeconds = 90,
    ) {
    }

    public static function fromConfig(Config $config): self
    {
        $key = (string) $config->get('meta_api_key', '');
        if ($key === '' || $key === 'FILL_ME') {
            throw new HttpError(503, 'AI extraction is not configured on this server');
        }
        return new self(
            $key,
            rtrim((string) $config->get('meta_api_base', 'https://api.meta.ai/v1'), '/'),
            (string) $config->get('meta_model', 'muse-spark-1.3'),
        );
    }

    /**
     * Sends a text instruction plus optional image and returns the JSON the
     * model produced, decoded. $schema is a JSON Schema for response_format.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    public function extractJson(string $systemPrompt, string $userText, ?string $imageDataUrl, string $schemaName, array $schema): array
    {
        $userContent = [['type' => 'text', 'text' => $userText]];
        if ($imageDataUrl !== null) {
            $userContent[] = ['type' => 'image_url', 'image_url' => ['url' => $imageDataUrl]];
        }

        $body = [
            'model' => $this->model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userContent],
            ],
            'temperature' => 0,
            'response_format' => [
                'type' => 'json_schema',
                'json_schema' => ['name' => $schemaName, 'schema' => $schema, 'strict' => true],
            ],
        ];

        $response = $this->post('/chat/completions', $body);
        $content = $response['choices'][0]['message']['content'] ?? null;
        if (!is_string($content)) {
            throw new \RuntimeException('Model returned no content');
        }
        $decoded = json_decode($content, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('Model returned invalid JSON');
        }
        return $decoded;
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function post(string $path, array $body): array
    {
        $ch = curl_init($this->baseUrl . $path);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new \RuntimeException('Meta API unreachable: ' . $error);
        }
        $data = json_decode((string) $raw, true);
        if ($status >= 400 || !is_array($data)) {
            $message = is_array($data) ? ($data['error']['message'] ?? $data['message'] ?? 'unknown error') : 'non-JSON response';
            throw new \RuntimeException("Meta API error $status: " . (is_string($message) ? mb_substr($message, 0, 300) : 'unknown'));
        }
        return $data;
    }
}
