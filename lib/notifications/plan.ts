/**
 * Decides which local reminders to schedule from the current forecasts.
 * Pure, so the schedule can be unit tested.
 *
 * Privacy: reminder text never contains medication names. It only says
 * how many items need attention; details are inside the app.
 */
import { addDays } from '../db/clock';
import type { IsoDate } from '../db/types';
import { t } from '../i18n/translate';
import type { SupplyForecast } from '../supply/forecast';

export interface PlannedReminder {
  /** Calendar day the reminder fires on. */
  date: IsoDate;
  /** Items whose action date is this day. */
  due: number;
  /** Items already overdue, due or out when the plan was made. */
  outstanding: number;
}

/** How far ahead reminders are scheduled. The plan is rebuilt on every app open. */
export const REMINDER_HORIZON_DAYS = 60;

const OUTSTANDING_STATUSES = new Set<SupplyForecast['status']>(['out', 'overdue', 'due']);

export function planReminders(
  forecasts: SupplyForecast[],
  today: IsoDate,
  horizonDays: number = REMINDER_HORIZON_DAYS,
): PlannedReminder[] {
  const byDate = new Map<IsoDate, PlannedReminder>();
  const entry = (date: IsoDate) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created = { date, due: 0, outstanding: 0 };
    byDate.set(date, created);
    return created;
  };

  for (const f of forecasts) {
    if (f.next_action === 'await_delivery') continue;
    if (f.action_by === null || f.days_until_action === null) continue;
    if (f.days_until_action < 1 || f.days_until_action > horizonDays) continue;
    entry(f.action_by).due += 1;
  }

  const outstanding = forecasts.filter((f) => OUTSTANDING_STATUSES.has(f.status)).length;
  if (outstanding > 0) {
    entry(addDays(today, 1)).outstanding = outstanding;
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const REMINDER_TITLE = 'Easy MedRefill';

export function reminderBody(reminder: PlannedReminder): string {
  const parts: string[] = [];
  if (reminder.due > 0) parts.push(t('dashboard.reminderDue', { count: reminder.due }));
  if (reminder.outstanding > 0) parts.push(t('dashboard.reminderOutstanding', { count: reminder.outstanding }));
  return `${parts.join('. ')}. ${t('dashboard.reminderOpenApp')}`;
}
