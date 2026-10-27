import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { MedicationRow } from '../types';
import { bool, insertRow, updateRow } from './_helpers';

/** Reorder margin before run-out. Critical medications get a much larger one. */
export const DEFAULT_SAFETY_BUFFER_DAYS = 14;
export const CRITICAL_SAFETY_BUFFER_DAYS = 35;

export function defaultSafetyBufferDays(isCritical: boolean): number {
  return isCritical ? CRITICAL_SAFETY_BUFFER_DAYS : DEFAULT_SAFETY_BUFFER_DAYS;
}

export interface NewMedication {
  profile_id: string;
  name: string;
  active_ingredient?: string | null;
  strength?: string | null;
  form?: string | null;
  gtin?: string | null;
  pharmacode?: string | null;
  is_critical?: boolean;
  /** Defaults from the critical flag when omitted. */
  safety_buffer_days?: number;
  preferred_provider_id?: string | null;
  notes?: string | null;
}

const UPDATABLE = [
  'name',
  'active_ingredient',
  'strength',
  'form',
  'gtin',
  'pharmacode',
  'is_critical',
  'safety_buffer_days',
  'preferred_provider_id',
  'notes',
] as const;

export type MedicationPatch = Partial<Omit<Pick<MedicationRow, (typeof UPDATABLE)[number]>, 'is_critical'>> & {
  is_critical?: boolean;
};

export async function createMedication(db: DbClient, input: NewMedication): Promise<MedicationRow> {
  const now = nowIso();
  const isCritical = input.is_critical ?? false;
  const row: MedicationRow = {
    id: newId(),
    profile_id: input.profile_id,
    name: input.name.trim(),
    active_ingredient: input.active_ingredient?.trim() || null,
    strength: input.strength?.trim() || null,
    form: input.form?.trim() || null,
    gtin: input.gtin?.trim() || null,
    pharmacode: input.pharmacode?.trim() || null,
    is_critical: bool(isCritical),
    safety_buffer_days: input.safety_buffer_days ?? defaultSafetyBufferDays(isCritical),
    preferred_provider_id: input.preferred_provider_id ?? null,
    notes: input.notes?.trim() || null,
    archived_at: null,
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'medications', row);
  return row;
}

export async function updateMedication(db: DbClient, id: string, patch: MedicationPatch): Promise<boolean> {
  const { is_critical, ...rest } = patch;
  const sqlPatch: Record<string, unknown> = { ...rest };
  if (is_critical !== undefined) {
    sqlPatch.is_critical = bool(is_critical);
  }
  return updateRow(db, 'medications', UPDATABLE, id, sqlPatch);
}

export async function getMedication(db: DbClient, id: string): Promise<MedicationRow | null> {
  return db.getFirstAsync<MedicationRow>('SELECT * FROM medications WHERE id = ?', [id]);
}

export interface ListMedicationsOptions {
  includeArchived?: boolean;
}

/** Critical medications first, then alphabetical. */
export async function listMedications(
  db: DbClient,
  profileId: string,
  options: ListMedicationsOptions = {},
): Promise<MedicationRow[]> {
  const archivedClause = options.includeArchived ? '' : 'AND archived_at IS NULL';
  return db.getAllAsync<MedicationRow>(
    `SELECT * FROM medications WHERE profile_id = ? ${archivedClause} ORDER BY is_critical DESC, name COLLATE NOCASE`,
    [profileId],
  );
}

export async function findMedicationByGtin(db: DbClient, profileId: string, gtin: string): Promise<MedicationRow | null> {
  return db.getFirstAsync<MedicationRow>(
    'SELECT * FROM medications WHERE profile_id = ? AND gtin = ? AND archived_at IS NULL LIMIT 1',
    [profileId, gtin],
  );
}

/** Soft delete: keeps history, hides from lists and the dashboard. */
export async function archiveMedication(db: DbClient, id: string): Promise<boolean> {
  const now = nowIso();
  const result = await db.runAsync('UPDATE medications SET archived_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  return result.changes > 0;
}

export async function unarchiveMedication(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('UPDATE medications SET archived_at = NULL, updated_at = ? WHERE id = ?', [
    nowIso(),
    id,
  ]);
  return result.changes > 0;
}

/** Hard delete. Cascades to schedules, packs, prescriptions and requests. */
export async function deleteMedication(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM medications WHERE id = ?', [id]);
  return result.changes > 0;
}
