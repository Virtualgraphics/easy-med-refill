import { submitReorder } from '../../api/client';
import { addDays } from '../../db/clock';
import type { MedicationSupply } from '../../db/repo/supply';
import type { MedicationRow } from '../../db/types';
import { forecastSupply } from '../../supply/forecast';
import { requestReference, suggestReorder } from '../draft';
import { renderReorderMessage } from '../template';

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
  const base = {
    providerKind: 'practice' as const,
    patientReference: 'DP-1968',
    medication: { name: 'Tacrolimus', strength: '1 mg', form: 'capsule', gtin: '7680000000014', pharmacode: null },
    packSize: 100,
    quantityPacks: 2,
    unitsRemaining: 22,
    runoutDate: '2026-11-03',
    neededBy: '2026-11-10',
    prescription: { status: 'valid' as const, validUntil: '2027-01-31', refillsRemaining: null },
    note: null,
    reference: '3F9A1C2E',
  };

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

    expect(renderReorderMessage({ ...base, language: 'en', prescription: { status: 'none', validUntil: null, refillsRemaining: null } }).body).toContain(
      'Prescription: none on file',
    );
    expect(renderReorderMessage({ ...base, language: 'de', prescription: { status: 'exhausted', validUntil: null, refillsRemaining: 0 } }).body).toContain(
      'keine Repetition mehr',
    );
    expect(renderReorderMessage({ ...base, language: 'de', prescription: { status: 'expired', validUntil: '2026-09-01', refillsRemaining: null } }).body).toContain(
      'abgelaufen am 01.09.2026',
    );
  });

  it('never talks about doses or what to take', () => {
    for (const language of ['de', 'en'] as const) {
      const { body } = renderReorderMessage({ ...base, language });
      expect(body.toLowerCase()).not.toMatch(/dosis|dose|einnehmen|take /);
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
      medication: { name: 'X', strength: null, form: null, gtin: null, pharmacode: null },
      quantity_packs: 1,
      units_remaining: null,
      needed_by: null,
      message: { subject: 's', body: 'b' },
    });
    expect(result).toEqual({ reference: 'LOCAL-3F9A1C2E', status: 'sent' });
  });
});
