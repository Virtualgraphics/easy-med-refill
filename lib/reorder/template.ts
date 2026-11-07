/**
 * Templated reorder message. Fixed wording per channel and language, so
 * practices and pharmacies get predictable, checkable requests. Nothing
 * here is generated; only values are filled in. Supply language only.
 *
 * One message covers every medication ordered together from a supplier:
 * a single item reads as a short letter, several items as a numbered list.
 * Languages: German, English, French, Italian (the supplier's language,
 * chosen per order; defaults to the app language).
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

interface Texts {
  subject: (name: string, ref: string | null) => string;
  subjectMany: (n: number, ref: string | null) => string;
  greeting: string;
  intro: Record<ProviderKind, string>;
  introMany: Record<ProviderKind, string>;
  patient: string;
  medication: string;
  gtin: string;
  pharmacode: string;
  pack: string;
  quantity: string;
  packs: (n: number) => string;
  units: (n: number | null) => string;
  stock: string;
  until: (d: IsoDate) => string;
  neededBy: string;
  prescription: string;
  rx: {
    none: string;
    expired: (d: IsoDate | null) => string;
    exhausted: string;
    valid: (d: IsoDate | null, r: number | null) => string;
  };
  note: string;
  reference: string;
  shortage: (status: string | null) => string;
  shortageShort: (status: string | null) => string;
  footer: string;
  closing: string;
}

const T: Record<ReorderLanguage, Texts> = {
  de: {
    subject: (name, ref) => `Nachbestellung ${name}${ref ? ` – Patient ${ref}` : ''}`,
    subjectMany: (n, ref) => `Nachbestellung ${n} Medikamente${ref ? ` – Patient ${ref}` : ''}`,
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
    packs: (n) => (n === 1 ? '1 Packung' : `${n} Packungen`),
    units: (n) => (n === null ? 'unbekannt' : `${formatUnits(n)} Stk`),
    stock: 'Aktueller Vorrat',
    until: (d) => `reicht bis ca. ${formatDate(d)}`,
    neededBy: 'Benötigt bis',
    prescription: 'Rezept',
    rx: {
      none: 'kein Rezept vorhanden, bitte neu ausstellen',
      expired: (d) => `abgelaufen${d ? ` am ${formatDate(d)}` : ''}, bitte neu ausstellen`,
      exhausted: 'keine Repetition mehr möglich, bitte neu ausstellen',
      valid: (d, r) => `gültig${d ? ` bis ${formatDate(d)}` : ''}${r !== null ? `, ${r} Repetition${r === 1 ? '' : 'en'} übrig` : ''}`,
    },
    note: 'Bemerkung',
    reference: 'Referenz',
    shortage: (status) =>
      `Hinweis: Für dieses Präparat ist ein Lieferengpass gemeldet${status ? ` (${status})` : ''}. Ich bitte deshalb um frühzeitige Bearbeitung und um Rücksprache, falls die Lieferung nicht möglich ist.`,
    shortageShort: (status) => `Hinweis: Lieferengpass gemeldet${status ? ` (${status})` : ''}, bitte um frühzeitige Bearbeitung und Rücksprache, falls nicht lieferbar.`,
    footer:
      'Diese Anfrage wurde mit Easy MedRefill erstellt. Bitte bestätigen Sie den Eingang über den Link unten oder kurz per Antwort auf diese E-Mail.',
    closing: 'Freundliche Grüsse',
  },
  en: {
    subject: (name, ref) => `Reorder ${name}${ref ? ` – patient ${ref}` : ''}`,
    subjectMany: (n, ref) => `Reorder ${n} medications${ref ? ` – patient ${ref}` : ''}`,
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
    packs: (n) => (n === 1 ? '1 pack' : `${n} packs`),
    units: (n) => (n === null ? 'unknown' : `${formatUnits(n)} units`),
    stock: 'Current stock',
    until: (d) => `lasts until about ${formatDate(d)}`,
    neededBy: 'Needed by',
    prescription: 'Prescription',
    rx: {
      none: 'none on file, please issue a new one',
      expired: (d) => `expired${d ? ` on ${formatDate(d)}` : ''}, please issue a new one`,
      exhausted: 'no refills left, please issue a new one',
      valid: (d, r) => `valid${d ? ` until ${formatDate(d)}` : ''}${r !== null ? `, ${r} refill${r === 1 ? '' : 's'} left` : ''}`,
    },
    note: 'Note',
    reference: 'Reference',
    shortage: (status) =>
      `Note: a supply shortage is reported for this product${status ? ` (${status})` : ''}. I would therefore be grateful for early handling, and for a call back if delivery is not possible.`,
    shortageShort: (status) => `Note: shortage reported${status ? ` (${status})` : ''}, early handling and a call back if not available would be appreciated.`,
    footer: 'This request was created with Easy MedRefill. Please confirm receipt via the link below or with a short reply to this email.',
    closing: 'Kind regards',
  },
  fr: {
    subject: (name, ref) => `Commande ${name}${ref ? ` – patient ${ref}` : ''}`,
    subjectMany: (n, ref) => `Commande de ${n} médicaments${ref ? ` – patient ${ref}` : ''}`,
    greeting: 'Bonjour',
    intro: {
      practice: 'Je vous prie de bien vouloir établir une ordonnance ou renouveler le médicament suivant :',
      pharmacy: 'Je vous prie de bien vouloir préparer le médicament suivant :',
    },
    introMany: {
      practice: 'Je vous prie de bien vouloir établir les ordonnances ou renouveler les médicaments suivants (retrait groupé) :',
      pharmacy: 'Je vous prie de bien vouloir préparer les médicaments suivants (retrait groupé) :',
    },
    patient: 'Patient',
    medication: 'Médicament',
    gtin: 'GTIN',
    pharmacode: 'Pharmacode',
    pack: 'Boîte',
    quantity: 'Quantité',
    packs: (n) => (n === 1 ? '1 boîte' : `${n} boîtes`),
    units: (n) => (n === null ? 'inconnu' : `${formatUnits(n)} unités`),
    stock: 'Stock actuel',
    until: (d) => `suffit jusqu’au ${formatDate(d)} environ`,
    neededBy: 'Nécessaire d’ici le',
    prescription: 'Ordonnance',
    rx: {
      none: 'aucune ordonnance, merci d’en établir une nouvelle',
      expired: (d) => `expirée${d ? ` le ${formatDate(d)}` : ''}, merci d’en établir une nouvelle`,
      exhausted: 'plus de renouvellement possible, merci d’en établir une nouvelle',
      valid: (d, r) => `valable${d ? ` jusqu’au ${formatDate(d)}` : ''}${r !== null ? `, ${r} renouvellement${r === 1 ? '' : 's'} restant${r === 1 ? '' : 's'}` : ''}`,
    },
    note: 'Remarque',
    reference: 'Référence',
    shortage: (status) =>
      `Remarque : une pénurie est signalée pour ce produit${status ? ` (${status})` : ''}. Je vous serais reconnaissant d’un traitement rapide et d’un rappel si la livraison n’est pas possible.`,
    shortageShort: (status) => `Remarque : pénurie signalée${status ? ` (${status})` : ''}, merci d’un traitement rapide et d’un rappel en cas d’indisponibilité.`,
    footer: 'Cette demande a été créée avec Easy MedRefill. Merci de confirmer sa réception via le lien ci-dessous ou par une courte réponse à cet e-mail.',
    closing: 'Meilleures salutations',
  },
  it: {
    subject: (name, ref) => `Ordine ${name}${ref ? ` – paziente ${ref}` : ''}`,
    subjectMany: (n, ref) => `Ordine di ${n} medicamenti${ref ? ` – paziente ${ref}` : ''}`,
    greeting: 'Buongiorno',
    intro: {
      practice: 'Chiedo cortesemente una ricetta o il rinnovo del seguente medicamento:',
      pharmacy: 'Chiedo cortesemente di preparare il seguente medicamento:',
    },
    introMany: {
      practice: 'Chiedo cortesemente le ricette o il rinnovo dei seguenti medicamenti (ritiro insieme):',
      pharmacy: 'Chiedo cortesemente di preparare i seguenti medicamenti (ritiro insieme):',
    },
    patient: 'Paziente',
    medication: 'Medicamento',
    gtin: 'GTIN',
    pharmacode: 'Pharmacode',
    pack: 'Confezione',
    quantity: 'Quantità',
    packs: (n) => (n === 1 ? '1 confezione' : `${n} confezioni`),
    units: (n) => (n === null ? 'sconosciuto' : `${formatUnits(n)} unità`),
    stock: 'Scorta attuale',
    until: (d) => `sufficiente fino al ${formatDate(d)} circa`,
    neededBy: 'Necessario entro il',
    prescription: 'Ricetta',
    rx: {
      none: 'nessuna ricetta, si prega di emetterne una nuova',
      expired: (d) => `scaduta${d ? ` il ${formatDate(d)}` : ''}, si prega di emetterne una nuova`,
      exhausted: 'nessuna ripetizione possibile, si prega di emetterne una nuova',
      valid: (d, r) => `valida${d ? ` fino al ${formatDate(d)}` : ''}${r !== null ? `, ${r} ripetizion${r === 1 ? 'e' : 'i'} rimanent${r === 1 ? 'e' : 'i'}` : ''}`,
    },
    note: 'Osservazione',
    reference: 'Riferimento',
    shortage: (status) =>
      `Nota: per questo prodotto è segnalata una carenza${status ? ` (${status})` : ''}. Chiedo quindi un’evasione sollecita e un contatto se la consegna non è possibile.`,
    shortageShort: (status) => `Nota: carenza segnalata${status ? ` (${status})` : ''}, si prega di evadere con sollecitudine e di contattarmi se non disponibile.`,
    footer: 'Questa richiesta è stata creata con Easy MedRefill. Si prega di confermare la ricezione tramite il link qui sotto o con una breve risposta a questa e-mail.',
    closing: 'Cordiali saluti',
  },
};

/** "Tacrolimus 1 mg capsule", without repeating a strength already in the name. */
export function medicationLine(med: ReorderItemInput['medication']): string {
  const nameLower = med.name.toLowerCase();
  const extras = [med.strength, med.form].filter((part): part is string => Boolean(part) && !nameLower.includes(part!.toLowerCase()));
  return [med.name, ...extras].join(' ');
}

function prescriptionLine(t: Texts, p: ReorderItemInput['prescription']): string {
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

function itemLines(t: Texts, item: ReorderItemInput): string[] {
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
  const t = T[input.language] ?? T.en;
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
