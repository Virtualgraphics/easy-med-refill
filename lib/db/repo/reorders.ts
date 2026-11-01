/**
 * Reorder requests and their lifecycle:
 *   draft -> approved -> sent -> confirmed -> received
 * 'overdue' is set when no confirmation arrives within the lead time,
 * 'cancelled' can happen any time before receipt.
 *
 * One request row = one medication. Rows ordered together from the same
 * supplier share a batch id: one message, one server reference, one
 * confirmation. Status changes that come from the supplier side (sent,
 * confirmed, overdue, follow-ups) apply to the whole batch; receipt and
 * cancellation can also happen per item.
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
  /** Defaults to the new row's own id (a batch of one). */
  batch_id?: string;
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
  const id = newId();
  const row: ReorderRequestRow = {
    id,
    batch_id: input.batch_id ?? id,
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
export async function markReorderReceived(
  db: DbClient,
  id: string,
  today: IsoDate = todayIso(),
  options: { learnLeadTime?: boolean } = {},
): Promise<ReorderRequestRow> {
  const row = await transition(db, id, 'received', { received_at: nowIso() });
  const sentDate = row.sent_at?.slice(0, 10) ?? row.approved_at?.slice(0, 10) ?? null;
  if (sentDate && options.learnLeadTime !== false) {
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

export async function setFollowUpCount(db: DbClient, id: string, count: number): Promise<boolean> {
  const result = await db.runAsync('UPDATE reorder_requests SET follow_up_count = ?, updated_at = ? WHERE id = ?', [count, nowIso(), id]);
  return result.changes > 0;
}

export async function recordFollowUp(db: DbClient, id: string): Promise<boolean> {
  const result = await db.runAsync('UPDATE reorder_requests SET follow_up_count = follow_up_count + 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
  return result.changes > 0;
}

// ---- batches ----------------------------------------------------------

/** All requests of one batch, with the names the lists need. */
export interface ReorderBatch {
  batch_id: string;
  provider_id: string;
  provider_name: string;
  provider_kind: ProviderKind;
  /** Status shared by the open items, or the closing status once all are done. */
  status: ReorderStatus;
  items: ReorderRequestListItem[];
  language: ReorderLanguage;
  note: string | null;
  message_subject: string | null;
  message_body: string | null;
  server_reference: string | null;
  needed_by: IsoDate | null;
  expected_by: IsoDate | null;
  follow_up_count: number;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  overdue_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
}

/**
 * Supplier-side steps (sent, confirmed, overdue) move every item of a batch
 * together, so the open items always agree. Once all are closed the batch
 * counts as received unless everything was cancelled.
 */
export function batchStatus(items: readonly Pick<ReorderRequestRow, 'status'>[]): ReorderStatus {
  const open = items.find((i) => ACTIVE_REORDER_STATUSES.includes(i.status));
  if (open) return open.status;
  return items.every((i) => i.status === 'cancelled') ? 'cancelled' : 'received';
}

function latest(items: readonly ReorderRequestListItem[], key: 'received_at' | 'cancelled_at'): string | null {
  let value: string | null = null;
  for (const item of items) {
    const v = item[key];
    if (v !== null && (value === null || v > value)) value = v;
  }
  return value;
}

function assembleBatch(items: ReorderRequestListItem[]): ReorderBatch {
  const first = items[0];
  const neededBy = items.reduce<IsoDate | null>((acc, i) => (i.needed_by && (!acc || i.needed_by < acc) ? i.needed_by : acc), null);
  const allClosed = items.every((i) => !ACTIVE_REORDER_STATUSES.includes(i.status));
  return {
    batch_id: first.batch_id,
    provider_id: first.provider_id,
    provider_name: first.provider_name,
    provider_kind: first.provider_kind,
    status: batchStatus(items),
    items,
    language: first.language,
    note: first.note,
    message_subject: first.message_subject,
    message_body: first.message_body,
    server_reference: items.find((i) => i.server_reference)?.server_reference ?? null,
    needed_by: neededBy,
    expected_by: first.expected_by,
    follow_up_count: Math.max(...items.map((i) => i.follow_up_count)),
    created_at: first.created_at,
    approved_at: first.approved_at,
    sent_at: first.sent_at,
    confirmed_at: first.confirmed_at,
    overdue_at: first.overdue_at,
    received_at: allClosed ? latest(items, 'received_at') : null,
    cancelled_at: allClosed ? latest(items, 'cancelled_at') : null,
  };
}

function groupBatches(rows: ReorderRequestListItem[]): ReorderBatch[] {
  const byBatch = new Map<string, ReorderRequestListItem[]>();
  for (const row of rows) {
    const list = byBatch.get(row.batch_id);
    if (list) list.push(row);
    else byBatch.set(row.batch_id, [row]);
  }
  return [...byBatch.values()].map((items) => assembleBatch([...items].sort((a, b) => a.medication_name.localeCompare(b.medication_name))));
}

export async function getReorderBatch(db: DbClient, batchId: string): Promise<ReorderBatch | null> {
  const rows = await db.getAllAsync<ReorderRequestListItem>(`${SELECT_WITH_NAMES} WHERE r.batch_id = ?`, [batchId]);
  return rows.length === 0 ? null : groupBatches(rows)[0];
}

/**
 * Batches, newest first. `active: true` lists batches with at least one
 * open item, `false` those where every item is closed.
 */
export async function listReorderBatches(db: DbClient, profileId: string, options: ListReorderOptions = {}): Promise<ReorderBatch[]> {
  const rows = await db.getAllAsync<ReorderRequestListItem>(`${SELECT_WITH_NAMES} WHERE m.profile_id = ? ORDER BY r.created_at DESC`, [profileId]);
  const batches = groupBatches(rows);
  if (options.active === undefined) return batches;
  return batches.filter((b) => ACTIVE_REORDER_STATUSES.includes(b.status) === options.active);
}

export interface NewReorderBatchItem {
  medication_id: string;
  prescription_id?: string | null;
  quantity_packs: number;
  units_remaining_at_request: number | null;
  needed_by: IsoDate | null;
}

export interface NewReorderBatch {
  provider_id: string;
  items: NewReorderBatchItem[];
  note?: string | null;
  language?: ReorderLanguage;
  message_subject?: string | null;
  message_body?: string | null;
}

/** Creates one request per item, all sharing a fresh batch id. */
export async function createReorderBatch(db: DbClient, input: NewReorderBatch, options: { approve?: boolean } = {}): Promise<ReorderRequestRow[]> {
  if (input.items.length === 0) throw new Error('A reorder needs at least one medication.');
  const batchId = newId();
  const rows: ReorderRequestRow[] = [];
  for (const item of input.items) {
    rows.push(
      await createReorderRequest(
        db,
        {
          batch_id: batchId,
          medication_id: item.medication_id,
          provider_id: input.provider_id,
          prescription_id: item.prescription_id ?? null,
          quantity_packs: item.quantity_packs,
          units_remaining_at_request: item.units_remaining_at_request,
          needed_by: item.needed_by,
          note: input.note,
          language: input.language,
          message_subject: input.message_subject,
          message_body: input.message_body,
        },
        options,
      ),
    );
  }
  return rows;
}

export async function setBatchMessage(db: DbClient, batchId: string, message: { subject: string; body: string }): Promise<void> {
  await db.runAsync('UPDATE reorder_requests SET message_subject = ?, message_body = ?, updated_at = ? WHERE batch_id = ?', [
    message.subject,
    message.body,
    nowIso(),
    batchId,
  ]);
}

async function itemIdsIn(db: DbClient, batchId: string, statuses: readonly ReorderStatus[]): Promise<string[]> {
  const list = statuses.map((s) => `'${s}'`).join(', ');
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM reorder_requests WHERE batch_id = ? AND status IN (${list}) ORDER BY created_at`, [batchId]);
  return rows.map((r) => r.id);
}

export async function markBatchSent(db: DbClient, batchId: string, details: { server_reference: string | null; expected_by: IsoDate | null }): Promise<void> {
  for (const id of await itemIdsIn(db, batchId, ['approved'])) await markReorderSent(db, id, details);
}

export async function markBatchConfirmed(db: DbClient, batchId: string, details: { expected_by?: IsoDate | null } = {}): Promise<void> {
  for (const id of await itemIdsIn(db, batchId, ['sent', 'overdue'])) await markReorderConfirmed(db, id, details);
}

export async function markBatchOverdue(db: DbClient, batchId: string): Promise<void> {
  for (const id of await itemIdsIn(db, batchId, ['sent'])) await markReorderOverdue(db, id);
}

/** Marks every open item received; the supplier lead time is learned once. */
export async function markBatchReceived(db: DbClient, batchId: string, today: IsoDate = todayIso()): Promise<void> {
  const ids = await itemIdsIn(db, batchId, ['sent', 'overdue', 'confirmed']);
  for (const [index, id] of ids.entries()) await markReorderReceived(db, id, today, { learnLeadTime: index === 0 });
}

export async function cancelReorderBatch(db: DbClient, batchId: string): Promise<void> {
  for (const id of await itemIdsIn(db, batchId, ACTIVE_REORDER_STATUSES)) await cancelReorderRequest(db, id);
}

export async function setBatchFollowUpCount(db: DbClient, batchId: string, count: number): Promise<void> {
  await db.runAsync('UPDATE reorder_requests SET follow_up_count = ?, updated_at = ? WHERE batch_id = ?', [count, nowIso(), batchId]);
}

export async function recordBatchFollowUp(db: DbClient, batchId: string): Promise<void> {
  await db.runAsync('UPDATE reorder_requests SET follow_up_count = follow_up_count + 1, updated_at = ? WHERE batch_id = ?', [nowIso(), batchId]);
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
