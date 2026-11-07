/**
 * Maps what Muse Spark read from a photographed list into the same import
 * candidates the eMediplan scan produces, so one review screen serves both.
 */
import type { ExtractedMedication, ExtractedPlan } from '../api/client';
import { t } from '../i18n/translate';
import { doseFromDailyPattern, type ImportCandidate, summariseDose } from './emediplan';

export function extractedToCandidates(plan: ExtractedPlan): ImportCandidate[] {
  return plan.medications.map((m, index) => candidateFromExtracted(m, index));
}

function candidateFromExtracted(m: ExtractedMedication, index: number): ImportCandidate {
  const weekly = /wöchentlich|weekly|par semaine|settimana|1x\/woche|pro woche/i.test(m.intake_note ?? '');
  let dose = doseFromDailyPattern([m.morning, m.noon, m.evening, m.night], m.as_needed);
  if (dose && weekly) {
    // "1-0-0-0 wöchentlich": the printed units are per week, not per day.
    dose = { ...dose, units_per_intake: dose.units_per_intake * dose.intakes_per_period, intakes_per_period: 1, period: 'week' };
  }
  const name = [m.name, m.strength].filter(Boolean).join(' ').trim();
  const notes = [m.reason, m.intake_note].filter(Boolean).join(' · ') || null;
  return {
    key: `photo:${index}:${name}`,
    suggestedName: name || t('scan.medicationN', { n: index + 1 }),
    gtin: null,
    pharmacode: null,
    notes,
    dose,
    doseSummary: dose ? summariseDose(dose, null) : m.as_needed ? t('scan.asNeededNoDose') : t('scan.noDoseOnList'),
  };
}
