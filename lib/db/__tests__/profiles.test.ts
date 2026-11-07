import {
  createMedication,
  createProfile,
  deleteProfile,
  ensureDefaultProfile,
  getActiveProfile,
  getSetting,
  listMedications,
  listProfiles,
  setActiveProfile,
} from '../repo';
import { createNodeClient, type NodeDbClient } from '../testing/nodeClient';

let db: NodeDbClient;

beforeEach(() => {
  db = createNodeClient();
});
afterEach(() => db.close());

describe('profiles', () => {
  it('falls back to the default profile until one is chosen', async () => {
    const def = await ensureDefaultProfile(db);
    expect((await getActiveProfile(db)).id).toBe(def.id);
    const mum = await createProfile(db, { display_name: '  Mum ', patient_reference: ' MM-1950 ' });
    expect(mum).toMatchObject({ display_name: 'Mum', patient_reference: 'MM-1950', is_default: 0 });
    await setActiveProfile(db, mum.id);
    expect((await getActiveProfile(db)).id).toBe(mum.id);
    expect((await listProfiles(db)).map((p) => p.display_name)).toEqual(['My medications', 'Mum']);
  });

  it('keeps lists separate and deletes a person with everything in it', async () => {
    const def = await ensureDefaultProfile(db);
    const mum = await createProfile(db, { display_name: 'Mum' });
    await createMedication(db, { profile_id: def.id, name: 'Mine' });
    await createMedication(db, { profile_id: mum.id, name: 'Hers' });
    expect((await listMedications(db, def.id)).map((m) => m.name)).toEqual(['Mine']);
    expect((await listMedications(db, mum.id)).map((m) => m.name)).toEqual(['Hers']);

    await setActiveProfile(db, mum.id);
    await deleteProfile(db, mum.id);
    expect(await listProfiles(db)).toHaveLength(1);
    expect(await getSetting(db, 'active_profile_id')).toBeNull();
    expect((await getActiveProfile(db)).id).toBe(def.id);
    await expect(deleteProfile(db, def.id)).rejects.toThrow(/last list/);
  });

  it('promotes another list when the default is removed', async () => {
    const def = await ensureDefaultProfile(db);
    const dad = await createProfile(db, { display_name: 'Dad' });
    await deleteProfile(db, def.id);
    const [only] = await listProfiles(db);
    expect(only.id).toBe(dad.id);
    expect(only.is_default).toBe(1);
    expect((await getActiveProfile(db)).id).toBe(dad.id);
  });

  it('rejects an empty name', async () => {
    await expect(createProfile(db, { display_name: '   ' })).rejects.toThrow(/name/i);
  });
});
