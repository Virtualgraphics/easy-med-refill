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
        $texts = [
            'de' => ['Erinnerung: ', "Guten Tag\n\nZu der folgenden Anfrage haben wir noch keine Bestätigung erhalten. Falls sie bereits bearbeitet wurde, genügt ein Klick auf den Bestätigungslink.\n\n----------\n\n"],
            'en' => ['Reminder: ', "Dear team\n\nWe have not yet received a confirmation for the request below. If it has already been handled, one click on the confirmation link is enough.\n\n----------\n\n"],
            'fr' => ['Rappel : ', "Bonjour\n\nNous n'avons pas encore reçu de confirmation pour la demande ci-dessous. Si elle a déjà été traitée, un clic sur le lien de confirmation suffit.\n\n----------\n\n"],
            'it' => ['Promemoria: ', "Buongiorno\n\nNon abbiamo ancora ricevuto una conferma per la richiesta qui sotto. Se è già stata evasa, basta un clic sul link di conferma.\n\n----------\n\n"],
        ];
        [$prefix, $intro] = $texts[(string) $request['language']] ?? $texts['en'];
        $subject = $prefix . $request['message_subject'];
        $this->send(
            (string) $request['provider_email'],
            $subject,
            $intro . $this->withConfirmBlock((string) $request['message_body'], (string) $request['confirm_token'], (string) $request['language'])
        );
    }

    private function withConfirmBlock(string $body, string $token, string $language): string
    {
        $url = rtrim((string) $this->config->get('base_url'), '/') . '/p/' . $token;
        $blocks = [
            'de' => "Bestätigung mit einem Klick (kein Login nötig):\n$url",
            'en' => "Confirm with one click (no login needed):\n$url",
            'fr' => "Confirmation en un clic (sans connexion) :\n$url",
            'it' => "Conferma con un clic (senza login):\n$url",
        ];
        $block = $blocks[$language] ?? $blocks['en'];
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
