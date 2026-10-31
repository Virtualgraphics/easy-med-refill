/**
 * Suggests what a reorder should ask for. Pure; the user can change
 * every value before approving.
 */
import { addDays, todayIso } from '../db/clock';
import type { MedicationSupply } from '../db/repo/supply';
import type { IsoDate } from '../db/types';
import type { SupplyForecast } from '../supply/forecast';

/** Target supply after the order arrives. */
export const DEFAULT_COVERAGE_DAYS = 90;

export interface ReorderSuggestion {
  quantity_packs: number;
  pack_size: number | null;
  needed_by: IsoDate;
  coverage_days: number;
  /** Units still needed to reach the coverage target, after stock on hand. */
  units_to_cover: number;
}

export function suggestReorder(
  supply: MedicationSupply,
  forecast: SupplyForecast,
  options: { today?: IsoDate; coverageDays?: number } = {},
): ReorderSuggestion {
  const today = options.today ?? todayIso();
  const coverage = options.coverageDays ?? DEFAULT_COVERAGE_DAYS;
  const packSize = supply.last_pack_size;

  let unitsToCover = 0;
  let quantity = 1;
  if (supply.daily_units !== null && supply.daily_units > 0) {
    unitsToCover = Math.max(0, Math.ceil(supply.daily_units * coverage - supply.units_on_hand));
    if (packSize && packSize > 0) {
      quantity = Math.max(1, Math.ceil(unitsToCover / packSize));
    }
  }

  const margin = forecast.lead_time_days + forecast.safety_buffer_days;
  let neededBy: IsoDate;
  if (forecast.pill_runout_date) {
    const beforeBuffer = addDays(forecast.pill_runout_date, -forecast.safety_buffer_days);
    neededBy = beforeBuffer < today ? today : beforeBuffer;
  } else {
    neededBy = addDays(today, margin);
  }

  return { quantity_packs: quantity, pack_size: packSize, needed_by: neededBy, coverage_days: coverage, units_to_cover: unitsToCover };
}

/** Short reference shown to practices; the first block of the request id. */
export function requestReference(requestId: string): string {
  return requestId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
