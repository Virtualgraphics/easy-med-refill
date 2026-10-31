<?php
declare(strict_types=1);

namespace EasyMedRefill;

/**
 * Sends the templated reorder and follow-up emails. The message text comes
 * from the app's fixed template; the server only appends the confirmation
 * link. Nothing is generated.
 */
final class Mailer
{
    public function __construct(private readonly Config $config)
    {
    }

    /** @param array<string, mixed> $request */
    public function sendReorder(array $request): void
    {
        $this->send(
            (string) $request['provider_email'],
            (string) $request['message_subject'],
            $this->withConfirmBlock((string) $request['message_body'], (string) $request['confirm_token'], (string) $request['language'])
        );
    }

    /** @param array<string, mixed> $request */
    public function sendFollowUp(array $request): void
    {
        $de = $request['language'] === 'de';
        $subject = ($de ? 'Erinnerung: ' : 'Reminder: ') . $request['message_subject'];
        $intro = $de
            ? "Guten Tag\n\nZu der folgenden Anfrage haben wir noch keine Bestätigung erhalten. Falls sie bereits bearbeitet wurde, genügt ein Klick auf den Bestätigungslink.\n\n----------\n\n"
            : "Dear team\n\nWe have not yet received a confirmation for the request below. If it has already been handled, one click on the confirmation link is enough.\n\n----------\n\n";
        $this->send(
            (string) $request['provider_email'],
            $subject,
            $intro . $this->withConfirmBlock((string) $request['message_body'], (string) $request['confirm_token'], (string) $request['language'])
        );
    }

    private function withConfirmBlock(string $body, string $token, string $language): string
    {
        $url = rtrim((string) $this->config->get('base_url'), '/') . '/p/' . $token;
        $block = $language === 'de'
            ? "Bestätigung mit einem Klick (kein Login nötig):\n$url"
            : "Confirm with one click (no login needed):\n$url";
        return rtrim($body) . "\n\n" . $block . "\n";
    }

    private function send(string $to, string $subject, string $body): void
    {
        $smtp = $this->config->section('smtp');
        $client = new Smtp((string) $smtp['host'], (int) $smtp['port'], (string) $smtp['user'], (string) $smtp['password']);
        $client->send(
            (string) $smtp['from'],
            (string) ($smtp['from_name'] ?? 'Easy MedRefill'),
            [$to],
            $subject,
            $body,
            isset($smtp['reply_to']) ? (string) $smtp['reply_to'] : null
        );
    }
}
