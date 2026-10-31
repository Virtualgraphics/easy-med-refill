<?php
declare(strict_types=1);

namespace EasyMedRefill;

use PDO;

/**
 * Server-side reorder queue. Holds only what the practice needs to act on
 * the request: the templated message and the fields inside it. Never the
 * patient's medication list or dose history.
 */
final class ReorderRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null */
    public function findById(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM reorder_requests WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<string, mixed>|null */
    public function findByReference(string $reference): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM reorder_requests WHERE reference = ?');
        $stmt->execute([$reference]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<string, mixed>|null */
    public function findByToken(string $token): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM reorder_requests WHERE confirm_token = ?');
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * @param array<string, mixed> $payload validated payload from the app
     * @return array<string, mixed> the stored row
     */
    public function create(array $payload): array
    {
        $now = Db::now();
        $id = (string) $payload['request_id'];
        $row = [
            'id' => $id,
            'reference' => strtoupper(substr(str_replace('-', '', $id), 0, 8)),
            'confirm_token' => bin2hex(random_bytes(16)),
            'status' => 'queued',
            'language' => (string) $payload['language'],
            'patient_reference' => $payload['patient_reference'] ?? null,
            'provider_kind' => (string) $payload['provider']['kind'],
            'provider_name' => (string) $payload['provider']['name'],
            'provider_email' => (string) $payload['provider']['email'],
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'message_subject' => (string) $payload['message']['subject'],
            'message_body' => (string) $payload['message']['body'],
            'needed_by' => $payload['needed_by'] ?? null,
            'follow_up_count' => 0,
            'last_error' => null,
            'created_at' => $now,
            'sent_at' => null,
            'confirmed_at' => null,
            'follow_up_at' => null,
            'updated_at' => $now,
        ];
        $columns = implode(', ', array_keys($row));
        $placeholders = implode(', ', array_fill(0, count($row), '?'));
        $this->pdo->prepare("INSERT INTO reorder_requests ($columns) VALUES ($placeholders)")->execute(array_values($row));
        return $row;
    }

    public function markSent(string $id): void
    {
        $now = Db::now();
        $this->pdo->prepare("UPDATE reorder_requests SET status = 'sent', sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?")->execute([$now, $now, $id]);
    }

    public function markFailed(string $id, string $error): void
    {
        // Keep errors short and free of message content.
        $this->pdo->prepare('UPDATE reorder_requests SET last_error = ?, updated_at = ? WHERE id = ?')->execute([mb_substr($error, 0, 500), Db::now(), $id]);
    }

    public function markConfirmed(string $id): void
    {
        $now = Db::now();
        $this->pdo->prepare("UPDATE reorder_requests SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE id = ?")->execute([$now, $now, $id]);
    }

    public function markFollowedUp(string $id): void
    {
        $now = Db::now();
        $this->pdo->prepare("UPDATE reorder_requests SET status = 'overdue', follow_up_count = follow_up_count + 1, follow_up_at = ?, last_error = NULL, updated_at = ? WHERE id = ?")->execute([$now, $now, $id]);
    }

    /** @return array<int, array<string, mixed>> */
    public function queued(int $limit = 50): array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM reorder_requests WHERE status = 'queued' ORDER BY created_at LIMIT ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Sent requests without confirmation for longer than $days (and overdue
     * ones not followed up again for the same period), up to $maxFollowUps.
     * @return array<int, array<string, mixed>>
     */
    public function awaitingFollowUp(int $days, int $maxFollowUps, int $limit = 50): array
    {
        $cutoff = (new \DateTimeImmutable("-$days days", new \DateTimeZone('UTC')))->format('Y-m-d H:i:s');
        $stmt = $this->pdo->prepare(
            "SELECT * FROM reorder_requests
             WHERE status IN ('sent', 'overdue')
               AND follow_up_count < ?
               AND COALESCE(follow_up_at, sent_at) <= ?
             ORDER BY sent_at LIMIT ?"
        );
        $stmt->bindValue(1, $maxFollowUps, PDO::PARAM_INT);
        $stmt->bindValue(2, $cutoff);
        $stmt->bindValue(3, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /** @return array<string, mixed> status as the app expects it */
    public static function publicStatus(array $row): array
    {
        return [
            'reference' => $row['reference'],
            'status' => $row['status'],
            'confirmed_at' => $row['confirmed_at'],
            'follow_up_count' => (int) $row['follow_up_count'],
        ];
    }
}
