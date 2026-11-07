/**
 * Short, user-facing wording for a forecast. Kept out of components so the
 * phrasing (supply language only, never dosing advice) can be unit tested.
 * Text comes from the catalogue at call time, so a language switch takes
 * effect on the next render.
 */
import { formatDate } from '../db/format';
import { t } from '../i18n/translate';
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
  if (f.status === 'out') return t('dashboard.actionOutOfStock');
  if (f.status === 'unknown') return t('dashboard.actionNoDose');
  if (f.status === 'ordered' && f.open_order) {
    switch (f.open_order.status) {
      case 'approved':
        return t('dashboard.actionOrderWaiting');
      case 'sent':
        return f.open_order.expected_by
          ? t('dashboard.actionOrderedExpected', { date: formatDate(f.open_order.expected_by) })
          : t('dashboard.actionOrderedAwaiting');
      case 'confirmed':
        return f.open_order.expected_by
          ? t('dashboard.actionConfirmedExpected', { date: formatDate(f.open_order.expected_by) })
          : t('dashboard.actionOrderConfirmed');
      case 'overdue':
        return t('dashboard.actionOrderOverdue');
      default:
        return t('dashboard.actionOrdered');
    }
  }
  if (f.next_action === 'none' || f.action_by === null) return t('dashboard.actionSupplyOk');

  const verb = f.next_action === 'renew_prescription' ? t('dashboard.verbRenew') : f.shortage ? t('dashboard.verbShortage') : t('dashboard.verbReorder');
  if (f.status === 'overdue') return t('dashboard.actionNowOverdue', { verb });
  if (f.status === 'due') return t('dashboard.actionToday', { verb });
  return t('dashboard.actionBy', { verb, date: formatDate(f.action_by) });
}

/** One line on the pill runway. */
export function describePillRunway(f: SupplyForecast): string {
  if (f.pill_runway_days === null) return t('dashboard.pillUnknown');
  if (f.units_on_hand <= 0) return t('dashboard.pillNoStock');
  if (f.pill_runway_days === 0) return t('dashboard.pillRunsOutToday');
  return t('dashboard.pillRunway', { count: f.pill_runway_days, date: formatDate(f.pill_runout_date) });
}

/** One line on the prescription runway. */
export function describePrescriptionRunway(f: SupplyForecast): string {
  switch (f.prescription_status) {
    case 'none':
      return t('dashboard.rxNone');
    case 'exhausted':
      return t('dashboard.rxExhausted');
    case 'expired':
      return t('dashboard.rxExpired', { date: formatDate(f.prescription_end_date) });
    case 'valid':
      if (f.prescription_end_date === null) return t('dashboard.rxOpen');
      return t('dashboard.rxRunway', { count: f.prescription_runway_days ?? 0, date: formatDate(f.prescription_end_date) });
  }
}
