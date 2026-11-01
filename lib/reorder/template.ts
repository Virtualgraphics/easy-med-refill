/**
 * Templated reorder message. Fixed wording per channel and language, so
 * practices and pharmacies get predictable, checkable requests. Nothing
 * here is generated; only values are filled in. Supply language only.
 *
 * One message covers every medication ordered together from a supplier:
 * a single item reads as a short letter, several items as a numbered list.
 */
import { formatDate, formatUnits } from '../db/format';
import type { IsoDate, ProviderKind, ReorderLanguage } from '../db/types';
import type { PrescriptionStatus } from '../supply/forecast';

export interface ReorderItemInput {
  medication: { name: string; strength: string | null; form: string | null; gtin: string | null; pharmacode: string | null };
  packSize: number | null;
  quantityPacks: number;
  unitsRemaining: number | null;
  runoutDate: IsoDate | null;
  prescription: { status: PrescriptionStatus; validUntil: IsoDate | null; refillsRemaining: number | null };
  /** Set when a shortage is reported for this product: the clinic gets a heads-up line. */
  shortage?: { status: string | null } | null;
}

export interface ReorderMessageInput {
  language: ReorderLanguage;
  providerKind: ProviderKind;
  patientReference: string | null;
  items: ReorderItemInput[];
  neededBy: IsoDate | null;
  note: string | null;
  reference: string;
}

export interface ReorderMessage {
  subject: string;
  body: string;
}

const T = {
  de: {
    subject: (name: string, ref: string | null) => `Nachbestellung ${name}${ref ? ` – Patient ${ref}` : ''}`,
    subjectMany: (n: number, ref: string | null) => `Nachbestellung ${n} Medikamente${ref ? ` – Patient ${ref}` : ''}`,
    greeting: 'Guten Tag',
    intro: {
      practice: 'Ich bitte um ein Rezept bzw. die Nachbestellung des folgenden Medikaments:',
      pharmacy: 'Ich bitte um die Bereitstellung des folgenden Medikaments:',
    },
    introMany: {
      practice: 'Ich bitte um Rezepte bzw. die Nachbestellung der folgenden Medikamente (Abholung zusammen):',
      pharmacy: 'Ich bitte um die Bereitstellung der folgenden Medikamente (Abholung zusammen):',
    },
    patient: 'Patient',
    medication: 'Medikament',
    gtin: 'GTIN',
    pharmacode: 'Pharmacode',
    pack: 'Packung',
    quantity: 'Menge',
    packs: (n: number) => (n === 1 ? '1 Packung' : `${n} Packungen`),
    units: (n: number | null) => (n === null ? 'unbekannt' : `${formatUnits(n)} Stk`),
    stock: 'Aktueller Vorrat',
    until: (d: IsoDate) => `reicht bis ca. ${formatDate(d)}`,
    neededBy: 'Benötigt bis',
    prescription: 'Rezept',
    rx: {
      none: 'kein Rezept vorhanden, bitte neu ausstellen',
      expired: (d: IsoDate | null) => `abgelaufen${d ? ` am ${formatDate(d)}` : ''}, bitte neu ausstellen`,
      exhausted: 'keine Repetition mehr möglich, bitte neu ausstellen',
      valid: (d: IsoDate | null, r: number | null) =>
        `gültig${d ? ` bis ${formatDate(d)}` : ''}${r !== null ? `, ${r} Repetition${r === 1 ? '' : 'en'} übrig` : ''}`,
    },
    note: 'Bemerkung',
    reference: 'Referenz',
    shortage: (status: string | null) =>
      `Hinweis: Für dieses Präparat ist ein Lieferengpass gemeldet${status ? ` (${status})` : ''}. Ich bitte deshalb um frühzeitige Bearbeitung und um Rücksprache, falls die Lieferung nicht möglich ist.`,
    shortageShort: (status: string | null) => `Hinweis: Lieferengpass gemeldet${status ? ` (${status})` : ''}, bitte um frühzeitige Bearbeitung und Rücksprache, falls nicht lieferbar.`,
    footer:
      'Diese Anfrage wurde mit Easy MedRefill erstellt. Bitte bestätigen Sie den Eingang über den Link unten oder kurz per Antwort auf diese E-Mail.',
    closing: 'Freundliche Grüsse',
  },
  en: {
    subject: (name: string, ref: string | null) => `Reorder ${name}${ref ? ` – patient ${ref}` : ''}`,
    subjectMany: (n: number, ref: string | null) => `Reorder ${n} medications${ref ? ` – patient ${ref}` : ''}`,
    greeting: 'Dear team',
    intro: {
      practice: 'I would like to request a prescription or reorder for the following medication:',
      pharmacy: 'I would like to order the following medication:',
    },
    introMany: {
      practice: 'I would like to request prescriptions or a reorder for the following medications (to be collected together):',
      pharmacy: 'I would like to order the following medications (to be collected together):',
    },
    patient: 'Patient',
    medication: 'Medication',
    gtin: 'GTIN',
    pharmacode: 'Pharmacode',
    pack: 'Pack',
    quantity: 'Quantity',
    packs: (n: number) => (n === 1 ? '1 pack' : `${n} packs`),
    units: (n: number | null) => (n === null ? 'unknown' : `${formatUnits(n)} units`),
    stock: 'Current stock',
    until: (d: IsoDate) => `lasts until about ${formatDate(d)}`,
    neededBy: 'Needed by',
    prescription: 'Prescription',
    rx: {
      none: 'none on file, please issue a new one',
      expired: (d: IsoDate | null) => `expired${d ? ` on ${formatDate(d)}` : ''}, please issue a new one`,
      exhausted: 'no refills left, please issue a new one',
      valid: (d: IsoDate | null, r: number | null) =>
        `valid${d ? ` until ${formatDate(d)}` : ''}${r !== null ? `, ${r} refill${r === 1 ? '' : 's'} left` : ''}`,
    },
    note: 'Note',
    reference: 'Reference',
    shortage: (status: string | null) =>
      `Note: a supply shortage is reported for this product${status ? ` (${status})` : ''}. I would therefore be grateful for early handling, and for a call back if delivery is not possible.`,
    shortageShort: (status: string | null) => `Note: shortage reported${status ? ` (${status})` : ''}, early handling and a call back if not available would be appreciated.`,
    footer: 'This request was created with Easy MedRefill. Please confirm receipt via the link below or with a short reply to this email.',
    closing: 'Kind regards',
  },
} as const;

/** "Tacrolimus 1 mg capsule", without repeating a strength already in the name. */
export function medicationLine(med: ReorderItemInput['medication']): string {
  const nameLower = med.name.toLowerCase();
  const extras = [med.strength, med.form].filter((part): part is string => Boolean(part) && !nameLower.includes(part!.toLowerCase()));
  return [med.name, ...extras].join(' ');
}

function prescriptionLine(t: (typeof T)[ReorderLanguage], p: ReorderItemInput['prescription']): string {
  switch (p.status) {
    case 'none':
      return t.rx.none;
    case 'expired':
      return t.rx.expired(p.validUntil);
    case 'exhausted':
      return t.rx.exhausted;
    default:
      return t.rx.valid(p.validUntil, p.refillsRemaining);
  }
}

function itemLines(t: (typeof T)[ReorderLanguage], item: ReorderItemInput): string[] {
  const med = item.medication;
  const stock = `${t.units(item.unitsRemaining)}${item.runoutDate ? ` (${t.until(item.runoutDate)})` : ''}`;
  const lines: string[] = [];
  if (med.gtin) lines.push(`${t.gtin}: ${med.gtin}`);
  if (med.pharmacode) lines.push(`${t.pharmacode}: ${med.pharmacode}`);
  if (item.packSize) lines.push(`${t.pack}: ${t.units(item.packSize)}`);
  lines.push(`${t.quantity}: ${t.packs(item.quantityPacks)}`);
  lines.push(`${t.stock}: ${stock}`);
  lines.push(`${t.prescription}: ${prescriptionLine(t, item.prescription)}`);
  return lines;
}

export function renderReorderMessage(input: ReorderMessageInput): ReorderMessage {
  const t = T[input.language];
  const items = input.items;
  if (items.length === 0) throw new Error('A reorder message needs at least one medication.');
  const many = items.length > 1;

  const lines: string[] = [t.greeting, '', many ? t.introMany[input.providerKind] : t.intro[input.providerKind], '', `${t.patient}: ${input.patientReference ?? '–'}`];

  if (!many) {
    const item = items[0];
    lines.push(`${t.medication}: ${medicationLine(item.medication)}`, ...itemLines(t, item));
    if (input.neededBy) lines.push(`${t.neededBy}: ${formatDate(input.neededBy)}`);
    if (item.shortage) lines.push('', t.shortage(item.shortage.status));
  } else {
    if (input.neededBy) lines.push(`${t.neededBy}: ${formatDate(input.neededBy)}`);
    items.forEach((item, index) => {
      lines.push('', `${index + 1}. ${medicationLine(item.medication)}`, ...itemLines(t, item).map((l) => `   ${l}`));
      if (item.shortage) lines.push(`   ${t.shortageShort(item.shortage.status)}`);
    });
  }

  if (input.note) lines.push('', `${t.note}: ${input.note}`);
  lines.push('', `${t.reference}: ${input.reference}`, t.footer, '', t.closing);

  const subject = many ? t.subjectMany(items.length, input.patientReference) : t.subject(items[0].medication.name, input.patientReference);
  return { subject, body: lines.join('\n') };
}
