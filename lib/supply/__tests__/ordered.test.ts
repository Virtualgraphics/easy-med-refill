import { addDays } from '../../db/clock';
import type { MedicationSupply } from '../../db/repo/supply';
import type { MedicationRow, ReorderRequestRow } from '../../db/types';
import { planReminders } from '../../notifications/plan';
import { describeAction, forecastTone } from '../describe';
import { compareUrgency, forecastSupply } from '../forecast';

const TODAY = '2026-10-31';
const NOW = '2026-10-31T08:00:00.000Z';

const medication: MedicationRow = {
  id: 'm1',
  profile_id: 'p1',
  name: 'Demo',
  active_ingredient: null,
  strength: null,
  form: null,
  gtin: null,
  pharmacode: null,
  is_critical: 0,
  safety_buffer_days: 14,
  preferred_provider_id: null,
  notes: null,
  archived_at: null,
  created_at: NOW,
  updated_at: NOW,
};

function request(overrides: Partial<ReorderRequestRow>): ReorderRequestRow {
  return {
    id: 'r1',
    batch_id: 'r1',
    medication_id: 'm1',
    provider_id: 'prov1',
    prescription_id: null,
    status: 'sent',
    quantity_packs: 1,
    units_remaining_at_request: 10,
    needed_by: null,
    approved_at: NOW,
    sent_at: NOW,
    confirmed_at: null,
    received_at: null,
    overdue_at: null,
    cancelled_at: null,
    follow_up_count: 0,
    server_reference: 'X',
    note: null,
    language: 'de',
    message_subject: null,
    message_body: null,
    expected_by: addDays(TODAY, 5),
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function supply(overrides: Partial<MedicationSupply>): MedicationSupply {
  return {
    medication,
    units_on_hand: 10,
    pack_count: 1,
    next_expiry: null,
    last_pack_size: 30,
    schedule: null,
    daily_units: 1,
    prescription: null,
    open_request: null,
    ...overrides,
  };
}

const run = (s: MedicationSupply) => forecastSupply({ supply: s, leadTimeDays: 5, today: TODAY });

describe('open reorder', () => {
  it('turns an urgent medication into "ordered" with the expected date', () => {
    const f = run(supply({ open_request: request({}) }));
    expect(f.status).toBe('ordered');
    expect(f.next_action).toBe('await_delivery');
    expect(f.action_by).toBe(addDays(TODAY, 5));
    expect(f.open_order).toEqual({ request_id: 'r1', batch_id: 'r1', status: 'sent', expected_by: addDays(TODAY, 5), overdue: false });
    expect(describeAction(f)).toBe(`Ordered · expected ${addDays(TODAY, 5).split('-').reverse().join('.')}`);
    expect(forecastTone(f)).toBe('ok');
  });

  it('still reports out of stock while an order is open', () => {
    const f = run(supply({ units_on_hand: 0, open_request: request({}) }));
    expect(f.status).toBe('out');
    expect(f.open_order?.status).toBe('sent');
  });

  it('shows an overdue order in amber and asks for a follow-up', () => {
    const f = run(supply({ open_request: request({ status: 'overdue' }) }));
    expect(f.status).toBe('ordered');
    expect(forecastTone(f)).toBe('warn');
    expect(describeAction(f)).toBe('Order overdue · follow up');
  });

  it('ignores received and cancelled requests', () => {
    for (const status of ['received', 'cancelled'] as const) {
      const f = run(supply({ open_request: request({ status }) }));
      expect(f.status).toBe('overdue');
      expect(f.open_order).toBeNull();
    }
  });

  it('does not schedule a reminder for an order on its way', () => {
    const f = run(supply({ open_request: request({}) }));
    expect(planReminders([f], TODAY)).toEqual([]);
  });

  it('sorts ordered medications after those still needing action', () => {
    const ordered = { supply: supply({ open_request: request({}) }), forecast: run(supply({ open_request: request({}) })) };
    const fine = { supply: supply({ units_on_hand: 200 }), forecast: run(supply({ units_on_hand: 200 })) };
    const due = { supply: supply({}), forecast: run(supply({})) };
    const order = [ordered, fine, due].sort(compareUrgency).map((x) => x.forecast.status);
    expect(order).toEqual(['overdue', 'ok', 'ordered']);
  });
});
