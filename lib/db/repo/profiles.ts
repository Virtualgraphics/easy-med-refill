/**
 * Profiles: one medication list each. A caregiver keeps several on one
 * phone (partner, parent, child) and switches between them. The active
 * profile is remembered in app settings; the default profile is the
 * fallback and cannot be deleted while it is the only one.
 */
import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { ProfileRow } from '../types';
import { insertRow, updateRow } from './_helpers';
import { getSetting, setSetting } from './settings';

const UPDATABLE = ['display_name', 'patient_reference'] as const;

export type ProfilePatch = Partial<Pick<ProfileRow, (typeof UPDATABLE)[number]>>;

/** Name of a fresh default profile; the dashboard treats it as "no person set". */
export const DEFAULT_PROFILE_NAME = 'My medications';

/** Returns the default profile, creating it on first launch. */
export async function ensureDefaultProfile(db: DbClient): Promise<ProfileRow> {
  const existing = await db.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE is_default = 1 LIMIT 1', []);
  if (existing) {
    return existing;
  }
  const now = nowIso();
  const row: ProfileRow = {
    id: newId(),
    display_name: DEFAULT_PROFILE_NAME,
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

/** Default first, then by creation. */
export async function listProfiles(db: DbClient): Promise<ProfileRow[]> {
  return db.getAllAsync<ProfileRow>('SELECT * FROM profiles ORDER BY is_default DESC, created_at', []);
}

export interface NewProfile {
  display_name: string;
  patient_reference?: string | null;
}

export async function createProfile(db: DbClient, input: NewProfile): Promise<ProfileRow> {
  const name = input.display_name.trim();
  if (!name) throw new Error('A name is required.');
  const now = nowIso();
  const row: ProfileRow = {
    id: newId(),
    display_name: name,
    patient_reference: input.patient_reference?.trim() || null,
    is_default: 0,
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'profiles', row);
  return row;
}

export async function updateProfile(db: DbClient, id: string, patch: ProfilePatch): Promise<boolean> {
  return updateRow(db, 'profiles', UPDATABLE, id, patch);
}

/**
 * Deletes a profile and everything in it (cascades through providers,
 * medications, packs, prescriptions and orders). The last remaining
 * profile cannot be deleted; if the default goes, another becomes default.
 */
export async function deleteProfile(db: DbClient, id: string): Promise<void> {
  const all = await listProfiles(db);
  if (all.length <= 1) throw new Error('The last list cannot be deleted.');
  const target = all.find((p) => p.id === id);
  if (!target) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM profiles WHERE id = ?', [id]);
    if (target.is_default === 1) {
      const next = all.find((p) => p.id !== id)!;
      await db.runAsync('UPDATE profiles SET is_default = 1, updated_at = ? WHERE id = ?', [nowIso(), next.id]);
    }
  });
  if ((await getSetting(db, 'active_profile_id')) === id) {
    await setSetting(db, 'active_profile_id', null);
  }
}

/** The profile the app currently shows: the remembered one, else the default. */
export async function getActiveProfile(db: DbClient): Promise<ProfileRow> {
  const activeId = await getSetting(db, 'active_profile_id');
  if (activeId) {
    const active = await getProfile(db, activeId);
    if (active) return active;
  }
  return ensureDefaultProfile(db);
}

export async function setActiveProfile(db: DbClient, id: string): Promise<void> {
  await setSetting(db, 'active_profile_id', id);
}
