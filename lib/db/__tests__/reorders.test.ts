import { addDays, todayIso } from '../clock';
import {
  addPack,
  batchStatus,
  cancelReorderBatch,
  cancelReorderRequest,
  canTransition,
  createMedication,
  createProvider,
  createReorderBatch,
  createReorderRequest,
  detectOverdueReorders,
  ensureDefaultProfile,
  getOpenReorderRequest,
  getProvider,
  getReorderBatch,
  getReorderRequest,
  getSupplyOverview,
  listReorderBatches,
  listReorderRequests,
  markBatchConfirmed,
  markBatchReceived,
  markBatchSent,
  markReorderConfirmed,
  markReorderReceived,
  markReorderSent,
  recordFollowUp,
  ReorderTransitionError,
  setBatchMessage,
} from '../repo';
import { createNodeClient, type NodeDbClient } from '../testing/nodeClient';

let db: NodeDbClient;
let profileId: string;
let providerId: string;
let medicationId: string;

const today = todayIso();

beforeEach(async () => {
  db = createNodeClient();
  profileId = (await ensureDefaultProfile(db)).id;
  providerId = (await createProvider(db, { profile_id: profileId, kind: 'practice', name: 'P', email: 'p@example.invalid', default_lead_time_days: 5 })).id;
  medicationId = (await createMedication(db, { profile_id: profileId, name: 'Med', preferred_provider_id: providerId })).id;
});

afterEach(() => db.close());

const create = (approve = true) =>
  createReorderRequest(
    db,
    { medication_id: medicationId, provider_id: providerId, quantity_packs: 2, units_remaining_at_request: 12, needed_by: addDays(today, 10), message_subject: 'S', message_body: 'B' },
    { approve },
  );

describe('lifecycle', () => {
  it('walks draft -> approved -> sent -> confirmed -> received and stamps each step', async () => {
    const draft = await create(false);
    expect(draft.status).toBe('draft');
    expect(canTransition('draft', 'sent')).toBe(false);

    const approved = await create(true);
    expect(approved.status).toBe('approved');
    expect(approved.approved_at).not.toBeNull();

    const sent = await markReorderSent(db, approved.id, { server_reference: 'REF-1', expected_by: addDays(today, 5) });
    expect(sent.status).toBe('sent');
    expect(sent.server_reference).toBe('REF-1');

    const confirmed = await markReorderConfirmed(db, approved.id, { expected_by: addDays(today, 3) });
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.expected_by).toBe(addDays(today, 3));

    const received = await markReorderReceived(db, approved.id);
    expect(received.status).toBe('received');
    expect(received.received_at).not.toBeNull();

    const stored = await getReorderRequest(db, approved.id);
    expect(stored).toMatchObject({ status: 'received', medication_name: 'Med', provider_name: 'P', provider_kind: 'practice', message_body: 'B' });
  });

  it('rejects invalid transitions', async () => {
    const r = await create(true);
    await expect(markReorderConfirmed(db, r.id)).rejects.toThrow(ReorderTransitionError);
    await markReorderSent(db, r.id, { server_reference: null, expected_by: null });
    await markReorderReceived(db, r.id);
    await expect(cancelReorderRequest(db, r.id)).rejects.toThrow(/received.*cancelled/);
  });

  it('counts follow-ups and cancels', async () => {
    const r = await create(true);
    await markReorderSent(db, r.id, { server_reference: null, expected_by: null });
    await recordFollowUp(db, r.id);
    await recordFollowUp(db, r.id);
    expect((await getReorderRequest(db, r.id))?.follow_up_count).toBe(2);
    const cancelled = await cancelReorderRequest(db, r.id);
    expect(cancelled.status).toBe('cancelled');
    expect(await getOpenReorderRequest(db, medicationId)).toBeNull();
  });
});

describe('queries', () => {
  it('lists open and closed requests separately, newest first', async () => {
    const a = await create(true);
    const b = await create(true);
    await markReorderSent(db, b.id, { server_reference: null, expected_by: null });
    await markReorderReceived(db, b.id);

    const open = await listReorderRequests(db, profileId, { active: true });
    const closed = await listReorderRequests(db, profileId, { active: false });
    const all = await listReorderRequests(db, profileId);
    expect(open.map((r) => r.id)).toEqual([a.id]);
    expect(closed.map((r) => r.id)).toEqual([b.id]);
    expect(all).toHaveLength(2);
  });

  it('exposes the open request and last pack size in the supply overview', async () => {
    await addPack(db, { medication_id: medicationId, units_per_pack: 100, units_remaining: 10 });
    await addPack(db, { medication_id: medicationId, units_per_pack: 30 });
    const r = await create(true);
    const [row] = await getSupplyOverview(db, profileId);
    expect(row.open_request?.id).toBe(r.id);
    expect(row.last_pack_size).toBe(30);
    expect(row.units_on_hand).toBe(40);
  });
});

describe('overdue detection and learned lead time', () => {
  it('flags sent requests past expected date plus grace, and leaves fresh ones alone', async () => {
    const late = await create(true);
    await markReorderSent(db, late.id, { server_reference: null, expected_by: addDays(today, -3) });
    const fresh = await create(true);
    await markReorderSent(db, fresh.id, { server_reference: null, expected_by: addDays(today, -2) });

    const flagged = await detectOverdueReorders(db, profileId, today);
    expect(flagged).toEqual([late.id]);
    expect((await getReorderRequest(db, late.id))?.status).toBe('overdue');
    expect((await getReorderRequest(db, fresh.id))?.status).toBe('sent');
    // Idempotent: already-overdue requests are not flagged twice.
    expect(await detectOverdueReorders(db, profileId, today)).toEqual([]);
  });

  it('derives the expected date from the lead time when none was stored', async () => {
    const r = await create(true);
    await markReorderSent(db, r.id, { server_reference: null, expected_by: null });
    // sent today, lead 5, grace 2 -> overdue from day 8
    expect(await detectOverdueReorders(db, profileId, addDays(today, 7))).toEqual([]);
    expect(await detectOverdueReorders(db, profileId, addDays(today, 8))).toEqual([r.id]);
  });

  it('learns the supplier lead time from actual turnaround', async () => {
    const r = await create(true);
    await markReorderSent(db, r.id, { server_reference: null, expected_by: null });
    await markReorderReceived(db, r.id, addDays(today, 3));
    expect((await getProvider(db, providerId))?.learned_lead_time_days).toBe(3);

    const r2 = await create(true);
    await markReorderSent(db, r2.id, { server_reference: null, expected_by: null });
    await markReorderReceived(db, r2.id, addDays(today, 9));
    // weighted: (3*2 + 9) / 3 = 5
    expect((await getProvider(db, providerId))?.learned_lead_time_days).toBe(5);
  });
});

describe('batches', () => {
  async function twoMedBatch() {
    const second = (await createMedication(db, { profile_id: profileId, name: 'Aspirin', preferred_provider_id: providerId })).id;
    const rows = await createReorderBatch(
      db,
      {
        provider_id: providerId,
        language: 'de',
        note: 'bitte zusammen',
        items: [
          { medication_id: medicationId, quantity_packs: 2, units_remaining_at_request: 12, needed_by: addDays(today, 10) },
          { medication_id: second, quantity_packs: 1, units_remaining_at_request: 5, needed_by: addDays(today, 4) },
        ],
      },
      { approve: true },
    );
    return { rows, second };
  }

  it('creates one request per medication under a shared batch id', async () => {
    const { rows } = await twoMedBatch();
    expect(rows).toHaveLength(2);
    expect(rows[0].batch_id).toBe(rows[1].batch_id);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows.every((r) => r.status === 'approved' && r.note === 'bitte zusammen')).toBe(true);

    const batch = await getReorderBatch(db, rows[0].batch_id);
    expect(batch?.items.map((i) => i.medication_name)).toEqual(['Aspirin', 'Med']);
    expect(batch?.status).toBe('approved');
    expect(batch?.needed_by).toBe(addDays(today, 4));
    expect(await getOpenReorderRequest(db, medicationId)).toMatchObject({ batch_id: rows[0].batch_id });
  });

  it('a single request is a batch of its own', async () => {
    const r = await create(true);
    expect(r.batch_id).toBe(r.id);
    expect((await getReorderBatch(db, r.id))?.items).toHaveLength(1);
  });

  it('moves the whole batch through sent and confirmed, and learns lead time once on receipt', async () => {
    const { rows } = await twoMedBatch();
    const batchId = rows[0].batch_id;
    await setBatchMessage(db, batchId, { subject: 'S2', body: 'B2' });
    await markBatchSent(db, batchId, { server_reference: 'REF-9', expected_by: addDays(today, 5) });
    let batch = await getReorderBatch(db, batchId);
    expect(batch?.status).toBe('sent');
    expect(batch?.server_reference).toBe('REF-9');
    expect(batch?.message_body).toBe('B2');
    expect(batch?.items.every((i) => i.status === 'sent' && i.server_reference === 'REF-9')).toBe(true);

    await markBatchConfirmed(db, batchId);
    expect((await getReorderBatch(db, batchId))?.status).toBe('confirmed');

    await markBatchReceived(db, batchId, addDays(today, 4));
    batch = await getReorderBatch(db, batchId);
    expect(batch?.status).toBe('received');
    expect(batch?.received_at).not.toBeNull();
    // Learned once from the batch, not once per item.
    expect((await getProvider(db, providerId))?.learned_lead_time_days).toBe(4);
  });

  it('keeps the batch open while one item is still outstanding', async () => {
    const { rows } = await twoMedBatch();
    const batchId = rows[0].batch_id;
    await markBatchSent(db, batchId, { server_reference: null, expected_by: null });
    await markReorderReceived(db, rows[0].id, today, { learnLeadTime: false });
    const batch = await getReorderBatch(db, batchId);
    expect(batch?.status).toBe('sent');
    expect(batch?.items.map((i) => i.status).sort()).toEqual(['received', 'sent']);

    await cancelReorderBatch(db, batchId);
    const closed = await getReorderBatch(db, batchId);
    expect(closed?.status).toBe('received');
    expect(closed?.items.map((i) => i.status).sort()).toEqual(['cancelled', 'received']);
  });

  it('derives a closing status from the items', () => {
    expect(batchStatus([{ status: 'received' }, { status: 'cancelled' }])).toBe('received');
    expect(batchStatus([{ status: 'cancelled' }, { status: 'cancelled' }])).toBe('cancelled');
    expect(batchStatus([{ status: 'received' }, { status: 'overdue' }])).toBe('overdue');
  });

  it('lists open and closed batches separately, newest first', async () => {
    const older = await create(true);
    await markReorderSent(db, older.id, { server_reference: null, expected_by: null });
    await markReorderReceived(db, older.id);
    const { rows } = await twoMedBatch();

    const open = await listReorderBatches(db, profileId, { active: true });
    const closed = await listReorderBatches(db, profileId, { active: false });
    expect(open.map((b) => b.batch_id)).toEqual([rows[0].batch_id]);
    expect(open[0].items).toHaveLength(2);
    expect(closed.map((b) => b.batch_id)).toEqual([older.id]);
    expect(await listReorderBatches(db, profileId)).toHaveLength(2);
  });
});
