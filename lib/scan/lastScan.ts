import type { ImportCandidate } from './emediplan';

/**
 * Hands a parsed list (eMediplan code or photographed paper list) to the
 * import screen without pushing a large payload through route params.
 * Cleared after use.
 */
export interface PendingImport {
  source: 'emediplan' | 'photo';
  candidates: ImportCandidate[];
  /** Short description for the review screen header. */
  summary: string;
  /** Shown only so the user can confirm the plan is theirs; never stored. */
  patientLine: string | null;
  warning: string | null;
}

let pending: PendingImport | null = null;

export function setPendingImport(payload: PendingImport | null): void {
  pending = payload;
}

export function takePendingImport(): PendingImport | null {
  const value = pending;
  pending = null;
  return value;
}
