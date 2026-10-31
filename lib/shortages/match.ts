/**
 * Matches shortage entries against the patient's medications. Pure.
 *
 * A medication matches when its GTIN or Pharmacode equals the entry's
 * product code. Nothing here proposes alternatives; a match only flags
 * the medication the patient already has.
 */
import type { MedicationRow, ShortageEntryRow, ShortageSource } from '../db/types';

export interface ShortageHit {
  medication_id: string;
  source: ShortageSource;
  product_code: string;
}

type Entry = Pick<ShortageEntryRow, 'source' | 'product_code'>;
type Medication = Pick<MedicationRow, 'id' | 'gtin' | 'pharmacode' | 'archived_at'>;

const normalise = (code: string | null | undefined) => (code ?? '').replace(/\s+/g, '').replace(/^0+(?=\d{13}$)/, '');

export function matchShortages(entries: Entry[], medications: Medication[]): ShortageHit[] {
  const byCode = new Map<string, Entry[]>();
  for (const entry of entries) {
    const code = normalise(entry.product_code);
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), entry]);
  }

  const hits: ShortageHit[] = [];
  for (const medication of medications) {
    if (medication.archived_at) continue;
    for (const code of [normalise(medication.gtin), normalise(medication.pharmacode)]) {
      if (!code) continue;
      for (const entry of byCode.get(code) ?? []) {
        hits.push({ medication_id: medication.id, source: entry.source, product_code: entry.product_code });
      }
    }
  }
  return hits;
}
