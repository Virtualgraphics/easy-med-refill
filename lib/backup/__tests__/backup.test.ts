import { randomBytes } from 'node:crypto';

import {
  addPack,
  createMedication,
  createPrescription,
  createProvider,
  createReorderBatch,
  ensureDefaultProfile,
  getSupplyOverview,
  listProfiles,
  listProviders,
  listReorderBatches,
  setDoseSchedule,
  updateProfile,
} from '../../db/repo';
import { createNodeClient, type NodeDbClient } from '../../db/testing/nodeClient';
import { BackupError, decryptBackup, encryptBackup, parseBackupContainer } from '../crypto';
import { collectProfileExport, parseProfileExport, restoreProfileExport } from '../format';

const random = (n: number) => new Uint8Array(randomBytes(n));

describe('encrypted container', () => {
  it('round-trips text and rejects the wrong passphrase', () => {
    const container = encryptBackup('{"hello":"wörld"}', 'correct horse', random);
    expect(container.format).toBe('easy-medrefill-backup');
    expect(JSON.stringify(container)).not.toContain('hello');
    const parsed = parseBackupContainer(JSON.stringify(container));
    expect(decryptBackup(parsed, 'correct horse')).toBe('{"hello":"wörld"}');
    expect(() => decryptBackup(parsed, 'wrong')).toThrow(BackupError);
  });

  it('refuses files that are not exports and short passphrases', () => {
    expect(() => parseBackupContainer('not json')).toThrow(/not an Easy MedRefill export/);
    expect(() => parseBackupContainer('{"format":"other"}')).toThrow(/not an Easy MedRefill export/);
    expect(() => encryptBackup('x', 'abc', random)).toThrow(/6 characters/);
  });
});

describe('profile export and import', () => {
  let db: NodeDbClient;

  beforeEach(() => {
    db = createNodeClient();
  });
  afterEach(() => db.close());

  it('restores a list into a new profile with fresh ids and intact links', async () => {
    const source = await ensureDefaultProfile(db);
    await updateProfile(db, source.id, { display_name: 'Anna', patient_reference: 'AB-1960' });
    const practice = await createProvider(db, { profile_id: source.id, kind: 'practice', name: 'Praxis', email: 'p@example.invalid', default_lead_time_days: 4 });
    const med = await createMedication(db, { profile_id: source.id, name: 'Tacrolimus 1 mg', is_critical: true, preferred_provider_id: practice.id });
    await setDoseSchedule(db, med.id, { units_per_intake: 2, intakes_per_period: 2, period: 'day' });
    await addPack(db, { medication_id: med.id, units_per_pack: 100, units_remaining: 40 });
    const rx = await createPrescription(db, { medication_id: med.id, provider_id: practice.id, type: 'standing', issued_at: '2026-10-01', valid_until: '2027-10-01' });
    await createReorderBatch(
      db,
      { provider_id: practice.id, items: [{ medication_id: med.id, prescription_id: rx.id, quantity_packs: 2, units_remaining_at_request: 40, needed_by: null }] },
      { approve: true },
    );

    const data = await collectProfileExport(db, source.id);
    const json = JSON.stringify(data);
    const container = encryptBackup(json, 'caregiver-pass', random);
    const restoredJson = decryptBackup(parseBackupContainer(JSON.stringify(container)), 'caregiver-pass');
    const restored = await restoreProfileExport(db, parseProfileExport(restoredJson), { displayName: 'Anna (imported)' });

    expect(restored.id).not.toBe(source.id);
    expect(restored.display_name).toBe('Anna (imported)');
    expect(restored.patient_reference).toBe('AB-1960');
    expect(await listProfiles(db)).toHaveLength(2);

    const providers = await listProviders(db, restored.id);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).not.toBe(practice.id);

    const [supply] = await getSupplyOverview(db, restored.id);
    expect(supply.medication.name).toBe('Tacrolimus 1 mg');
    expect(supply.medication.preferred_provider_id).toBe(providers[0].id);
    expect(supply.units_on_hand).toBe(40);
    expect(supply.daily_units).toBe(4);
    expect(supply.prescription?.provider_id).toBe(providers[0].id);
    expect(supply.open_request?.status).toBe('approved');

    const batches = await listReorderBatches(db, restored.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].items[0].medication_id).toBe(supply.medication.id);
    expect(batches[0].items[0].prescription_id).toBe(supply.prescription?.id);

    // The source list is untouched.
    const [original] = await getSupplyOverview(db, source.id);
    expect(original.medication.id).toBe(med.id);
  });
});
