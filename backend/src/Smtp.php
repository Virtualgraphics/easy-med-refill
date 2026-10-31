<?php
declare(strict_types=1);

namespace EasyMedRefill;

/**
 * Minimal SMTP client: implicit TLS (port 465) or STARTTLS (587),
 * AUTH LOGIN, one text/plain message per call. Enough for templated
 * reorder emails; no attachments, no HTML.
 */
final class Smtp
{
    /** @var resource|null */
    private $socket = null;
    private string $log = '';

    public function __construct(
        private readonly string $host,
        private readonly int $port,
        private readonly string $username,
        private readonly string $password,
        private readonly int $timeout = 20,
    ) {
    }

    /**
     * @param string[] $to
     * @throws \RuntimeException on any SMTP failure (message contains the server reply, never credentials)
     */
    public function send(string $fromEmail, string $fromName, array $to, string $subject, string $body, ?string $replyTo = null): void
    {
        $this->open();
        try {
            $this->expect([220]);
            $this->command('EHLO ' . $this->ehloName(), [250]);
            if ($this->port === 587) {
                $this->command('STARTTLS', [220]);
                if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('STARTTLS failed');
                }
                $this->command('EHLO ' . $this->ehloName(), [250]);
            }
            $this->command('AUTH LOGIN', [334]);
            $this->command(base64_encode($this->username), [334]);
            $this->command(base64_encode($this->password), [235]);
            $this->command('MAIL FROM:<' . $fromEmail . '>', [250]);
            foreach ($to as $recipient) {
                $this->command('RCPT TO:<' . $recipient . '>', [250, 251]);
            }
            $this->command('DATA', [354]);
            $this->write($this->buildMessage($fromEmail, $fromName, $to, $subject, $body, $replyTo) . "\r\n.");
            $this->expect([250]);
            $this->command('QUIT', [221]);
        } finally {
            $this->close();
        }
    }

    /** @param string[] $to */
    private function buildMessage(string $fromEmail, string $fromName, array $to, string $subject, string $body, ?string $replyTo): string
    {
        $headers = [
            'Date: ' . date('r'),
            'From: ' . $this->encodeHeader($fromName) . ' <' . $fromEmail . '>',
            'To: ' . implode(', ', array_map(static fn(string $r): string => '<' . $r . '>', $to)),
            'Subject: ' . $this->encodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $this->ehloName() . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: base64',
            'X-Mailer: Easy MedRefill',
        ];
        if ($replyTo !== null) {
            $headers[] = 'Reply-To: <' . $replyTo . '>';
        }
        $normalised = str_replace(["\r\n", "\r"], "\n", $body);
        $encodedBody = chunk_split(base64_encode(str_replace("\n", "\r\n", $normalised)), 76, "\r\n");
        return implode("\r\n", $headers) . "\r\n\r\n" . rtrim($encodedBody, "\r\n");
    }

    private function encodeHeader(string $value): string
    {
        if (preg_match('/^[\x20-\x7E]*$/', $value)) {
            return $value;
        }
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private function ehloName(): string
    {
        $host = $_SERVER['SERVER_NAME'] ?? gethostname() ?: 'localhost';
        return is_string($host) && $host !== '' ? $host : 'localhost';
    }

    private function open(): void
    {
        $scheme = $this->port === 465 ? 'ssl://' : 'tcp://';
        $errno = 0;
        $errstr = '';
        $socket = @stream_socket_client($scheme . $this->host . ':' . $this->port, $errno, $errstr, $this->timeout);
        if ($socket === false) {
            throw new \RuntimeException("SMTP connect failed: $errstr ($errno)");
        }
        stream_set_timeout($socket, $this->timeout);
        $this->socket = $socket;
    }

    private function close(): void
    {
        if ($this->socket !== null) {
            fclose($this->socket);
            $this->socket = null;
        }
    }

    /** @param int[] $codes */
    private function command(string $line, array $codes): void
    {
        $this->write($line);
        $this->expect($codes);
    }

    private function write(string $data): void
    {
        if ($this->socket === null || fwrite($this->socket, $data . "\r\n") === false) {
            throw new \RuntimeException('SMTP write failed');
        }
    }

    /** @param int[] $codes */
    private function expect(array $codes): void
    {
        $reply = '';
        $code = 0;
        while ($this->socket !== null && ($line = fgets($this->socket, 1024)) !== false) {
            $reply .= $line;
            if (preg_match('/^(\d{3})([ -])/', $line, $m)) {
                $code = (int) $m[1];
                if ($m[2] === ' ') {
                    break;
                }
            }
        }
        $this->log .= $reply;
        if (!in_array($code, $codes, true)) {
            throw new \RuntimeException('SMTP error: ' . trim($reply));
        }
    }
}
