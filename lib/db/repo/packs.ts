import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { IsoDate, PackRow, PackSource } from '../types';
import { insertRow, updateRow } from './_helpers';

export interface NewPack {
  medication_id: string;
  units_per_pack: number;
  /** Defaults to a full pack. */
  units_remaining?: number;
  gtin?: string | null;
  batch?: string | null;
  expiry_date?: IsoDate | null;
  opened_at?: IsoDate | null;
  source?: PackSource;
}

const UPDATABLE = ['units_per_pack', 'units_remaining', 'gtin', 'batch', 'expiry_date', 'opened_at'] as const;

export type PackPatch = Partial<Pick<PackRow, (typeof UPDATABLE)[number]>>;

export async function addPack(db: DbClient, input: NewPack): Promise<PackRow> {
  const now = nowIso();
  const row: PackRow = {
    id: newId(),
    medication_id: input.medication_id,
    units_per_pack: input.units_per_pack,
    units_remaining: input.units_remaining ?? input.units_per_pack,
    gtin: input.gtin?.trim() || null,
    batch: input.batch?.trim() || null,
    expiry_date: input.expiry_date ?? null,
    opened_at: input.opened_at ?? null,
    depleted_at: null,
    source: input.source ?? 'manual',
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'packs', row);
  return row;
}

export async function updatePack(db: DbClient, id: string, patch: PackPatch): Promise<boolean> {
  return updateRow(db, 'packs', UPDATABLE, id, patch);
}

/** Sets the remaining count; reaching zero marks the pack depleted. */
export async function setPackUnitsRemaining(db: DbClient, id: string, unitsRemaining: number): Promise<boolean> {
  const units = Math.max(0, unitsRemaining);
  const now = nowIso();
  const result = await db.runAsync(
    'UPDATE packs SET units_remaining = ?, depleted_at = ?, updated_at = ? WHERE id = ?',
    [units, units === 0 ? now : null, now, id],
  );
  return result.changes > 0;
}

export async function markPackDepleted(db: DbClient, id: string): Promise<boolean> {
  return setPackUnitsRemaining(db, id, 0);
}

export interface ListPacksOptions {
  includeDepleted?: boolean;
}

/** Soonest expiry first, so the pack to use next is on top. */
export async function listPacks(db: DbClient, medicationId: string, options: ListPacksOptions = {}): Promise<PackRow[]> {
  const depletedClause = options.includeDepleted ? '' : 'AND depleted_at IS NULL';
  return db.getAllAsync<PackRow>(
    `SELECT * FROM packs WHERE medication_id = ? ${depletedClause}
     ORDER BY expiry_date IS NULL, expiry_date, created_at`,
    [medicationId],
  );
}

export async function deletePack(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM packs WHERE id = ?', [id]);
  return result.changes > 0;
}

/** Total units across packs that are not depleted. */
export async function getUnitsOnHand(db: DbClient, medicationId: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(units_remaining), 0) AS total FROM packs WHERE medication_id = ? AND depleted_at IS NULL',
    [medicationId],
  );
  return row?.total ?? 0;
}
