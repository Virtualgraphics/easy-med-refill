import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { IsoDate, PrescriptionRow, PrescriptionType } from '../types';
import { insertRow, updateRow } from './_helpers';

export interface NewPrescription {
  medication_id: string;
  provider_id?: string | null;
  type: PrescriptionType;
  issued_at: IsoDate;
  valid_until?: IsoDate | null;
  /** null = unlimited within validity (typical for a standing prescription). */
  refills_allowed?: number | null;
  refills_used?: number;
  reference?: string | null;
}

const UPDATABLE = ['provider_id', 'type', 'issued_at', 'valid_until', 'refills_allowed', 'refills_used', 'reference'] as const;

export type PrescriptionPatch = Partial<Pick<PrescriptionRow, (typeof UPDATABLE)[number]>>;

export async function createPrescription(db: DbClient, input: NewPrescription): Promise<PrescriptionRow> {
  const now = nowIso();
  const row: PrescriptionRow = {
    id: newId(),
    medication_id: input.medication_id,
    provider_id: input.provider_id ?? null,
    type: input.type,
    issued_at: input.issued_at,
    valid_until: input.valid_until ?? null,
    refills_allowed: input.refills_allowed ?? null,
    refills_used: input.refills_used ?? 0,
    reference: input.reference?.trim() || null,
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'prescriptions', row);
  return row;
}

export async function updatePrescription(db: DbClient, id: string, patch: PrescriptionPatch): Promise<boolean> {
  return updateRow(db, 'prescriptions', UPDATABLE, id, patch);
}

export async function getPrescription(db: DbClient, id: string): Promise<PrescriptionRow | null> {
  return db.getFirstAsync<PrescriptionRow>('SELECT * FROM prescriptions WHERE id = ?', [id]);
}

/** Newest first. */
export async function listPrescriptions(db: DbClient, medicationId: string): Promise<PrescriptionRow[]> {
  return db.getAllAsync<PrescriptionRow>(
    'SELECT * FROM prescriptions WHERE medication_id = ? ORDER BY issued_at DESC, created_at DESC',
    [medicationId],
  );
}

/** The most recently issued prescription, whether or not it is still valid. */
export async function getCurrentPrescription(db: DbClient, medicationId: string): Promise<PrescriptionRow | null> {
  return db.getFirstAsync<PrescriptionRow>(
    'SELECT * FROM prescriptions WHERE medication_id = ? ORDER BY issued_at DESC, created_at DESC LIMIT 1',
    [medicationId],
  );
}

export async function recordRefillUsed(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('UPDATE prescriptions SET refills_used = refills_used + 1, updated_at = ? WHERE id = ?', [
    nowIso(),
    id,
  ]);
  return result.changes > 0;
}

export async function deletePrescription(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM prescriptions WHERE id = ?', [id]);
  return result.changes > 0;
}

/** Refills left, or null when unlimited. */
export function refillsRemaining(rx: Pick<PrescriptionRow, 'refills_allowed' | 'refills_used'>): number | null {
  if (rx.refills_allowed === null) return null;
  return Math.max(0, rx.refills_allowed - rx.refills_used);
}
