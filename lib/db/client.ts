/**
 * The small database surface the repository layer depends on.
 *
 * expo-sqlite's SQLiteDatabase satisfies this structurally, and a Node
 * SQLite adapter (lib/db/testing) implements it for unit tests, so all
 * repository code can be tested without a device.
 */

export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DbClient {
  runAsync(sql: string, params: SqlValue[]): Promise<RunResult>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
