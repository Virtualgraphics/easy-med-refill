import { addDays, todayIso } from '../clock';
import {
  addPack,
  archiveMedication,
  createMedication,
  createPrescription,
  createProvider,
  CRITICAL_SAFETY_BUFFER_DAYS,
  dailyUnits,
  DEFAULT_SAFETY_BUFFER_DAYS,
  deleteProvider,
  effectiveLeadTimeDays,
  ensureDefaultProfile,
  getActiveDoseSchedule,
  getCurrentPrescription,
  getMedication,
  getSupplyOverview,
  getUnitsOnHand,
  listDoseScheduleHistory,
  listMedications,
  listPacks,
  recordRefillUsed,
  refillsRemaining,
  setDoseSchedule,
  setPackUnitsRemaining,
  updateMedication,
  updateProvider,
} from '../repo';
import { seedDemoData } from '../seed';
import { createNodeClient, type NodeDbClient } from '../testing/nodeClient';

let db: NodeDbClient;
let profileId: string;

beforeEach(async () => {
  db = createNodeClient();
  profileId = (await ensureDefaultProfile(db)).id;
});

afterEach(() => {
  db.close();
});

const today = todayIso();

describe('profiles', () => {
  it('creates the default profile once', async () => {
    const again = await ensureDefaultProfile(db);
    expect(again.id).toBe(profileId);
    expect(await db.getAllAsync('SELECT id FROM profiles', [])).toHaveLength(1);
  });
});

describe('medications', () => {
  it('applies the safety buffer from the critical flag', async () => {
    const plain = await createMedication(db, { profile_id: profileId, name: 'Plain' });
    const critical = await createMedication(db, { profile_id: profileId, name: 'Critical', is_critical: true });
    expect(plain.safety_buffer_days).toBe(DEFAULT_SAFETY_BUFFER_DAYS);
    expect(critical.safety_buffer_days).toBe(CRITICAL_SAFETY_BUFFER_DAYS);
    expect(critical.is_critical).toBe(1);
  });

  it('keeps an explicit buffer', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X', is_critical: true, safety_buffer_days: 60 });
    expect(med.safety_buffer_days).toBe(60);
  });

  it('lists critical first, then alphabetically, hiding archived', async () => {
    await createMedication(db, { profile_id: profileId, name: 'beta' });
    const crit = await createMedication(db, { profile_id: profileId, name: 'Zeta', is_critical: true });
    const old = await createMedication(db, { profile_id: profileId, name: 'Alpha' });
    await archiveMedication(db, old.id);

    const names = (await listMedications(db, profileId)).map((m) => m.name);
    expect(names).toEqual(['Zeta', 'beta']);
    expect(crit.name).toBe('Zeta');

    const all = await listMedications(db, profileId, { includeArchived: true });
    expect(all).toHaveLength(3);
  });

  it('updates only allowed columns and converts booleans', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    const changed = await updateMedication(db, med.id, {
      is_critical: true,
      notes: 'morning',
      // @ts-expect-error unknown columns must be ignored, never injected
      profile_id: 'someone-else',
    });
    expect(changed).toBe(true);
    const row = await getMedication(db, med.id);
    expect(row?.is_critical).toBe(1);
    expect(row?.notes).toBe('morning');
    expect(row?.profile_id).toBe(profileId);
    expect(row!.updated_at >= med.updated_at).toBe(true);
  });

  it('reports no change for an empty patch', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    expect(await updateMedication(db, med.id, {})).toBe(false);
  });
});

describe('dose schedules', () => {
  it('versions changes and keeps history', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    const first = await setDoseSchedule(db, med.id, {
      units_per_intake: 1,
      intakes_per_period: 2,
      period: 'day',
      valid_from: addDays(today, -30),
    });
    const second = await setDoseSchedule(db, med.id, { units_per_intake: 2, intakes_per_period: 2, period: 'day' });

    const active = await getActiveDoseSchedule(db, med.id);
    expect(active?.id).toBe(second.id);

    const history = await listDoseScheduleHistory(db, med.id);
    expect(history.map((h) => h.id)).toEqual([second.id, first.id]);
    expect(history[1].valid_to).toBe(today);
    expect(await getActiveDoseSchedule(db, med.id, addDays(today, -1))).toMatchObject({ id: first.id });
  });

  it('keeps the current schedule active until a future-dated change starts', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    const current = await setDoseSchedule(db, med.id, { units_per_intake: 1, intakes_per_period: 1, period: 'day' });
    const future = await setDoseSchedule(db, med.id, {
      units_per_intake: 2,
      intakes_per_period: 1,
      period: 'day',
      valid_from: addDays(today, 10),
    });
    expect((await getActiveDoseSchedule(db, med.id))?.id).toBe(current.id);
    expect((await getActiveDoseSchedule(db, med.id, addDays(today, 10)))?.id).toBe(future.id);
  });

  it('replaces a same-day entry instead of leaving a zero-length row', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    await setDoseSchedule(db, med.id, { units_per_intake: 1, intakes_per_period: 1, period: 'day' });
    const corrected = await setDoseSchedule(db, med.id, { units_per_intake: 1, intakes_per_period: 3, period: 'day' });
    const history = await listDoseScheduleHistory(db, med.id);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(corrected.id);
  });

  it('computes planned daily units for day and week periods', () => {
    expect(dailyUnits({ units_per_intake: 2, intakes_per_period: 2, period: 'day' })).toBe(4);
    expect(dailyUnits({ units_per_intake: 1, intakes_per_period: 7, period: 'week' })).toBe(1);
    expect(dailyUnits({ units_per_intake: 1, intakes_per_period: 3, period: 'week' })).toBeCloseTo(3 / 7);
  });
});

describe('packs', () => {
  it('sums units on hand over non-depleted packs', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    const a = await addPack(db, { medication_id: med.id, units_per_pack: 100, units_remaining: 40 });
    await addPack(db, { medication_id: med.id, units_per_pack: 100 });
    expect(await getUnitsOnHand(db, med.id)).toBe(140);

    await setPackUnitsRemaining(db, a.id, 0);
    expect(await getUnitsOnHand(db, med.id)).toBe(100);
    expect(await listPacks(db, med.id)).toHaveLength(1);
    expect(await listPacks(db, med.id, { includeDepleted: true })).toHaveLength(2);
    const depleted = (await listPacks(db, med.id, { includeDepleted: true })).find((p) => p.id === a.id);
    expect(depleted?.depleted_at).not.toBeNull();
  });

  it('orders packs by soonest expiry with undated packs last', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    await addPack(db, { medication_id: med.id, units_per_pack: 10 });
    await addPack(db, { medication_id: med.id, units_per_pack: 10, expiry_date: '2027-06-01' });
    await addPack(db, { medication_id: med.id, units_per_pack: 10, expiry_date: '2027-01-01' });
    expect((await listPacks(db, med.id)).map((p) => p.expiry_date)).toEqual(['2027-01-01', '2027-06-01', null]);
  });
});

describe('prescriptions and providers', () => {
  it('returns the latest issued prescription and counts refills', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X' });
    await createPrescription(db, { medication_id: med.id, type: 'single', issued_at: '2026-01-01', refills_allowed: 2 });
    const newer = await createPrescription(db, { medication_id: med.id, type: 'single', issued_at: '2026-06-01', refills_allowed: 2 });

    const current = await getCurrentPrescription(db, med.id);
    expect(current?.id).toBe(newer.id);
    expect(refillsRemaining(current!)).toBe(2);

    await recordRefillUsed(db, newer.id);
    expect(refillsRemaining((await getCurrentPrescription(db, med.id))!)).toBe(1);
    expect(refillsRemaining({ refills_allowed: null, refills_used: 5 })).toBeNull();
  });

  it('uses the learned lead time once known', async () => {
    const p = await createProvider(db, { profile_id: profileId, kind: 'practice', name: 'P', default_lead_time_days: 7 });
    expect(effectiveLeadTimeDays(p)).toBe(7);
    await updateProvider(db, p.id, { learned_lead_time_days: 3.5 });
    const updated = (await db.getFirstAsync<{ learned_lead_time_days: number }>('SELECT learned_lead_time_days FROM providers WHERE id = ?', [p.id]))!;
    expect(effectiveLeadTimeDays({ default_lead_time_days: 7, ...updated })).toBe(3.5);
    expect(await deleteProvider(db, p.id)).toBe(true);
  });
});

describe('supply overview', () => {
  it('gathers stock, active schedule and current prescription per medication', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'X', is_critical: true });
    const empty = await createMedication(db, { profile_id: profileId, name: 'Empty' });
    await addPack(db, { medication_id: med.id, units_per_pack: 50, units_remaining: 20, expiry_date: '2027-03-01' });
    await addPack(db, { medication_id: med.id, units_per_pack: 50, expiry_date: '2027-01-01' });
    await setDoseSchedule(db, med.id, { units_per_intake: 2, intakes_per_period: 2, period: 'day', valid_from: addDays(today, -5) });
    await setDoseSchedule(db, med.id, { units_per_intake: 3, intakes_per_period: 2, period: 'day', valid_from: addDays(today, 5) });
    await createPrescription(db, { medication_id: med.id, type: 'standing', issued_at: '2026-01-01' });
    const rx = await createPrescription(db, { medication_id: med.id, type: 'standing', issued_at: '2026-09-01' });

    const overview = await getSupplyOverview(db, profileId);
    expect(overview.map((s) => s.medication.id)).toEqual([med.id, empty.id]);

    const [x, e] = overview;
    expect(x.units_on_hand).toBe(70);
    expect(x.pack_count).toBe(2);
    expect(x.next_expiry).toBe('2027-01-01');
    expect(x.daily_units).toBe(4);
    expect(x.prescription?.id).toBe(rx.id);

    expect(e.units_on_hand).toBe(0);
    expect(e.pack_count).toBe(0);
    expect(e.schedule).toBeNull();
    expect(e.daily_units).toBeNull();
    expect(e.prescription).toBeNull();

    const later = await getSupplyOverview(db, profileId, addDays(today, 5));
    expect(later[0].daily_units).toBe(6);
  });
});

describe('demo seed', () => {
  it('seeds a complete, anonymised list once', async () => {
    const first = await seedDemoData(db);
    expect(first.seeded).toBe(true);
    const second = await seedDemoData(db);
    expect(second.seeded).toBe(false);

    const overview = await getSupplyOverview(db, profileId);
    expect(overview.length).toBeGreaterThanOrEqual(8);
    for (const item of overview) {
      expect(item.schedule).not.toBeNull();
      expect(item.pack_count).toBeGreaterThan(0);
      expect(item.prescription).not.toBeNull();
      expect(item.medication.preferred_provider_id).not.toBeNull();
    }
    expect(overview.filter((s) => s.medication.is_critical === 1).length).toBeGreaterThanOrEqual(2);
    expect(overview[0].medication.is_critical).toBe(1);
  });
});
