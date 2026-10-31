/**
 * Short, user-facing wording for a forecast. Kept out of components so the
 * phrasing (supply language only, never dosing advice) can be unit tested.
 */
import { formatDate } from '../db/format';
import type { SupplyForecast, SupplyStatus } from './forecast';

export type Tone = 'ok' | 'warn' | 'critical' | 'neutral';

export const STATUS_TONE: Record<SupplyStatus, Tone> = {
  ok: 'ok',
  ordered: 'ok',
  due_soon: 'warn',
  due: 'critical',
  overdue: 'critical',
  out: 'critical',
  unknown: 'neutral',
};

/** Colour for a forecast; an overdue order turns "ordered" amber. */
export function forecastTone(f: SupplyForecast): Tone {
  if (f.status === 'ordered' && f.open_order?.overdue) return 'warn';
  return STATUS_TONE[f.status];
}

/** Badge text: what to do and by when. */
export function describeAction(f: SupplyForecast): string {
  if (f.status === 'out') return 'Out of stock';
  if (f.status === 'unknown') return 'No dose entered';
  if (f.status === 'ordered' && f.open_order) {
    switch (f.open_order.status) {
      case 'approved':
        return 'Order waiting to send';
      case 'sent':
        return f.open_order.expected_by ? `Ordered · expected ${formatDate(f.open_order.expected_by)}` : 'Ordered · awaiting reply';
      case 'confirmed':
        return f.open_order.expected_by ? `Confirmed · expected ${formatDate(f.open_order.expected_by)}` : 'Order confirmed';
      case 'overdue':
        return 'Order overdue · follow up';
      default:
        return 'Ordered';
    }
  }
  if (f.next_action === 'none' || f.action_by === null) return 'Supply ok';

  const verb = f.next_action === 'renew_prescription' ? 'Renew Rx' : f.shortage ? 'Shortage: reorder' : 'Reorder';
  if (f.status === 'overdue') return `${verb} now (overdue)`;
  if (f.status === 'due') return `${verb} today`;
  return `${verb} by ${formatDate(f.action_by)}`;
}

/** One line on the pill runway. */
export function describePillRunway(f: SupplyForecast): string {
  if (f.pill_runway_days === null) return 'Consumption unknown';
  if (f.units_on_hand <= 0) return 'No stock on hand';
  if (f.pill_runway_days === 0) return 'Runs out today';
  return `${f.pill_runway_days} ${f.pill_runway_days === 1 ? 'day' : 'days'} · runs out ${formatDate(f.pill_runout_date)}`;
}

/** One line on the prescription runway. */
export function describePrescriptionRunway(f: SupplyForecast): string {
  switch (f.prescription_status) {
    case 'none':
      return 'No prescription recorded';
    case 'exhausted':
      return 'No refills left';
    case 'expired':
      return `Expired ${formatDate(f.prescription_end_date)}`;
    case 'valid':
      if (f.prescription_end_date === null) return 'Valid, no expiry';
      return `${f.prescription_runway_days} ${f.prescription_runway_days === 1 ? 'day' : 'days'} · valid until ${formatDate(f.prescription_end_date)}`;
  }
}
