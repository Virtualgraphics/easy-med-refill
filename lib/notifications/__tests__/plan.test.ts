import { addDays } from '../../db/clock';
import type { SupplyForecast } from '../../supply/forecast';
import { planReminders, reminderBody } from '../plan';

const TODAY = '2026-10-27';

function forecast(overrides: Partial<SupplyForecast>): SupplyForecast {
  return {
    medication_id: 'm',
    today: TODAY,
    units_on_hand: 10,
    daily_units: 1,
    pill_runway_days: 10,
    pill_runout_date: addDays(TODAY, 10),
    prescription_status: 'valid',
    prescription_runway_days: 100,
    prescription_end_date: addDays(TODAY, 100),
    lead_time_days: 5,
    safety_buffer_days: 14,
    shortage: false,
    reorder_by: null,
    renewal_by: null,
    next_action: 'none',
    action_by: null,
    days_until_action: null,
    status: 'ok',
    ...overrides,
  };
}

const dueIn = (days: number, id = `m${days}`) =>
  forecast({ medication_id: id, action_by: addDays(TODAY, days), days_until_action: days, next_action: 'reorder', status: days <= 7 ? 'due_soon' : 'ok' });

describe('planReminders', () => {
  it('schedules one reminder per action date and counts items on that day', () => {
    const plan = planReminders([dueIn(3, 'a'), dueIn(3, 'b'), dueIn(20, 'c')], TODAY);
    expect(plan).toEqual([
      { date: addDays(TODAY, 3), due: 2, outstanding: 0 },
      { date: addDays(TODAY, 20), due: 1, outstanding: 0 },
    ]);
  });

  it('skips items without a date, due today or past, and beyond the horizon', () => {
    const plan = planReminders(
      [
        forecast({ action_by: null }),
        forecast({ action_by: TODAY, days_until_action: 0, status: 'due' }),
        forecast({ action_by: addDays(TODAY, -2), days_until_action: -2, status: 'overdue' }),
        dueIn(61),
        dueIn(60),
      ],
      TODAY,
    );
    // The two outstanding items become a reminder tomorrow; day 60 is kept, day 61 is dropped.
    expect(plan).toEqual([
      { date: addDays(TODAY, 1), due: 0, outstanding: 2 },
      { date: addDays(TODAY, 60), due: 1, outstanding: 0 },
    ]);
  });

  it('merges an outstanding reminder with items due tomorrow', () => {
    const plan = planReminders([dueIn(1), forecast({ status: 'out', units_on_hand: 0 })], TODAY);
    expect(plan).toEqual([{ date: addDays(TODAY, 1), due: 1, outstanding: 1 }]);
  });

  it('returns nothing when all is well', () => {
    expect(planReminders([forecast({})], TODAY)).toEqual([]);
  });
});

describe('reminderBody', () => {
  it('never names a medication and reads naturally', () => {
    expect(reminderBody({ date: TODAY, due: 1, outstanding: 0 })).toBe(
      '1 medication needs a reorder or prescription renewal today. Open the app for details.',
    );
    expect(reminderBody({ date: TODAY, due: 2, outstanding: 3 })).toBe(
      '2 medications need a reorder or prescription renewal today. 3 medications still need attention. Open the app for details.',
    );
    expect(reminderBody({ date: TODAY, due: 0, outstanding: 1 })).toBe('1 medication still needs attention. Open the app for details.');
  });
});
