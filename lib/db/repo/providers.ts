import type { DbClient } from '../client';
import { nowIso } from '../clock';
import { newId } from '../ids';
import type { ProviderKind, ProviderRow } from '../types';
import { insertRow, updateRow } from './_helpers';

export const DEFAULT_LEAD_TIME_DAYS = 7;

export interface NewProvider {
  profile_id: string;
  kind: ProviderKind;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  default_lead_time_days?: number;
}

const UPDATABLE = [
  'kind',
  'name',
  'email',
  'phone',
  'address',
  'default_lead_time_days',
  'learned_lead_time_days',
  'server_provider_id',
] as const;

export type ProviderPatch = Partial<Pick<ProviderRow, (typeof UPDATABLE)[number]>>;

export async function createProvider(db: DbClient, input: NewProvider): Promise<ProviderRow> {
  const now = nowIso();
  const row: ProviderRow = {
    id: newId(),
    profile_id: input.profile_id,
    kind: input.kind,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    default_lead_time_days: input.default_lead_time_days ?? DEFAULT_LEAD_TIME_DAYS,
    learned_lead_time_days: null,
    server_provider_id: null,
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'providers', row);
  return row;
}

export async function updateProvider(db: DbClient, id: string, patch: ProviderPatch): Promise<boolean> {
  return updateRow(db, 'providers', UPDATABLE, id, patch);
}

export async function getProvider(db: DbClient, id: string): Promise<ProviderRow | null> {
  return db.getFirstAsync<ProviderRow>('SELECT * FROM providers WHERE id = ?', [id]);
}

export async function listProviders(db: DbClient, profileId: string): Promise<ProviderRow[]> {
  return db.getAllAsync<ProviderRow>('SELECT * FROM providers WHERE profile_id = ? ORDER BY kind, name', [profileId]);
}

/** Fails if the provider still has reorder requests (FK RESTRICT). */
export async function deleteProvider(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM providers WHERE id = ?', [id]);
  return result.changes > 0;
}

/** Lead time to plan with: the learned average once known, else the default. */
export function effectiveLeadTimeDays(provider: Pick<ProviderRow, 'default_lead_time_days' | 'learned_lead_time_days'>): number {
  return provider.learned_lead_time_days ?? provider.default_lead_time_days;
}
