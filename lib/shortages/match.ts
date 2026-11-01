/**
 * Matches shortage entries against the patient's medications. Pure.
 *
 * Two kinds of entries:
 *  - product-level (GTIN or Pharmacode as product_code): exact code match
 *  - ingredient-level (product_code "ATC:…", from the federal BWL list):
 *    the medication's active ingredient, or a word of its name, equals one
 *    of the entry's ingredient names
 * Nothing here proposes alternatives; a match only flags the medication the
 * patient already has.
 */
import type { MedicationRow, ShortageEntryRow, ShortageSource } from '../db/types';

export interface ShortageHit {
  medication_id: string;
  source: ShortageSource;
  product_code: string;
  /** How the match was made; shown to the user. */
  matched_by: 'code' | 'ingredient';
}

type Entry = Pick<ShortageEntryRow, 'source' | 'product_code' | 'active_ingredient'>;
type Medication = Pick<MedicationRow, 'id' | 'name' | 'gtin' | 'pharmacode' | 'active_ingredient' | 'archived_at'>;

const normaliseCode = (code: string | null | undefined) => (code ?? '').replace(/\s+/g, '').replace(/^0+(?=\d{13}$)/, '');

/** Lower-case, accents stripped, punctuation to spaces. */
export function normaliseName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ingredient names an entry lists: "Co-Amoxicillin / Amoxicillin / Clavulansäure" -> each part. */
function ingredientNames(entry: Entry): string[] {
  return (entry.active_ingredient ?? '')
    .split(/\s*[\/;,]\s*/)
    .map(normaliseName)
    .filter((n) => n.length >= 4);
}

export function matchShortages(entries: Entry[], medications: Medication[]): ShortageHit[] {
  const byCode = new Map<string, Entry[]>();
  const ingredientEntries: Entry[] = [];
  for (const entry of entries) {
    if (entry.product_code.startsWith('ATC:')) {
      ingredientEntries.push(entry);
      continue;
    }
    const code = normaliseCode(entry.product_code);
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), entry]);
  }

  const hits: ShortageHit[] = [];
  for (const medication of medications) {
    if (medication.archived_at) continue;

    for (const code of [normaliseCode(medication.gtin), normaliseCode(medication.pharmacode)]) {
      if (!code) continue;
      for (const entry of byCode.get(code) ?? []) {
        hits.push({ medication_id: medication.id, source: entry.source, product_code: entry.product_code, matched_by: 'code' });
      }
    }

    // A combination product lists several ingredients; any of them can match.
    const ingredientParts = new Set(
      (medication.active_ingredient ?? '')
        .split(/\s*[\/;,+]\s*/)
        .map(normaliseName)
        .filter(Boolean),
    );
    const nameWords = new Set(normaliseName(medication.name).split(' '));
    for (const entry of ingredientEntries) {
      const names = ingredientNames(entry);
      const matches = names.some((n) => ingredientParts.has(n) || nameWords.has(n));
      if (matches) {
        hits.push({ medication_id: medication.id, source: entry.source, product_code: entry.product_code, matched_by: 'ingredient' });
      }
    }
  }
  return hits;
}
