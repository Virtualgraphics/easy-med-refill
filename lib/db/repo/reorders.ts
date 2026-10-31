/**
 * Reorder requests and their lifecycle:
 *   draft -> approved -> sent -> confirmed -> received
 * 'overdue' is set when no confirmation arrives within the lead time,
 * 'cancelled' can happen any time before receipt.
 */
import type { DbClient, SqlValue } from '../client';
import { addDays, daysBetween, nowIso, todayIso } from '../clock';
import { newId } from '../ids';
import type { IsoDate, ProviderKind, ReorderLanguage, ReorderRequestRow, ReorderStatus } from '../types';
import { insertRow } from './_helpers';
import { effectiveLeadTimeDays, getProvider, updateProvider } from './providers';

export const ACTIVE_REORDER_STATUSES: readonly ReorderStatus[] = ['draft', 'approved', 'sent', 'confirmed', 'overdue'];
const ACTIVE_SQL = ACTIVE_REORDER_STATUSES.map((s) => `'${s}'`).join(', ');

const TRANSITIONS: Record<ReorderStatus, readonly ReorderStatus[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['confirmed', 'received', 'overdue', 'cancelled'],
  overdue: ['confirmed', 'received', 'cancelled'],
  confirmed: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function canTransition(from: ReorderStatus, to: ReorderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class ReorderTransitionError extends Error {
  constructor(from: ReorderStatus, to: ReorderStatus) {
    super(`Cannot move a reorder request from '${from}' to '${to}'.`);
  }
}

export interface NewReorderRequest {
  medication_id: string;
  provider_id: string;
  prescription_id?: string | null;
  quantity_packs: number;
  units_remaining_at_request: number | null;
  needed_by: IsoDate | null;
  note?: string | null;
  language?: ReorderLanguage;
  message_subject?: string | null;
  message_body?: string | null;
}

/** A request joined with the names the lists need. */
export interface ReorderRequestListItem extends ReorderRequestRow {
  medication_name: string;
  provider_name: string;
  provider_kind: ProviderKind;
}

const SELECT_WITH_NAMES = `
  SELECT r.*, m.name AS medication_name, p.name AS provider_name, p.kind AS provider_kind
  FROM reorder_requests r
  JOIN medications m ON m.id = r.medication_id
  JOIN providers p ON p.id = r.provider_id`;

export async function createReorderRequest(
  db: DbClient,
  input: NewReorderRequest,
  options: { approve?: boolean } = {},
): Promise<ReorderRequestRow> {
  const now = nowIso();
  const row: ReorderRequestRow = {
    id: newId(),
    medication_id: input.medication_id,
    provider_id: input.provider_id,
    prescription_id: input.prescription_id ?? null,
    status: options.approve ? 'approved' : 'draft',
    quantity_packs: input.quantity_packs,
    units_remaining_at_request: input.units_remaining_at_request,
    needed_by: input.needed_by,
    approved_at: options.approve ? now : null,
    sent_at: null,
    confirmed_at: null,
    received_at: null,
    overdue_at: null,
    cancelled_at: null,
    follow_up_count: 0,
    server_reference: null,
    note: input.note?.trim() || null,
    language: input.language ?? 'de',
    message_subject: input.message_subject ?? null,
    message_body: input.message_body ?? null,
    expected_by: null,
    created_at: now,
    updated_at: now,
  };
  await insertRow(db, 'reorder_requests', row);
  return row;
}

export async function getReorderRequest(db: DbClient, id: string): Promise<ReorderRequestListItem | null> {
  return db.getFirstAsync<ReorderRequestListItem>(`${SELECT_WITH_NAMES} WHERE r.id = ?`, [id]);
}

export interface ListReorderOptions {
  /** true = only open requests, false = only closed, undefined = all. */
  active?: boolean;
}

/** Newest first. */
export async function listReorderRequests(
  db: DbClient,
  profileId: string,
  options: ListReorderOptions = {},
): Promise<ReorderRequestListItem[]> {
  const statusClause =
    options.active === true ? `AND r.status IN (${ACTIVE_SQL})` : options.active === false ? `AND r.status NOT IN (${ACTIVE_SQL})` : '';
  return db.getAllAsync<ReorderRequestListItem>(
    `${SELECT_WITH_NAMES} WHERE m.profile_id = ? ${statusClause} ORDER BY r.created_at DESC`,
    [profileId],
  );
}

/** The latest open request for a medication, if any. */
export async function getOpenReorderRequest(db: DbClient, medicationId: string): Promise<ReorderRequestRow | null> {
  return db.getFirstAsync<ReorderRequestRow>(
    `SELECT * FROM reorder_requests WHERE medication_id = ? AND status IN (${ACTIVE_SQL}) ORDER BY created_at DESC LIMIT 1`,
    [medicationId],
  );
}

async function transition(db: DbClient, id: string, to: ReorderStatus, patch: Record<string, SqlValue>): Promise<ReorderRequestRow> {
  const current = await db.getFirstAsync<ReorderRequestRow>('SELECT * FROM reorder_requests WHERE id = ?', [id]);
  if (!current) {
    throw new Error('Reorder request not found.');
  }
  if (!canTransition(current.status, to)) {
    throw new ReorderTransitionError(current.status, to);
  }
  const now = nowIso();
  const columns = Object.keys(patch);
  const assignments = ['status = ?', 'updated_at = ?', ...columns.map((c) => `${c} = ?`)].join(', ');
  await db.runAsync(`UPDATE reorder_requests SET ${assignments} WHERE id = ?`, [to, now, ...columns.map((c) => patch[c]), id]);
  return { ...current, ...patch, status: to, updated_at: now } as ReorderRequestRow;
}

export async function approveReorderRequest(db: DbClient, id: string): Promise<ReorderRequestRow> {
  return transition(db, id, 'approved', { approved_at: nowIso() });
}

export async function markReorderSent(
  db: DbClient,
  id: string,
  details: { server_reference: string | null; expected_by: IsoDate | null },
): Promise<ReorderRequestRow> {
  return transition(db, id, 'sent', { sent_at: nowIso(), server_reference: details.server_reference, expected_by: details.expected_by });
}

export async function markReorderConfirmed(db: DbClient, id: string, details: { expected_by?: IsoDate | null } = {}): Promise<ReorderRequestRow> {
  const patch: Record<string, SqlValue> = { confirmed_at: nowIso() };
  if (details.expected_by !== undefined) patch.expected_by = details.expected_by;
  return transition(db, id, 'confirmed', patch);
}

/**
 * Marks receipt and refines the supplier's learned lead time from the
 * days between sending and receiving (weighted toward past experience).
 */
export async function markReorderReceived(db: DbClient, id: string, today: IsoDate = todayIso()): Promise<ReorderRequestRow> {
  const row = await transition(db, id, 'received', { received_at: nowIso() });
  const sentDate = row.sent_at?.slice(0, 10) ?? row.approved_at?.slice(0, 10) ?? null;
  if (sentDate) {
    const days = daysBetween(sentDate, today);
    if (days >= 0) {
      const provider = await getProvider(db, row.provider_id);
      if (provider) {
        const learned = provider.learned_lead_time_days === null ? days : Math.round(((provider.learned_lead_time_days * 2 + days) / 3) * 10) / 10;
        await updateProvider(db, provider.id, { learned_lead_time_days: learned });
      }
    }
  }
  return row;
}

export async function markReorderOverdue(db: DbClient, id: string): Promise<ReorderRequestRow> {
  return transition(db, id, 'overdue', { overdue_at: nowIso() });
}

export async function cancelReorderRequest(db: DbClient, id: string): Promise<ReorderRequestRow> {
  return transition(db, id, 'cancelled', { cancelled_at: nowIso() });
}

export async function recordFollowUp(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('UPDATE reorder_requests SET follow_up_count = follow_up_count + 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
  return result.changes > 0;
}

/** Grace days after the expected date before a sent request counts as overdue. */
export const OVERDUE_GRACE_DAYS = 2;

/**
 * Flags sent requests with no confirmation past their expected date.
 * Returns the ids that were flagged. Safe to run on every screen load.
 */
export async function detectOverdueReorders(db: DbClient, profileId: string, today: IsoDate = todayIso()): Promise<string[]> {
  const sent = await db.getAllAsync<ReorderRequestRow & { default_lead_time_days: number; learned_lead_time_days: number | null }>(
    `SELECT r.*, p.default_lead_time_days, p.learned_lead_time_days
     FROM reorder_requests r
     JOIN medications m ON m.id = r.medication_id
     JOIN providers p ON p.id = r.provider_id
     WHERE m.profile_id = ? AND r.status = 'sent'`,
    [profileId],
  );
  const flagged: string[] = [];
  for (const row of sent) {
    const sentDate = row.sent_at?.slice(0, 10);
    if (!sentDate) continue;
    const expected = row.expected_by ?? addDays(sentDate, Math.round(effectiveLeadTimeDays(row)));
    if (addDays(expected, OVERDUE_GRACE_DAYS) < today) {
      await markReorderOverdue(db, row.id);
      flagged.push(row.id);
    }
  }
  return flagged;
}
