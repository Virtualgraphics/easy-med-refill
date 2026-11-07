/**
 * Wording for the dashboard greeting. Pure, so the sentence can be tested.
 * Text is read from the catalogue at call time.
 */
import { t } from '../i18n/translate';
import type { SupplyStatus } from './forecast';

export function greetingForHour(hour: number): string {
  if (hour < 5) return t('dashboard.greetingNight');
  if (hour < 12) return t('dashboard.greetingMorning');
  if (hour < 18) return t('dashboard.greetingAfternoon');
  return t('dashboard.greetingEvening');
}

export interface StatusCounts {
  actNow: number;
  thisWeek: number;
  ordered: number;
  fine: number;
  unknown: number;
}

export function countStatuses(statuses: SupplyStatus[]): StatusCounts {
  const counts: StatusCounts = { actNow: 0, thisWeek: 0, ordered: 0, fine: 0, unknown: 0 };
  for (const status of statuses) {
    if (status === 'out' || status === 'overdue' || status === 'due') counts.actNow++;
    else if (status === 'due_soon') counts.thisWeek++;
    else if (status === 'ordered') counts.ordered++;
    else if (status === 'ok') counts.fine++;
    else counts.unknown++;
  }
  return counts;
}

/** One sentence on where the supply stands. */
export function summariseSupply(counts: StatusCounts): string {
  const total = counts.actNow + counts.thisWeek + counts.ordered + counts.fine + counts.unknown;
  if (total === 0) return t('dashboard.summaryNone');

  const parts: string[] = [];
  if (counts.actNow > 0) parts.push(t('dashboard.summaryNeedAction', { count: counts.actNow }));
  if (counts.thisWeek > 0) parts.push(t('dashboard.summaryDueThisWeek', { count: counts.thisWeek }));
  if (counts.ordered > 0) parts.push(t('dashboard.summaryOnOrder', { count: counts.ordered }));
  if (counts.unknown > 0) parts.push(t('dashboard.summaryWithoutDose', { count: counts.unknown }));

  if (parts.length === 0) {
    return t('dashboard.summaryAllStocked', { count: total });
  }
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}${t('dashboard.summaryAnd')}${parts[parts.length - 1]}`;
  const rest = counts.fine > 0 ? t('dashboard.summaryRestFine', { count: counts.fine }) : '';
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${rest}`;
}
