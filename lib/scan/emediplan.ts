/**
 * eMediplan (CHMED16A) QR code parsing.
 *
 * Wrapper: ChTransmissionFormat, "CHMED16A1" + base64(gzip(json)) or
 * "CHMED16A0" + plain json. CHMED23A ("CHMED23A." + base64(gzip(json)))
 * is deprecated upstream but decoded here too.
 * Spec: https://github.com/ig-emediplan/specification
 *
 * The JSON carries product identifiers (GTIN / Pharmacode), not names,
 * so imported medications need a name from the user or a product lookup.
 * Patient identity fields are parsed only so the user can confirm the
 * plan is theirs; the import never stores them.
 */
import { ungzip } from 'pako';

import type { DosePeriod, IsoDate } from '../db/types';

export type EmediplanIdType = 'none' | 'gtin' | 'pharmacode' | 'product';

export interface EmediplanPosology {
  from: IsoDate | null;
  to: IsoDate | null;
  /** Cycle length in seconds; default one day. */
  cycleSeconds: number;
  inReserve: boolean;
  /** Simplified morning / noon / evening / night doses, when given. */
  daily: number[] | null;
  /** Complex taking times: amount per cycle, summed. */
  perCycle: number | null;
}

export interface EmediplanMedicament {
  id: string;
  idType: EmediplanIdType;
  unit: string | null;
  takingReason: string | null;
  instructions: string | null;
  selfMedication: boolean;
  repetitionMonths: number | null;
  noSubstitution: boolean;
  posology: EmediplanPosology[];
}

export interface EmediplanDocument {
  version: string;
  /** 1 plan, 2 polymedication check, 3 prescription */
  medType: number;
  createdAt: string | null;
  author: string | null;
  remark: string | null;
  patient: { firstName: string | null; lastName: string | null; birthDate: string | null };
  medicaments: EmediplanMedicament[];
}

export class EmediplanParseError extends Error {}

export function isChTransmissionFormat(raw: string): boolean {
  return /^CHMED(16[A-Z][01]|23[A-Z]+\.)/i.test(raw.trim());
}

/** Unwraps ChTransmissionFormat and returns the JSON text. */
export function decodeChTransmission(raw: string): { version: string; json: string } {
  const text = raw.trim();
  const v16 = /^CHMED16([A-Z])([01])([\s\S]*)$/i.exec(text);
  if (v16) {
    const [, sub, compression, data] = v16;
    const version = `16${sub.toUpperCase()}`;
    return { version, json: compression === '1' ? inflate(data) : data };
  }
  const v23 = /^CHMED23([A-Z]+)(?:\.([1-9][0-9]*)\/([1-9][0-9]*))?\.([\s\S]*)$/i.exec(text);
  if (v23) {
    const [, sub, index, , data] = v23;
    if (index) {
      throw new EmediplanParseError('Chunked CHMED23 codes are not supported; scan a single-code plan.');
    }
    return { version: `23${sub.toUpperCase()}`, json: inflate(data) };
  }
  throw new EmediplanParseError('Not an eMediplan code.');
}

function inflate(base64: string): string {
  let binary: string;
  try {
    binary = atob(base64.replace(/\s+/g, ''));
  } catch {
    throw new EmediplanParseError('eMediplan code is not valid base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  try {
    return ungzip(bytes, { to: 'string' });
  } catch {
    throw new EmediplanParseError('eMediplan code could not be decompressed.');
  }
}

const ID_TYPES: Record<number, EmediplanIdType> = { 1: 'none', 2: 'gtin', 3: 'pharmacode', 4: 'product' };

export function parseEmediplan(raw: string): EmediplanDocument {
  const { version, json } = decodeChTransmission(raw);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new EmediplanParseError('eMediplan content is not valid JSON.');
  }
  if (!isRecord(data)) {
    throw new EmediplanParseError('eMediplan content has an unexpected shape.');
  }

  const patient = isRecord(data.Patient) ? data.Patient : {};
  const medicaments = Array.isArray(data.Medicaments) ? data.Medicaments : [];

  return {
    version,
    medType: num(data.MedType) ?? 1,
    createdAt: str(data.Dt),
    author: str(data.Auth),
    remark: str(data.Rmk),
    patient: { firstName: str(patient.FName), lastName: str(patient.LName), birthDate: str(patient.BDt) },
    medicaments: medicaments.filter(isRecord).map(parseMedicament),
  };
}

function parseMedicament(m: Record<string, unknown>): EmediplanMedicament {
  const posologies = Array.isArray(m.Pos) ? m.Pos.filter(isRecord) : [];
  return {
    id: str(m.Id) ?? '',
    idType: ID_TYPES[num(m.IdType) ?? 1] ?? 'none',
    unit: str(m.Unit),
    takingReason: str(m.TkgRsn),
    instructions: str(m.AppInstr),
    selfMedication: num(m.AutoMed) === 1,
    repetitionMonths: num(m.Rep),
    noSubstitution: num(m.Subs) === 1,
    posology: posologies.map(parsePosology),
  };
}

function parsePosology(p: Record<string, unknown>): EmediplanPosology {
  const daily = Array.isArray(p.D) ? p.D.map((d) => num(d) ?? 0) : null;
  const takingTimes = Array.isArray(p.TT) ? p.TT.filter(isRecord) : [];
  let perCycle: number | null = null;
  if (takingTimes.length > 0) {
    perCycle = takingTimes.reduce((sum, tt) => sum + (num(tt.DoFrom) ?? num(tt.A) ?? 0), 0);
  }
  return {
    from: str(p.DtFrom),
    to: str(p.DtTo),
    cycleSeconds: num(p.CyDu) ?? 86_400,
    inReserve: num(p.InRes) === 1,
    daily: takingTimes.length > 0 ? null : daily,
    perCycle,
  };
}

/** A medication plus dose schedule as the import screen proposes it. */
export interface ImportCandidate {
  key: string;
  /** Prefilled from the id or taking reason; the user confirms the real name. */
  suggestedName: string;
  gtin: string | null;
  pharmacode: string | null;
  notes: string | null;
  dose: {
    units_per_intake: number;
    intakes_per_period: number;
    period: DosePeriod;
    is_prn: boolean;
    valid_from: IsoDate | null;
  } | null;
  /** Human-readable dose summary for the import list. */
  doseSummary: string;
}

const DAY = 86_400;
const WEEK = 7 * DAY;

export function toImportCandidates(doc: EmediplanDocument): ImportCandidate[] {
  return doc.medicaments.map((m, index) => {
    const posology = m.posology[0] ?? null;
    const dose = posology ? doseFromPosology(posology) : null;
    const notes = [m.takingReason, m.instructions].filter(Boolean).join(' · ') || null;
    const suggestedName =
      m.idType === 'none' && m.id ? m.id : m.takingReason ? m.takingReason : m.id ? `${labelForId(m.idType)} ${m.id}` : `Medication ${index + 1}`;
    return {
      key: `${m.idType}:${m.id || index}`,
      suggestedName,
      gtin: m.idType === 'gtin' ? m.id : null,
      pharmacode: m.idType === 'pharmacode' ? m.id : null,
      notes,
      dose,
      doseSummary: dose ? summariseDose(dose, m.unit) : 'No dose in the plan',
    };
  });
}

function labelForId(type: EmediplanIdType): string {
  return type === 'gtin' ? 'GTIN' : type === 'pharmacode' ? 'Pharmacode' : 'Product';
}

function doseFromPosology(p: EmediplanPosology): ImportCandidate['dose'] {
  if (p.daily && p.daily.some((d) => d > 0)) {
    const nonZero = p.daily.filter((d) => d > 0);
    const allEqual = nonZero.every((d) => d === nonZero[0]);
    return {
      units_per_intake: allEqual ? nonZero[0] : round(nonZero.reduce((a, b) => a + b, 0)),
      intakes_per_period: allEqual ? nonZero.length : 1,
      period: 'day',
      is_prn: p.inReserve,
      valid_from: p.from,
    };
  }
  if (p.perCycle !== null && p.perCycle > 0) {
    if (p.cycleSeconds === WEEK) {
      return { units_per_intake: round(p.perCycle), intakes_per_period: 1, period: 'week', is_prn: p.inReserve, valid_from: p.from };
    }
    // Express any other cycle as intakes per day.
    return {
      units_per_intake: round(p.perCycle),
      intakes_per_period: round(DAY / p.cycleSeconds),
      period: 'day',
      is_prn: p.inReserve,
      valid_from: p.from,
    };
  }
  return null;
}

function summariseDose(dose: NonNullable<ImportCandidate['dose']>, unit: string | null): string {
  const u = unit ? ` ${unit}` : '';
  const prn = dose.is_prn ? ' (as needed)' : '';
  return `${dose.units_per_intake}${u} × ${dose.intakes_per_period} per ${dose.period}${prn}`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
