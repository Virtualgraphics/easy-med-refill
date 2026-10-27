import type { DbClient } from './client';

/**
 * Removes every row the user owns. Profiles cascade to providers,
 * medications and everything below them. The shortage cache is cleared too.
 */
export async function resetAllData(db: DbClient): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM profiles', []);
    await db.runAsync('DELETE FROM shortage_entries', []);
  });
}
