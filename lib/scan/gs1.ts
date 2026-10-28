/**
 * GS1 DataMatrix parsing for medicine packs.
 *
 * Swiss packs carry a GS1 DataMatrix with application identifiers (AIs):
 *   01 GTIN (14 digits)   17 expiry YYMMDD   10 batch   21 serial
 * Variable-length AIs end with the FNC1 separator (ASCII 29). Scanners
 * may prefix the payload with the symbology identifier "]d2".
 */
import type { IsoDate } from '../db/types';

export interface Gs1Pack {
  gtin: string | null;
  expiry: IsoDate | null;
  batch: string | null;
  serial: string | null;
  /** Every AI found, raw. */
  ais: Record<string, string>;
}

const GS = '\u001d';

/** AIs with a fixed data length (digits after the AI). */
const FIXED_LENGTH: Record<string, number> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '11': 6,
  '12': 6,
  '13': 6,
  '15': 6,
  '16': 6,
  '17': 6,
  '20': 2,
};

/** Variable-length AIs we recognise, by prefix. */
const VARIABLE: string[] = ['10', '21', '22', '30', '37', '240', '241', '250', '251', '400', '401', '710', '711', '712', '713', '714', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];

export function looksLikeGs1(raw: string): boolean {
  const s = stripSymbology(raw);
  return /^01\d{14}/.test(s) || s.startsWith(GS) || /^(10|17|21)\d/.test(s);
}

export function parseGs1(raw: string): Gs1Pack {
  let s = stripSymbology(raw);
  const ais: Record<string, string> = {};

  while (s.length > 0) {
    if (s.startsWith(GS)) {
      s = s.slice(1);
      continue;
    }
    const fixed = Object.keys(FIXED_LENGTH).find((ai) => s.startsWith(ai));
    if (fixed) {
      const len = FIXED_LENGTH[fixed];
      ais[fixed] = s.slice(fixed.length, fixed.length + len);
      s = s.slice(fixed.length + len);
      continue;
    }
    const variable = VARIABLE.find((ai) => s.startsWith(ai));
    if (variable) {
      const rest = s.slice(variable.length);
      const end = rest.indexOf(GS);
      ais[variable] = end === -1 ? rest : rest.slice(0, end);
      s = end === -1 ? '' : rest.slice(end + 1);
      continue;
    }
    // Unknown AI: stop rather than misattribute the remainder.
    ais.unparsed = s;
    break;
  }

  return {
    gtin: normaliseGtin(ais['01']),
    expiry: expiryFromYYMMDD(ais['17']),
    batch: ais['10']?.trim() || null,
    serial: ais['21']?.trim() || null,
    ais,
  };
}

function stripSymbology(raw: string): string {
  let s = raw.trim();
  if (s.startsWith(']d2') || s.startsWith(']Q3') || s.startsWith(']C1')) {
    s = s.slice(3);
  }
  // Some scanners deliver the separator as a literal <GS> or as ASCII 29; both end here as \u001d.
  return s.replace(/<GS>/gi, GS);
}

/**
 * GTIN-14 from AI 01 to the GTIN-13 printed on Swiss packs (7680…),
 * verified with the GS1 check digit. Returns null if invalid.
 */
export function normaliseGtin(value: string | undefined): string | null {
  if (!value || !/^\d{14}$/.test(value)) return null;
  if (!gtinCheckDigitValid(value)) return null;
  return value.startsWith('0') ? value.slice(1) : value;
}

export function gtinCheckDigitValid(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits.at(-1));
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** YYMMDD to YYYY-MM-DD. DD = 00 means the last day of the month. */
export function expiryFromYYMMDD(value: string | undefined): IsoDate | null {
  if (!value || !/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  let dd = Number(value.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = 2000 + yy;
  if (dd === 0) {
    dd = new Date(year, mm, 0).getDate();
  }
  if (dd < 1 || dd > new Date(year, mm, 0).getDate()) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
