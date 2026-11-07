import { submitReorder } from '../../api/client';
import { addDays } from '../../db/clock';
import type { MedicationSupply } from '../../db/repo/supply';
import type { MedicationRow } from '../../db/types';
import { forecastSupply } from '../../supply/forecast';
import { requestReference, suggestReorder } from '../draft';
import { type ReorderItemInput, renderReorderMessage } from '../template';

const TODAY = '2026-10-31';
const NOW = '2026-10-31T08:00:00.000Z';

const medication: MedicationRow = {
  id: 'm1',
  profile_id: 'p1',
  name: 'Tacrolimus 1 mg',
  active_ingredient: 'Tacrolimus',
  strength: '1 mg',
  form: 'capsule',
  gtin: '7680000000014',
  pharmacode: null,
  is_critical: 1,
  safety_buffer_days: 35,
  preferred_provider_id: null,
  notes: null,
  archived_at: null,
  created_at: NOW,
  updated_at: NOW,
};

function supply(overrides: Partial<MedicationSupply> = {}): MedicationSupply {
  return {
    medication,
    units_on_hand: 60,
    pack_count: 1,
    next_expiry: null,
    last_pack_size: 100,
    schedule: null,
    daily_units: 6,
    prescription: null,
    open_request: null,
    ...overrides,
  };
}

describe('suggestReorder', () => {
  it('orders enough packs to reach the coverage target after stock on hand', () => {
    const s = supply();
    const f = forecastSupply({ supply: s, leadTimeDays: 5, today: TODAY });
    const d = suggestReorder(s, f, { today: TODAY });
    // 6/day × 90 = 540 needed, 60 on hand -> 480 units -> 5 packs of 100
    expect(d.units_to_cover).toBe(480);
    expect(d.quantity_packs).toBe(5);
    expect(d.pack_size).toBe(100);
    // run-out in 10 days, buffer 35 -> would be in the past -> today
    expect(d.needed_by).toBe(TODAY);
  });

  it('sets needed-by before the safety buffer is eaten when there is time', () => {
    const s = supply({ units_on_hand: 600 });
    const f = forecastSupply({ supply: s, leadTimeDays: 5, today: TODAY });
    const d = suggestReorder(s, f, { today: TODAY });
    expect(d.quantity_packs).toBe(1);
    expect(d.needed_by).toBe(addDays(TODAY, 100 - 35));
  });

  it('falls back to one pack and lead + buffer when consumption or pack size is unknown', () => {
    const s = supply({ daily_units: null, last_pack_size: null });
    const f = forecastSupply({ supply: s, leadTimeDays: 5, today: TODAY });
    const d = suggestReorder(s, f, { today: TODAY });
    expect(d.quantity_packs).toBe(1);
    expect(d.needed_by).toBe(addDays(TODAY, 40));
  });

  it('builds a short reference from the request id', () => {
    expect(requestReference('3f9a1c2e-0000-4000-8000-000000000000')).toBe('3F9A1C2E');
  });
});

describe('renderReorderMessage', () => {
  const tacrolimus: ReorderItemInput = {
    medication: { name: 'Tacrolimus', strength: '1 mg', form: 'capsule', gtin: '7680000000014', pharmacode: null },
    packSize: 100,
    quantityPacks: 2,
    unitsRemaining: 22,
    runoutDate: '2026-11-03',
    prescription: { status: 'valid', validUntil: '2027-01-31', refillsRemaining: null },
  };
  const base = {
    providerKind: 'practice' as const,
    patientReference: 'DP-1968',
    items: [tacrolimus],
    neededBy: '2026-11-10',
    note: null,
    reference: '3F9A1C2E',
  };
  const withRx = (prescription: ReorderItemInput['prescription']) => ({ ...base, items: [{ ...tacrolimus, prescription }] });

  it('renders the German practice template with every field', () => {
    const { subject, body } = renderReorderMessage({ ...base, language: 'de' });
    expect(subject).toBe('Nachbestellung Tacrolimus – Patient DP-1968');
    expect(body).toContain('Ich bitte um ein Rezept bzw. die Nachbestellung');
    expect(body).toContain('Patient: DP-1968');
    expect(body).toContain('Medikament: Tacrolimus 1 mg capsule');
    expect(body).toContain('GTIN: 7680000000014');
    expect(body).toContain('Packung: 100 Stk');
    expect(body).toContain('Menge: 2 Packungen');
    expect(body).toContain('Aktueller Vorrat: 22 Stk (reicht bis ca. 03.11.2026)');
    expect(body).toContain('Benötigt bis: 10.11.2026');
    expect(body).toContain('Rezept: gültig bis 31.01.2027');
    expect(body).toContain('Referenz: 3F9A1C2E');
    expect(body).not.toContain('Bemerkung');
  });

  it('switches wording for pharmacies, English, and prescription states', () => {
    const pharmacy = renderReorderMessage({ ...base, language: 'en', providerKind: 'pharmacy', note: 'Please call when ready' });
    expect(pharmacy.subject).toBe('Reorder Tacrolimus – patient DP-1968');
    expect(pharmacy.body).toContain('I would like to order the following medication');
    expect(pharmacy.body).toContain('Quantity: 2 packs');
    expect(pharmacy.body).toContain('Note: Please call when ready');

    expect(renderReorderMessage({ ...withRx({ status: 'none', validUntil: null, refillsRemaining: null }), language: 'en' }).body).toContain('Prescription: none on file');
    expect(renderReorderMessage({ ...withRx({ status: 'exhausted', validUntil: null, refillsRemaining: 0 }), language: 'de' }).body).toContain('keine Repetition mehr');
    expect(renderReorderMessage({ ...withRx({ status: 'expired', validUntil: '2026-09-01', refillsRemaining: null }), language: 'de' }).body).toContain(
      'abgelaufen am 01.09.2026',
    );
  });

  it('lists several medications as one numbered request with a shared pickup', () => {
    const mycophenolate: ReorderItemInput = {
      medication: { name: 'Mycophenolate mofetil 500 mg', strength: '500 mg', form: 'tablet', gtin: null, pharmacode: '1234567' },
      packSize: 150,
      quantityPacks: 3,
      unitsRemaining: 300,
      runoutDate: '2027-01-15',
      prescription: { status: 'expired', validUntil: '2026-10-01', refillsRemaining: null },
      shortage: { status: 'bis Ende Jahr' },
    };
    const { subject, body } = renderReorderMessage({ ...base, language: 'de', items: [tacrolimus, mycophenolate] });
    expect(subject).toBe('Nachbestellung 2 Medikamente – Patient DP-1968');
    expect(body).toContain('der folgenden Medikamente (Abholung zusammen)');
    expect(body).toContain('Benötigt bis: 10.11.2026');
    expect(body).toContain('1. Tacrolimus 1 mg capsule');
    expect(body).toContain('   Menge: 2 Packungen');
    expect(body).toContain('2. Mycophenolate mofetil 500 mg tablet');
    expect(body).toContain('   Pharmacode: 1234567');
    expect(body).toContain('   Rezept: abgelaufen am 01.10.2026');
    expect(body).toContain('   Hinweis: Lieferengpass gemeldet (bis Ende Jahr)');
    // The single-item layout is not used for lists.
    expect(body).not.toContain('Medikament: ');
    expect(body.indexOf('1. Tacrolimus')).toBeLessThan(body.indexOf('2. Mycophenolate'));

    const en = renderReorderMessage({ ...base, language: 'en', providerKind: 'pharmacy', items: [tacrolimus, mycophenolate] });
    expect(en.subject).toBe('Reorder 2 medications – patient DP-1968');
    expect(en.body).toContain('to be collected together');
  });

  it('renders French and Italian with the same structure', () => {
    const fr = renderReorderMessage({ ...base, language: 'fr' });
    expect(fr.subject).toBe('Commande Tacrolimus – patient DP-1968');
    expect(fr.body).toContain('Médicament: Tacrolimus 1 mg capsule');
    expect(fr.body).toContain('Quantité: 2 boîtes');
    expect(fr.body).toContain('Ordonnance: valable jusqu’au 31.01.2027');
    expect(fr.body).toContain('Référence: 3F9A1C2E');

    const it2 = renderReorderMessage({ ...base, language: 'it', providerKind: 'pharmacy', items: [tacrolimus, { ...tacrolimus, quantityPacks: 1 }] });
    expect(it2.subject).toBe('Ordine di 2 medicamenti – paziente DP-1968');
    expect(it2.body).toContain('(ritiro insieme)');
    expect(it2.body).toContain('   Quantità: 1 confezione');
    expect(it2.body).toContain('Cordiali saluti');
  });

  it('never talks about doses or what to take', () => {
    for (const language of ['de', 'en', 'fr', 'it'] as const) {
      const { body } = renderReorderMessage({ ...base, language });
      expect(body.toLowerCase()).not.toMatch(/dosis|dose|einnehmen|take |prendre|assumere/);
    }
  });
});

describe('api stub', () => {
  it('marks a reorder as sent locally when no server is configured', async () => {
    const result = await submitReorder({
      request_id: '3f9a1c2e-0000-4000-8000-000000000000',
      language: 'de',
      patient_reference: null,
      provider: { kind: 'practice', name: 'P', email: null },
      items: [{ medication: { name: 'X', strength: null, form: null, gtin: null, pharmacode: null }, quantity_packs: 1, units_remaining: null, needed_by: null }],
      needed_by: null,
      message: { subject: 's', body: 'b' },
    });
    expect(result).toEqual({ reference: 'LOCAL-3F9A1C2E', status: 'sent' });
  });
});
