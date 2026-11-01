<?php
declare(strict_types=1);

namespace EasyMedRefill;

/**
 * The page a practice assistant opens from the email link. No login: the
 * token in the URL is the credential and is valid for this request only.
 */
final class PracticePage
{
    /** @param array<string, mixed> $request */
    public static function render(array $request, bool $justConfirmed = false): string
    {
        $de = $request['language'] === 'de';
        $payload = json_decode((string) $request['payload'], true) ?: [];
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
        if ($items === [] && isset($payload['medication'])) {
            // Requests stored before orders could hold several medications.
            $items = [['medication' => $payload['medication'], 'quantity_packs' => $payload['quantity_packs'] ?? null]];
        }
        $confirmed = $request['status'] === 'confirmed';

        $t = $de
            ? [
                'title' => 'Nachbestellung bestätigen',
                'intro' => 'Eine Patientin oder ein Patient hat über Easy MedRefill folgende Anfrage gesendet.',
                'patient' => 'Patient',
                'medication' => 'Medikament',
                'medications' => 'Medikamente',
                'quantity' => 'Menge',
                'packs' => 'Packung(en)',
                'needed' => 'Benötigt bis',
                'reference' => 'Referenz',
                'message' => 'Nachricht',
                'confirm' => 'Eingang bestätigen',
                'confirmed' => 'Vielen Dank, die Anfrage ist als bestätigt markiert. Der Patient sieht das in seiner App.',
                'already' => 'Diese Anfrage wurde bereits bestätigt.',
                'footer' => 'Easy MedRefill · Daten werden in der Schweiz gehostet.',
            ]
            : [
                'title' => 'Confirm reorder request',
                'intro' => 'A patient sent the following request through Easy MedRefill.',
                'patient' => 'Patient',
                'medication' => 'Medication',
                'medications' => 'Medications',
                'quantity' => 'Quantity',
                'packs' => 'pack(s)',
                'needed' => 'Needed by',
                'reference' => 'Reference',
                'message' => 'Message',
                'confirm' => 'Confirm receipt',
                'confirmed' => 'Thank you, the request is marked as confirmed. The patient sees this in their app.',
                'already' => 'This request has already been confirmed.',
                'footer' => 'Easy MedRefill · Data is hosted in Switzerland.',
            ];

        $e = static fn(mixed $v): string => htmlspecialchars((string) ($v ?? '–'), ENT_QUOTES, 'UTF-8');
        $medLine = static function (array $med): string {
            $name = (string) ($med['name'] ?? '');
            $parts = [$name];
            foreach (['strength', 'form'] as $key) {
                $part = (string) ($med[$key] ?? '');
                if ($part !== '' && mb_stripos($name, $part) === false) {
                    $parts[] = $part;
                }
            }
            return trim(implode(' ', $parts));
        };
        $itemRows = '';
        foreach ($items as $item) {
            $med = is_array($item['medication'] ?? null) ? $item['medication'] : [];
            $code = $med['gtin'] ?? $med['pharmacode'] ?? null;
            $itemRows .= '<tr><td>' . $e($medLine($med)) . ($code ? '<br><small>' . $e($code) . '</small>' : '') . '</td>'
                . '<td class="num">' . $e($item['quantity_packs'] ?? null) . ' ' . $e($t['packs']) . '</td></tr>';
        }
        $itemsLabel = count($items) === 1 ? $t['medication'] : $t['medications'];
        $notice = $justConfirmed ? $t['confirmed'] : ($confirmed ? $t['already'] : null);
        $action = rtrim((string) ($_SERVER['REQUEST_URI'] ?? ''), '/');
        $action = preg_replace('#/confirm$#', '', $action) . '/confirm';

        $noticeHtml = $notice ? '<p class="notice">' . $e($notice) . '</p>' : '';
        $buttonHtml = $confirmed ? '' : '<form method="post" action="' . $e($action) . '"><button type="submit">' . $e($t['confirm']) . '</button></form>';

        return <<<HTML
<!doctype html>
<html lang="{$e($request['language'])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{$e($t['title'])}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #EEF9F7; margin: 0; color: #111; }
  header { background: #0B5CAB; color: #fff; padding: 16px 24px; font-weight: 600; font-size: 18px; }
  main { max-width: 640px; margin: 24px auto; padding: 0 16px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
  dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; margin: 0; }
  dt { color: #666; } dd { margin: 0; font-weight: 600; }
  pre { white-space: pre-wrap; font: 13px/1.5 ui-monospace, Consolas, monospace; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; color: #666; font-weight: normal; padding: 6px 0; border-bottom: 1px solid #ddd; }
  td { padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; vertical-align: top; }
  td small { color: #666; font-weight: normal; }
  .num { text-align: right; white-space: nowrap; }
  button { background: #0B5CAB; color: #fff; border: 0; border-radius: 12px; padding: 14px 20px; font-size: 16px; font-weight: 600; width: 100%; cursor: pointer; }
  .notice { background: #DCFCE7; border-radius: 12px; padding: 12px 16px; color: #166534; font-weight: 600; }
  footer { color: #666; font-size: 12px; text-align: center; margin: 24px 0; }
</style>
</head>
<body>
<header>Easy MedRefill</header>
<main>
  <h1 style="font-size:22px">{$e($t['title'])}</h1>
  <p>{$e($t['intro'])}</p>
  {$noticeHtml}
  <div class="card">
    <dl>
      <dt>{$e($t['patient'])}</dt><dd>{$e($request['patient_reference'])}</dd>
      <dt>{$e($t['needed'])}</dt><dd>{$e($request['needed_by'])}</dd>
      <dt>{$e($t['reference'])}</dt><dd>{$e($request['reference'])}</dd>
    </dl>
    <table>
      <thead><tr><th>{$e($itemsLabel)}</th><th class="num">{$e($t['quantity'])}</th></tr></thead>
      <tbody>{$itemRows}</tbody>
    </table>
  </div>
  {$buttonHtml}
  <div class="card" style="margin-top:16px">
    <p style="margin:0 0 8px;color:#666">{$e($t['message'])}</p>
    <pre>{$e($request['message_body'])}</pre>
  </div>
</main>
<footer>{$e($t['footer'])}</footer>
</body>
</html>
HTML;
    }
}
