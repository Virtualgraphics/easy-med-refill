import type { DbClient, SqlValue } from '../client';
import { nowIso } from '../clock';

/**
 * Inserts one row. Column names come from code, never from user input.
 */
export async function insertRow<T extends object>(db: DbClient, table: string, row: T): Promise<void> {
  const entries = Object.entries(row);
  const columns = entries.map(([key]) => key);
  const placeholders = columns.map(() => '?').join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    entries.map(([, value]) => toSql(value)),
  );
}

/**
 * Updates the columns in `patch` that appear in `allowed`, and bumps
 * updated_at. Returns true when a row was changed.
 */
export async function updateRow(
  db: DbClient,
  table: string,
  allowed: readonly string[],
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (entries.length === 0) {
    return false;
  }
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => toSql(value));
  const result = await db.runAsync(`UPDATE ${table} SET ${assignments}, updated_at = ? WHERE id = ?`, [
    ...values,
    nowIso(),
    id,
  ]);
  return result.changes > 0;
}

/** Normalises JS values to what SQLite accepts. */
export function toSql(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value instanceof Uint8Array) return value;
  throw new Error(`Unsupported SQL value: ${typeof value}`);
}

export const bool = (value: boolean | undefined, fallback = false): 0 | 1 => (value ?? fallback ? 1 : 0);
