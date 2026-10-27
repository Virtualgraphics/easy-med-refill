/**
 * Pill runway: how many days the stock on hand lasts at the planned
 * consumption. Returns null when consumption is unknown or zero.
 * The full forecast (prescription runway, reorder-by date) builds on this.
 */
export function pillRunwayDays(unitsOnHand: number, dailyUnits: number | null): number | null {
  if (dailyUnits === null || dailyUnits <= 0) {
    return null;
  }
  return Math.floor(unitsOnHand / dailyUnits);
}

export type RunwayTone = 'ok' | 'warn' | 'critical' | 'unknown';

/** Colour band for a runway relative to the medication's safety buffer. */
export function runwayTone(runwayDays: number | null, safetyBufferDays: number): RunwayTone {
  if (runwayDays === null) return 'unknown';
  if (runwayDays <= safetyBufferDays) return 'critical';
  if (runwayDays <= safetyBufferDays * 2) return 'warn';
  return 'ok';
}
