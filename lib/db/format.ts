import type { IsoDate } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** 2026-10-27 -> 27.10.2026 (Swiss convention). */
export function formatDate(value: IsoDate | null | undefined): string {
  if (!value) return '–';
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

/** Trims float noise: 0.5 -> "0.5", 6 -> "6", 0.428571 -> "0.43". */
export function formatUnits(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/** Parses a user-typed number; empty or invalid gives null. */
export function parseNumber(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (normalised === '') return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}
