import type { ExtractedMedication } from '../../api/client';
import { extractedToCandidates } from '../photoImport';

const med = (overrides: Partial<ExtractedMedication>): ExtractedMedication => ({
  name: 'Prograf',
  active_ingredient: 'Tacrolimus',
  strength: '1 mg',
  form: 'Kapsel',
  morning: 3,
  noon: 0,
  evening: 3,
  night: 0,
  as_needed: false,
  intake_note: null,
  reason: null,
  ...overrides,
});

describe('extractedToCandidates', () => {
  it('builds name, dose and notes from a transcribed row', () => {
    const [c] = extractedToCandidates({ medications: [med({ reason: 'Immunsuppression', intake_note: 'nüchtern' })], patient_fields_seen: true, notes: null });
    expect(c).toMatchObject({
      suggestedName: 'Prograf 1 mg',
      gtin: null,
      pharmacode: null,
      notes: 'Immunsuppression · nüchtern',
      dose: { units_per_intake: 3, intakes_per_period: 2, period: 'day', is_prn: false, valid_from: null },
      doseSummary: '3 × 2 per day',
    });
  });

  it('collapses unequal patterns to the daily total and keeps as-needed rows without a dose', () => {
    const [unequal, prn] = extractedToCandidates({
      medications: [med({ morning: 1, evening: 0.5 }), med({ name: 'Dafalgan', strength: '500 mg', morning: 0, evening: 0, as_needed: true })],
      patient_fields_seen: false,
      notes: null,
    });
    expect(unequal.dose).toMatchObject({ units_per_intake: 1.5, intakes_per_period: 1, period: 'day' });
    expect(prn.dose).toBeNull();
    expect(prn.doseSummary).toBe('As needed, no fixed dose');
  });

  it('turns a weekly note into a per-week schedule', () => {
    const [c] = extractedToCandidates({
      medications: [med({ name: 'Methotrexat', strength: '10 mg', morning: 1, evening: 0, intake_note: '1x wöchentlich, Montag' })],
      patient_fields_seen: false,
      notes: null,
    });
    expect(c.dose).toMatchObject({ units_per_intake: 1, intakes_per_period: 1, period: 'week' });
  });

  it('never carries patient data: candidates only hold medication fields', () => {
    const [c] = extractedToCandidates({ medications: [med({})], patient_fields_seen: true, notes: 'Patient: Max Muster' });
    expect(JSON.stringify(c)).not.toMatch(/Muster/);
  });
});
