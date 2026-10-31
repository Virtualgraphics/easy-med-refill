/**
 * Templated reorder message. Fixed wording per channel and language, so
 * practices and pharmacies get predictable, checkable requests. Nothing
 * here is generated; only values are filled in. Supply language only.
 */
import { formatDate, formatUnits } from '../db/format';
import type { IsoDate, ProviderKind, ReorderLanguage } from '../db/types';
import type { PrescriptionStatus } from '../supply/forecast';

export interface ReorderMessageInput {
  language: ReorderLanguage;
  providerKind: ProviderKind;
  patientReference: string | null;
  medication: { name: string; strength: string | null; form: string | null; gtin: string | null; pharmacode: string | null };
  packSize: number | null;
  quantityPacks: number;
  unitsRemaining: number | null;
  runoutDate: IsoDate | null;
  neededBy: IsoDate | null;
  prescription: { status: PrescriptionStatus; validUntil: IsoDate | null; refillsRemaining: number | null };
  /** Set when a shortage is reported for this product: the clinic gets a heads-up line. */
  shortage?: { status: string | null } | null;
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
    greeting: 'Guten Tag',
    intro: {
      practice: 'Ich bitte um ein Rezept bzw. die Nachbestellung des folgenden Medikaments:',
      pharmacy: 'Ich bitte um die Bereitstellung des folgenden Medikaments:',
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
    footer:
      'Diese Anfrage wurde mit Easy MedRefill erstellt. Bitte bestätigen Sie den Eingang über den Link unten oder kurz per Antwort auf diese E-Mail.',
    closing: 'Freundliche Grüsse',
  },
  en: {
    subject: (name: string, ref: string | null) => `Reorder ${name}${ref ? ` – patient ${ref}` : ''}`,
    greeting: 'Dear team',
    intro: {
      practice: 'I would like to request a prescription or reorder for the following medication:',
      pharmacy: 'I would like to order the following medication:',
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
    footer: 'This request was created with Easy MedRefill. Please confirm receipt via the link below or with a short reply to this email.',
    closing: 'Kind regards',
  },
} as const;

export function renderReorderMessage(input: ReorderMessageInput): ReorderMessage {
  const t = T[input.language];
  const med = input.medication;
  const nameLower = med.name.toLowerCase();
  const extras = [med.strength, med.form].filter((part): part is string => Boolean(part) && !nameLower.includes(part!.toLowerCase()));
  const medLine = [med.name, ...extras].join(' ');

  const rx =
    input.prescription.status === 'none'
      ? t.rx.none
      : input.prescription.status === 'expired'
        ? t.rx.expired(input.prescription.validUntil)
        : input.prescription.status === 'exhausted'
          ? t.rx.exhausted
          : t.rx.valid(input.prescription.validUntil, input.prescription.refillsRemaining);

  const stock = `${t.units(input.unitsRemaining)}${input.runoutDate ? ` (${t.until(input.runoutDate)})` : ''}`;

  const lines: string[] = [
    t.greeting,
    '',
    t.intro[input.providerKind],
    '',
    `${t.patient}: ${input.patientReference ?? '–'}`,
    `${t.medication}: ${medLine}`,
  ];
  if (med.gtin) lines.push(`${t.gtin}: ${med.gtin}`);
  if (med.pharmacode) lines.push(`${t.pharmacode}: ${med.pharmacode}`);
  if (input.packSize) lines.push(`${t.pack}: ${t.units(input.packSize)}`);
  lines.push(`${t.quantity}: ${t.packs(input.quantityPacks)}`);
  lines.push(`${t.stock}: ${stock}`);
  if (input.neededBy) lines.push(`${t.neededBy}: ${formatDate(input.neededBy)}`);
  lines.push(`${t.prescription}: ${rx}`);
  if (input.shortage) {
    lines.push('', t.shortage(input.shortage.status));
  }
  if (input.note) {
    lines.push('', `${t.note}: ${input.note}`);
  }
  lines.push('', `${t.reference}: ${input.reference}`, t.footer, '', t.closing);

  return { subject: t.subject(med.name, input.patientReference), body: lines.join('\n') };
}
