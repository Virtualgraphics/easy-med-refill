/**
 * Wording for the dashboard greeting. Pure, so the sentence can be tested.
 */
import type { SupplyStatus } from './forecast';

export function greetingForHour(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

const meds = (n: number) => (n === 1 ? '1 medication' : `${n} medications`);

/** One sentence on where the supply stands. */
export function summariseSupply(counts: StatusCounts): string {
  const total = counts.actNow + counts.thisWeek + counts.ordered + counts.fine + counts.unknown;
  if (total === 0) return 'No medications yet.';

  const parts: string[] = [];
  if (counts.actNow > 0) parts.push(`${meds(counts.actNow)} ${counts.actNow === 1 ? 'needs' : 'need'} action today`);
  if (counts.thisWeek > 0) parts.push(`${counts.thisWeek} due this week`);
  if (counts.ordered > 0) parts.push(`${counts.ordered} on order`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} without a dose entry`);

  if (parts.length === 0) {
    return total === 1 ? 'Your medication is well stocked.' : `All ${total} medications are well stocked.`;
  }
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const rest = counts.fine > 0 ? ` The other ${counts.fine === 1 ? 'one is' : `${counts.fine} are`} fine.` : '';
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${rest}`;
}
