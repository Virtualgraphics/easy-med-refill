import { countStatuses, greetingForHour, summariseSupply } from '../summary';

describe('greetingForHour', () => {
  it('follows the time of day', () => {
    expect(greetingForHour(3)).toBe('Good night');
    expect(greetingForHour(8)).toBe('Good morning');
    expect(greetingForHour(14)).toBe('Good afternoon');
    expect(greetingForHour(21)).toBe('Good evening');
  });
});

describe('summariseSupply', () => {
  it('counts statuses into the dashboard groups', () => {
    expect(countStatuses(['out', 'overdue', 'due', 'due_soon', 'ordered', 'ok', 'ok', 'unknown'])).toEqual({
      actNow: 3,
      thisWeek: 1,
      ordered: 1,
      fine: 2,
      unknown: 1,
    });
  });

  it('reads naturally for the common cases', () => {
    expect(summariseSupply({ actNow: 0, thisWeek: 0, ordered: 0, fine: 0, unknown: 0 })).toBe('No medications yet.');
    expect(summariseSupply({ actNow: 0, thisWeek: 0, ordered: 0, fine: 10, unknown: 0 })).toBe('All 10 medications are well stocked.');
    expect(summariseSupply({ actNow: 0, thisWeek: 0, ordered: 0, fine: 1, unknown: 0 })).toBe('Your medication is well stocked.');
    expect(summariseSupply({ actNow: 1, thisWeek: 2, ordered: 1, fine: 6, unknown: 0 })).toBe(
      '1 medication needs action today, 2 due this week and 1 on order. The other 6 are fine.',
    );
    expect(summariseSupply({ actNow: 2, thisWeek: 0, ordered: 0, fine: 1, unknown: 0 })).toBe('2 medications need action today. The other one is fine.');
    expect(summariseSupply({ actNow: 0, thisWeek: 0, ordered: 0, fine: 0, unknown: 2 })).toBe('2 without a dose entry.');
  });

  it('never gives dosing advice', () => {
    const text = summariseSupply({ actNow: 1, thisWeek: 1, ordered: 1, fine: 1, unknown: 1 });
    expect(text.toLowerCase()).not.toMatch(/take |should|recommend/);
  });
});
