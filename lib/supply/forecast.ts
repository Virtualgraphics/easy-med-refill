/**
 * Supply forecast: the two runways and the date by which the user must act.
 *
 *   pill runway          = units on hand ÷ planned daily consumption
 *   prescription runway  = days until the prescription expires or its
 *                          refills are used up
 *   reorder by           = pill run-out − supplier lead time − safety buffer
 *   renew by             = prescription end − lead time − buffer, when the
 *                          prescription ends before the pills do
 *   shortage on a critical medication pulls "reorder by" to today
 *   an open reorder turns the status into "ordered" until it is received
 *
 * Pure functions; no I/O. Dates are YYYY-MM-DD strings, which compare
 * correctly as strings.
 */
import { addDays, daysBetween, todayIso } from '../db/clock';
import { refillsRemaining } from '../db/repo/prescriptions';
import { DEFAULT_LEAD_TIME_DAYS, effectiveLeadTimeDays } from '../db/repo/providers';
import type { MedicationSupply } from '../db/repo/supply';
import type { IsoDate, ProviderRow, ReorderStatus } from '../db/types';
import { pillRunwayDays } from './runway';

export type PrescriptionStatus = 'none' | 'valid' | 'expired' | 'exhausted';
export type SupplyStatus = 'unknown' | 'ok' | 'ordered' | 'due_soon' | 'due' | 'overdue' | 'out';
export type NextAction = 'none' | 'reorder' | 'renew_prescription' | 'await_delivery';

/** "Due soon" starts this many days before the action date. */
export const DUE_SOON_DAYS = 7;

/** Request statuses that count as "an order is on its way". */
const OPEN_ORDER_STATUSES: readonly ReorderStatus[] = ['approved', 'sent', 'confirmed', 'overdue'];

export interface OpenOrder {
  request_id: string;
  status: ReorderStatus;
  expected_by: IsoDate | null;
  /** No confirmation within the lead time. */
  overdue: boolean;
}

export interface SupplyForecast {
  medication_id: string;
  today: IsoDate;
  units_on_hand: number;
  daily_units: number | null;

  pill_runway_days: number | null;
  pill_runout_date: IsoDate | null;

  prescription_status: PrescriptionStatus;
  /** Days until the prescription stops working; null when none or unlimited. */
  prescription_runway_days: number | null;
  prescription_end_date: IsoDate | null;

  lead_time_days: number;
  safety_buffer_days: number;
  shortage: boolean;

  reorder_by: IsoDate | null;
  renewal_by: IsoDate | null;
  open_order: OpenOrder | null;

  next_action: NextAction;
  action_by: IsoDate | null;
  /** Negative when the action date has passed. */
  days_until_action: number | null;
  status: SupplyStatus;
}

export interface ForecastInput {
  supply: MedicationSupply;
  leadTimeDays: number;
  /** An unresolved shortage match exists for this medication. */
  shortage?: boolean;
  today?: IsoDate;
}

export function forecastSupply({ supply, leadTimeDays, shortage = false, today = todayIso() }: ForecastInput): SupplyForecast {
  const { medication, units_on_hand, daily_units, prescription } = supply;
  const lead = Math.max(0, Math.round(leadTimeDays));
  const buffer = medication.safety_buffer_days;
  const margin = lead + buffer;

  const pillRunway = pillRunwayDays(units_on_hand, daily_units);
  const pillRunout = pillRunway === null ? null : addDays(today, pillRunway);

  let prescriptionStatus: PrescriptionStatus = 'none';
  let prescriptionEnd: IsoDate | null = null;
  let prescriptionRunway: number | null = null;
  if (prescription) {
    prescriptionEnd = prescription.valid_until;
    if (refillsRemaining(prescription) === 0) {
      prescriptionStatus = 'exhausted';
      prescriptionRunway = 0;
    } else if (prescriptionEnd !== null && prescriptionEnd < today) {
      prescriptionStatus = 'expired';
      prescriptionRunway = 0;
    } else {
      prescriptionStatus = 'valid';
      prescriptionRunway = prescriptionEnd === null ? null : daysBetween(today, prescriptionEnd);
    }
  }

  let reorderBy = pillRunout === null ? null : addDays(pillRunout, -margin);
  const shortageOverride = shortage && medication.is_critical === 1;
  if (shortageOverride && (reorderBy === null || reorderBy > today)) {
    reorderBy = today;
  }

  let renewalBy: IsoDate | null = null;
  if (prescriptionStatus === 'expired' || prescriptionStatus === 'exhausted') {
    renewalBy = today;
  } else if (prescriptionStatus === 'valid' && prescriptionEnd !== null) {
    const endsBeforePills = pillRunout === null || prescriptionEnd < pillRunout;
    if (endsBeforePills) {
      renewalBy = addDays(prescriptionEnd, -margin);
    }
  }

  const request = supply.open_request;
  const openOrder: OpenOrder | null =
    request && OPEN_ORDER_STATUSES.includes(request.status)
      ? { request_id: request.id, status: request.status, expected_by: request.expected_by, overdue: request.status === 'overdue' }
      : null;

  let nextAction: NextAction = 'none';
  let actionBy: IsoDate | null = null;
  if (openOrder) {
    nextAction = 'await_delivery';
    actionBy = openOrder.expected_by;
  } else if (renewalBy !== null && (reorderBy === null || renewalBy <= reorderBy)) {
    nextAction = 'renew_prescription';
    actionBy = renewalBy;
  } else if (reorderBy !== null) {
    nextAction = 'reorder';
    actionBy = reorderBy;
  }

  const daysUntilAction = actionBy === null ? null : daysBetween(today, actionBy);

  let status: SupplyStatus;
  if (units_on_hand <= 0) {
    status = 'out';
  } else if (openOrder) {
    status = 'ordered';
  } else if (daysUntilAction === null) {
    status = pillRunway === null ? 'unknown' : 'ok';
  } else if (daysUntilAction < 0) {
    status = 'overdue';
  } else if (daysUntilAction === 0) {
    status = 'due';
  } else if (daysUntilAction <= DUE_SOON_DAYS) {
    status = 'due_soon';
  } else {
    status = 'ok';
  }

  return {
    medication_id: medication.id,
    today,
    units_on_hand,
    daily_units,
    pill_runway_days: pillRunway,
    pill_runout_date: pillRunout,
    prescription_status: prescriptionStatus,
    prescription_runway_days: prescriptionRunway,
    prescription_end_date: prescriptionEnd,
    lead_time_days: lead,
    safety_buffer_days: buffer,
    shortage: shortageOverride,
    reorder_by: reorderBy,
    renewal_by: renewalBy,
    open_order: openOrder,
    next_action: nextAction,
    action_by: actionBy,
    days_until_action: daysUntilAction,
    status,
  };
}

export interface ForecastAllOptions {
  shortageMedicationIds?: ReadonlySet<string>;
  today?: IsoDate;
}

/**
 * Forecasts every medication in an overview. Lead time comes from the
 * preferred supplier, else the prescription's issuer, else the default.
 */
export function forecastAll(
  items: MedicationSupply[],
  providers: ProviderRow[],
  { shortageMedicationIds, today }: ForecastAllOptions = {},
): SupplyForecast[] {
  const providerById = new Map(providers.map((p) => [p.id, p]));
  return items.map((supply) => {
    const providerId = supply.medication.preferred_provider_id ?? supply.prescription?.provider_id ?? null;
    const provider = providerId ? providerById.get(providerId) : undefined;
    return forecastSupply({
      supply,
      leadTimeDays: provider ? effectiveLeadTimeDays(provider) : DEFAULT_LEAD_TIME_DAYS,
      shortage: shortageMedicationIds?.has(supply.medication.id) ?? false,
      today,
    });
  });
}

const STATUS_RANK: Record<SupplyStatus, number> = {
  out: 0,
  overdue: 1,
  due: 2,
  due_soon: 3,
  ok: 4,
  ordered: 5,
  unknown: 6,
};

/** Most urgent first; ties by action date, then critical medications first. */
export function compareUrgency(
  a: { forecast: SupplyForecast; supply: MedicationSupply },
  b: { forecast: SupplyForecast; supply: MedicationSupply },
): number {
  const rank = STATUS_RANK[a.forecast.status] - STATUS_RANK[b.forecast.status];
  if (rank !== 0) return rank;
  const da = a.forecast.days_until_action ?? Number.POSITIVE_INFINITY;
  const dbb = b.forecast.days_until_action ?? Number.POSITIVE_INFINITY;
  if (da !== dbb) return da - dbb;
  return b.supply.medication.is_critical - a.supply.medication.is_critical;
}
