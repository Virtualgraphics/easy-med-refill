/**
 * Shortage cache and matches. The server publishes product codes only; the
 * match against the patient's list happens here, on the device.
 */
import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { IsoTimestamp, ShortageEntryRow, ShortageMatchRow, ShortageSource } from '../types';

export interface ShortageEntryInput {
  source: ShortageSource;
  product_code: string;
  active_ingredient?: string | null;
  status?: string | null;
}

/** Replaces all entries of each source present in `entries`. */
export async function replaceShortageEntries(db: DbClient, entries: ShortageEntryInput[], fetchedAt: IsoTimestamp = nowIso()): Promise<void> {
  const sources = [...new Set(entries.map((e) => e.source))];
  await db.withTransactionAsync(async () => {
    for (const source of sources) {
      await db.runAsync('DELETE FROM shortage_entries WHERE source = ?', [source]);
    }
    for (const e of entries) {
      await db.runAsync(
        'INSERT OR REPLACE INTO shortage_entries (source, product_code, active_ingredient, status, fetched_at) VALUES (?, ?, ?, ?, ?)',
        [e.source, e.product_code.trim(), e.active_ingredient?.trim() || null, e.status?.trim() || null, fetchedAt],
      );
    }
  });
}

export async function listShortageEntries(db: DbClient): Promise<ShortageEntryRow[]> {
  return db.getAllAsync<ShortageEntryRow>('SELECT * FROM shortage_entries ORDER BY source, product_code', []);
}

/** Medications of a profile with an unresolved shortage match. */
export async function listShortageMatchedMedicationIds(db: DbClient, profileId: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ medication_id: string }>(
    `SELECT DISTINCT s.medication_id
     FROM shortage_matches s
     JOIN medications m ON m.id = s.medication_id
     WHERE m.profile_id = ? AND s.resolved_at IS NULL`,
    [profileId],
  );
  return new Set(rows.map((r) => r.medication_id));
}

/** A match joined with what the feed says about it. */
export interface ShortageMatchDetail extends ShortageMatchRow {
  medication_name: string;
  is_critical: 0 | 1;
  status: string | null;
  active_ingredient: string | null;
}

const SELECT_DETAIL = `
  SELECT s.*, m.name AS medication_name, m.is_critical, e.status, e.active_ingredient
  FROM shortage_matches s
  JOIN medications m ON m.id = s.medication_id
  LEFT JOIN shortage_entries e ON e.source = s.source AND e.product_code = s.product_code`;

/** Unresolved matches of a profile, critical medications first. */
export async function listShortageMatches(db: DbClient, profileId: string): Promise<ShortageMatchDetail[]> {
  return db.getAllAsync<ShortageMatchDetail>(
    `${SELECT_DETAIL} WHERE m.profile_id = ? AND s.resolved_at IS NULL AND m.archived_at IS NULL
     ORDER BY m.is_critical DESC, s.detected_at DESC`,
    [profileId],
  );
}

export async function getShortageForMedication(db: DbClient, medicationId: string): Promise<ShortageMatchDetail | null> {
  return db.getFirstAsync<ShortageMatchDetail>(`${SELECT_DETAIL} WHERE s.medication_id = ? AND s.resolved_at IS NULL ORDER BY s.detected_at DESC LIMIT 1`, [
    medicationId,
  ]);
}

/** Records a match once; returns true when it is new. */
export async function recordShortageMatch(db: DbClient, medicationId: string, source: ShortageSource, productCode: string): Promise<boolean> {
  const existing = await db.getFirstAsync<{ id: string; resolved_at: string | null }>(
    'SELECT id, resolved_at FROM shortage_matches WHERE medication_id = ? AND source = ? AND product_code = ?',
    [medicationId, source, productCode],
  );
  if (existing) {
    if (existing.resolved_at !== null) {
      // Shortage came back: reopen rather than duplicate.
      await db.runAsync('UPDATE shortage_matches SET resolved_at = NULL, acknowledged_at = NULL, detected_at = ? WHERE id = ?', [nowIso(), existing.id]);
      return true;
    }
    return false;
  }
  await db.runAsync('INSERT INTO shortage_matches (id, medication_id, source, product_code, detected_at) VALUES (?, ?, ?, ?, ?)', [
    newId(),
    medicationId,
    source,
    productCode,
    nowIso(),
  ]);
  return true;
}

/** Closes open matches whose entry is no longer in the feed. Returns how many. */
export async function resolveStaleShortageMatches(db: DbClient): Promise<number> {
  const result = await db.runAsync(
    `UPDATE shortage_matches SET resolved_at = ?
     WHERE resolved_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM shortage_entries e WHERE e.source = shortage_matches.source AND e.product_code = shortage_matches.product_code)`,
    [nowIso()],
  );
  return result.changes;
}

export async function acknowledgeShortageMatch(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('UPDATE shortage_matches SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL', [nowIso(), id]);
  return result.changes > 0;
}
