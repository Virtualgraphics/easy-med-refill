import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { ProfileRow } from '../types';
import { insertRow, updateRow } from './_helpers';

const UPDATABLE = ['display_name', 'patient_reference'] as const;

export type ProfilePatch = Partial<Pick<ProfileRow, (typeof UPDATABLE)[number]>>;

/** Returns the default profile, creating it on first launch. */
export async function ensureDefaultProfile(db: DbClient): Promise<ProfileRow> {
  const existing = await db.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE is_default = 1 LIMIT 1', []);
  if (existing) {
    return existing;
  }
  const now = nowIso();
  const row: ProfileRow = {
    id: newId(),
    display_name: 'My medications',
    patient_reference: null,
    is_default: 1,
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'profiles', row);
  return row;
}

export async function getProfile(db: DbClient, id: string): Promise<ProfileRow | null> {
  return db.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [id]);
}

export async function updateProfile(db: DbClient, id: string, patch: ProfilePatch): Promise<boolean> {
  return updateRow(db, 'profiles', UPDATABLE, id, patch);
}
