import { renderReorderMessage } from '../../reorder/template';
import {
  createMedication,
  ensureDefaultProfile,
  getShortageForMedication,
  listShortageMatchedMedicationIds,
  listShortageMatches,
  recordShortageMatch,
  replaceShortageEntries,
  resolveStaleShortageMatches,
} from '../../db/repo';
import { createNodeClient, type NodeDbClient } from '../../db/testing/nodeClient';
import { matchShortages } from '../match';

describe('matchShortages', () => {
  const entries = [
    { source: 'simulated' as const, product_code: '7680000000014' },
    { source: 'bwl' as const, product_code: '1234567' },
  ];

  it('matches by GTIN and Pharmacode, ignoring archived medications', () => {
    const hits = matchShortages(entries, [
      { id: 'a', gtin: '7680000000014', pharmacode: null, archived_at: null },
      { id: 'b', gtin: null, pharmacode: '1234567', archived_at: null },
      { id: 'c', gtin: '7680000000014', pharmacode: null, archived_at: '2026-01-01T00:00:00Z' },
      { id: 'd', gtin: '7680000000021', pharmacode: null, archived_at: null },
    ]);
    expect(hits).toEqual([
      { medication_id: 'a', source: 'simulated', product_code: '7680000000014' },
      { medication_id: 'b', source: 'bwl', product_code: '1234567' },
    ]);
  });

  it('treats a 14-digit GTIN with a leading zero as the same product', () => {
    const hits = matchShortages([{ source: 'simulated', product_code: '07680000000014' }], [{ id: 'a', gtin: '7680000000014', pharmacode: null, archived_at: null }]);
    expect(hits).toHaveLength(1);
  });
});

describe('shortage repository', () => {
  let db: NodeDbClient;
  let profileId: string;

  beforeEach(async () => {
    db = createNodeClient();
    profileId = (await ensureDefaultProfile(db)).id;
  });
  afterEach(() => db.close());

  it('records a match once, lists it with feed details, and resolves it when the feed drops it', async () => {
    const med = await createMedication(db, { profile_id: profileId, name: 'Tacrolimus 1 mg', gtin: '7680000000014', is_critical: true });
    await replaceShortageEntries(db, [{ source: 'simulated', product_code: '7680000000014', active_ingredient: 'Tacrolimus', status: 'Lieferengpass' }]);

    expect(await recordShortageMatch(db, med.id, 'simulated', '7680000000014')).toBe(true);
    expect(await recordShortageMatch(db, med.id, 'simulated', '7680000000014')).toBe(false);

    const matches = await listShortageMatches(db, profileId);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ medication_name: 'Tacrolimus 1 mg', is_critical: 1, status: 'Lieferengpass' });
    expect(await listShortageMatchedMedicationIds(db, profileId)).toEqual(new Set([med.id]));
    expect((await getShortageForMedication(db, med.id))?.status).toBe('Lieferengpass');

    // Feed no longer lists the product: the match closes.
    await replaceShortageEntries(db, [{ source: 'simulated', product_code: '0000000000000' }]);
    expect(await resolveStaleShortageMatches(db)).toBe(1);
    expect(await listShortageMatches(db, profileId)).toHaveLength(0);

    // It comes back: the same row reopens instead of duplicating.
    await replaceShortageEntries(db, [{ source: 'simulated', product_code: '7680000000014' }]);
    expect(await recordShortageMatch(db, med.id, 'simulated', '7680000000014')).toBe(true);
    expect(await db.getAllAsync('SELECT id FROM shortage_matches', [])).toHaveLength(1);
  });

  it('replaces only the sources contained in the new feed', async () => {
    await replaceShortageEntries(db, [
      { source: 'simulated', product_code: '1' },
      { source: 'bwl', product_code: '2' },
    ]);
    await replaceShortageEntries(db, [{ source: 'simulated', product_code: '3' }]);
    const codes = (await db.getAllAsync<{ source: string; product_code: string }>('SELECT source, product_code FROM shortage_entries ORDER BY product_code', [])).map(
      (r) => `${r.source}:${r.product_code}`,
    );
    expect(codes).toEqual(['bwl:2', 'simulated:3']);
  });
});

describe('reorder message with a shortage', () => {
  it('adds the heads-up line for the clinic without suggesting alternatives', () => {
    const { body } = renderReorderMessage({
      language: 'de',
      providerKind: 'practice',
      patientReference: 'DP-1968',
      medication: { name: 'Tacrolimus 1 mg', strength: null, form: null, gtin: '7680000000014', pharmacode: null },
      packSize: 100,
      quantityPacks: 3,
      unitsRemaining: 276,
      runoutDate: '2026-12-16',
      neededBy: '2026-11-10',
      prescription: { status: 'valid', validUntil: null, refillsRemaining: null },
      shortage: { status: 'Lieferengpass, voraussichtlich bis 2026-12-15' },
      note: null,
      reference: 'ABCDEF12',
    });
    expect(body).toContain('Hinweis: Für dieses Präparat ist ein Lieferengpass gemeldet (Lieferengpass, voraussichtlich bis 2026-12-15)');
    expect(body.toLowerCase()).not.toMatch(/alternativ|ersatz|substitut|generik/);
  });
});
