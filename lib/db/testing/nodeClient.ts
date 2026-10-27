/**
 * DbClient backed by Node's built-in SQLite, for unit tests only.
 * Applies the real migrations so tests run against the real schema.
 */
import { DatabaseSync } from 'node:sqlite';

import type { DbClient, RunResult, SqlValue } from '../client';
import { pendingMigrations } from '../migrations';

export interface NodeDbClient extends DbClient {
  close(): void;
}

export function createNodeClient(): NodeDbClient {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const { user_version } = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  for (const m of pendingMigrations(user_version)) {
    db.exec('BEGIN;');
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version};`);
    db.exec('COMMIT;');
  }

  return {
    async runAsync(sql: string, params: SqlValue[] = []): Promise<RunResult> {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      db.exec('BEGIN;');
      try {
        await task();
        db.exec('COMMIT;');
      } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}
