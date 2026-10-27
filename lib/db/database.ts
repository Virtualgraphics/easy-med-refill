import type { SQLiteDatabase, SQLiteOpenOptions } from 'expo-sqlite';

import { getOrCreateDatabaseKeyHex } from './encryption';
import { LATEST_SCHEMA_VERSION, pendingMigrations } from './migrations';

export const DATABASE_NAME = 'easy-med-refill.db';

/**
 * Module-level constant on purpose: SQLiteProvider re-opens the database
 * whenever this object's identity changes.
 */
export const DATABASE_OPTIONS: SQLiteOpenOptions = {
  enableChangeListener: false,
};

/**
 * Runs once when SQLiteProvider opens the database. Order matters:
 * the SQLCipher key must be the very first statement on a connection.
 */
export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await step('encryption key', () => applyEncryptionKey(db));
  await step('journal_mode', () => db.execAsync('PRAGMA journal_mode = WAL;'));
  await step('foreign_keys', () => db.execAsync('PRAGMA foreign_keys = ON;'));
  await runMigrations(db);
  if (__DEV__) {
    console.log(`[db] ready, schema version ${LATEST_SCHEMA_VERSION}`);
  }
}

/** Runs one initialisation step and prefixes any failure with its name. */
async function step<T>(name: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`[db] ${name} failed: ${message}`, { cause: e });
  }
}

async function applyEncryptionKey(db: SQLiteDatabase): Promise<void> {
  const keyHex = await getOrCreateDatabaseKeyHex();
  // Raw-key form: 32 bytes as hex, skips SQLCipher's key derivation.
  await db.execAsync(`PRAGMA key = "x'${keyHex}'";`);

  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
  if (!cipher && __DEV__) {
    console.warn(
      '[db] SQLCipher is not compiled into this build; the database is NOT encrypted. ' +
        'Check the expo-sqlite plugin options in app.json.',
    );
  }
}

async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await step('read user_version', () =>
    db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'),
  );
  const current = row?.user_version ?? 0;

  for (const migration of pendingMigrations(current)) {
    // Must stay on this connection: withExclusiveTransactionAsync opens a
    // second native connection that never receives the SQLCipher key and
    // fails with "file is not a database".
    await step(`migration ${migration.version} (${migration.name})`, () =>
      db.withTransactionAsync(async () => {
        await db.execAsync(migration.sql);
        await db.execAsync(`PRAGMA user_version = ${migration.version};`);
      }),
    );
  }
}

export { LATEST_SCHEMA_VERSION };
