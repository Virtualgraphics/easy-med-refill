import type { DbClient } from '../client';
import { nowIso } from '../clock';

/** Known preference keys. Values are strings; booleans are '1' / '0'. */
export type SettingKey = 'reminders_enabled' | 'theme';

export async function getSetting(db: DbClient, key: SettingKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: DbClient, key: SettingKey, value: string | null): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}

export async function getBoolSetting(db: DbClient, key: SettingKey, fallback = false): Promise<boolean> {
  const value = await getSetting(db, key);
  return value === null ? fallback : value === '1';
}

export async function setBoolSetting(db: DbClient, key: SettingKey, value: boolean): Promise<void> {
  await setSetting(db, key, value ? '1' : '0');
}
