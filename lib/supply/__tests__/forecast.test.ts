import { addDays } from '../../db/clock';
import type { MedicationSupply } from '../../db/repo/supply';
import type { MedicationRow, PrescriptionRow, ProviderRow } from '../../db/types';
import { describeAction, describePillRunway, describePrescriptionRunway } from '../describe';
import { compareUrgency, DUE_SOON_DAYS, forecastAll, forecastSupply } from '../forecast';

const TODAY = '2026-10-27';
const NOW = '2026-10-27T08:00:00.000Z';

function medication(overrides: Partial<MedicationRow> = {}): MedicationRow {
  return {
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
    ...overrides,
  };
}

function prescription(overrides: Partial<PrescriptionRow> = {}): PrescriptionRow {
  return {
    id: 'rx1',
    medication_id: 'm1',
    provider_id: null,
    type: 'standing',
    issued_at: '2026-01-01',
    valid_until: '2027-01-01',
    refills_allowed: null,
    refills_used: 0,
    reference: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function supply(overrides: Partial<MedicationSupply> = {}): MedicationSupply {
  return {
    medication: medication(),
    units_on_hand: 100,
    pack_count: 1,
    next_expiry: null,
    last_pack_size: 50,
    schedule: null,
    daily_units: 2,
    prescription: prescription(),
    open_request: null,
    ...overrides,
  };
}

const run = (s: MedicationSupply, lead = 5, shortage = false) => forecastSupply({ supply: s, leadTimeDays: lead, shortage, today: TODAY });

describe('pill runway and reorder date', () => {
  it('reorder_by = run-out minus lead time minus buffer', () => {
    const f = run(supply({ units_on_hand: 100, daily_units: 2 }));
    expect(f.pill_runway_days).toBe(50);
    expect(f.pill_runout_date).toBe(addDays(TODAY, 50));
    expect(f.reorder_by).toBe(addDays(TODAY, 50 - 5 - 14));
    expect(f.next_action).toBe('reorder');
    expect(f.days_until_action).toBe(31);
    expect(f.status).toBe('ok');
  });

  it('uses the larger buffer of a critical medication', () => {
    const f = run(supply({ medication: medication({ is_critical: 1, safety_buffer_days: 35 }) }));
    expect(f.reorder_by).toBe(addDays(TODAY, 50 - 5 - 35));
  });

  it('is unknown without a dose schedule', () => {
    const f = run(supply({ daily_units: null, prescription: prescription({ valid_until: null }) }));
    expect(f.pill_runway_days).toBeNull();
    expect(f.reorder_by).toBeNull();
    expect(f.next_action).toBe('none');
    expect(f.status).toBe('unknown');
  });

  it('is out when nothing is on hand', () => {
    const f = run(supply({ units_on_hand: 0 }));
    expect(f.status).toBe('out');
    expect(f.pill_runway_days).toBe(0);
  });

  it('is due soon, due and overdue around the action date', () => {
    const lead = 5;
    const buffer = 14;
    // runway = margin + DUE_SOON_DAYS -> action in DUE_SOON_DAYS days
    const dueSoon = run(supply({ units_on_hand: (lead + buffer + DUE_SOON_DAYS) * 2, daily_units: 2 }), lead);
    expect(dueSoon.days_until_action).toBe(DUE_SOON_DAYS);
    expect(dueSoon.status).toBe('due_soon');

    const due = run(supply({ units_on_hand: (lead + buffer) * 2, daily_units: 2 }), lead);
    expect(due.days_until_action).toBe(0);
    expect(due.status).toBe('due');

    const overdue = run(supply({ units_on_hand: (lead + buffer - 3) * 2, daily_units: 2 }), lead);
    expect(overdue.days_until_action).toBe(-3);
    expect(overdue.status).toBe('overdue');
  });

  it('handles weekly schedules through fractional daily units', () => {
    const f = run(supply({ units_on_hand: 10, daily_units: 3 / 7 }));
    expect(f.pill_runway_days).toBe(23);
  });
});

describe('prescription runway', () => {
  it('ignores a prescription that outlasts the pills', () => {
    const f = run(supply({ prescription: prescription({ valid_until: addDays(TODAY, 365) }) }));
    expect(f.prescription_status).toBe('valid');
    expect(f.prescription_runway_days).toBe(365);
    expect(f.renewal_by).toBeNull();
    expect(f.next_action).toBe('reorder');
  });

  it('asks for renewal first when the prescription ends before the pills', () => {
    // pills last 50 days, prescription 20 days
    const f = run(supply({ prescription: prescription({ valid_until: addDays(TODAY, 20) }) }));
    expect(f.prescription_runway_days).toBe(20);
    expect(f.renewal_by).toBe(addDays(TODAY, 20 - 5 - 14));
    expect(f.next_action).toBe('renew_prescription');
    expect(f.action_by).toBe(f.renewal_by);
    expect(f.days_until_action).toBe(1);
    expect(f.status).toBe('due_soon');
  });

  it('treats an expired prescription as a renewal due today', () => {
    const f = run(supply({ prescription: prescription({ valid_until: addDays(TODAY, -1) }) }));
    expect(f.prescription_status).toBe('expired');
    expect(f.prescription_runway_days).toBe(0);
    expect(f.renewal_by).toBe(TODAY);
    expect(f.next_action).toBe('renew_prescription');
    expect(f.status).toBe('due');
  });

  it('treats exhausted refills as a renewal due today', () => {
    const f = run(supply({ prescription: prescription({ type: 'single', refills_allowed: 1, refills_used: 1 }) }));
    expect(f.prescription_status).toBe('exhausted');
    expect(f.next_action).toBe('renew_prescription');
    expect(f.renewal_by).toBe(TODAY);
  });

  it('flags prescription expiry even when consumption is unknown', () => {
    const f = run(supply({ daily_units: null, prescription: prescription({ valid_until: addDays(TODAY, 30) }) }));
    expect(f.pill_runway_days).toBeNull();
    expect(f.renewal_by).toBe(addDays(TODAY, 30 - 5 - 14));
    expect(f.next_action).toBe('renew_prescription');
    expect(f.status).toBe('ok');
  });

  it('reports no prescription without inventing a renewal date', () => {
    const f = run(supply({ prescription: null }));
    expect(f.prescription_status).toBe('none');
    expect(f.renewal_by).toBeNull();
    expect(f.next_action).toBe('reorder');
  });
});

describe('shortage override', () => {
  it('pulls the reorder date to today for a critical medication', () => {
    const f = run(supply({ medication: medication({ is_critical: 1, safety_buffer_days: 35 }) }), 5, true);
    expect(f.shortage).toBe(true);
    expect(f.reorder_by).toBe(TODAY);
    expect(f.status).toBe('due');
    expect(describeAction(f)).toBe('Shortage: reorder today');
  });

  it('does not change a non-critical medication', () => {
    const f = run(supply(), 5, true);
    expect(f.shortage).toBe(false);
    expect(f.reorder_by).toBe(addDays(TODAY, 31));
  });

  it('never moves an already overdue reorder later', () => {
    const f = run(supply({ medication: medication({ is_critical: 1, safety_buffer_days: 35 }), units_on_hand: 10 }), 5, true);
    expect(f.reorder_by !== null && f.reorder_by < TODAY).toBe(true);
    expect(f.status).toBe('overdue');
  });
});

describe('forecastAll and ordering', () => {
  const practice: ProviderRow = {
    id: 'prov1',
    profile_id: 'p1',
    kind: 'practice',
    name: 'P',
    email: null,
    phone: null,
    address: null,
    default_lead_time_days: 10,
    learned_lead_time_days: 3,
    server_provider_id: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it('takes lead time from the preferred supplier, learned value first', () => {
    const [f] = forecastAll([supply({ medication: medication({ preferred_provider_id: 'prov1' }) })], [practice], { today: TODAY });
    expect(f.lead_time_days).toBe(3);
  });

  it('falls back to the prescription issuer, then the default', () => {
    const [viaRx, viaDefault] = forecastAll(
      [
        supply({ prescription: prescription({ provider_id: 'prov1' }) }),
        supply({ medication: medication({ id: 'm2' }), prescription: null }),
      ],
      [practice],
      { today: TODAY },
    );
    expect(viaRx.lead_time_days).toBe(3);
    expect(viaDefault.lead_time_days).toBe(7);
  });

  it('sorts most urgent first with critical as tiebreak', () => {
    const items = [
      supply({ medication: medication({ id: 'ok' }), units_on_hand: 200 }),
      supply({ medication: medication({ id: 'out' }), units_on_hand: 0 }),
      supply({ medication: medication({ id: 'dueSoonPlain' }), units_on_hand: (5 + 14 + 3) * 2 }),
      supply({ medication: medication({ id: 'dueSoonCritical', is_critical: 1 }), units_on_hand: (5 + 14 + 3) * 2 }),
      supply({ medication: medication({ id: 'unknown' }), daily_units: null, prescription: null }),
    ];
    const forecasts = forecastAll(items, [], { today: TODAY }).map((f) => ({ forecast: f, supply: items.find((s) => s.medication.id === f.medication_id)! }));
    const order = [...forecasts].sort(compareUrgency).map((x) => x.forecast.medication_id);
    expect(order).toEqual(['out', 'dueSoonCritical', 'dueSoonPlain', 'ok', 'unknown']);
  });
});

describe('wording', () => {
  it('uses supply language only', () => {
    const f = run(supply());
    expect(describeAction(f)).toBe(`Reorder by ${addDays(TODAY, 31).split('-').reverse().join('.')}`);
    expect(describePillRunway(f)).toMatch(/^50 days · runs out /);
    expect(describePrescriptionRunway(f)).toMatch(/valid until 01\.01\.2027$/);
    for (const text of [describeAction(f), describePillRunway(f), describePrescriptionRunway(f)]) {
      expect(text.toLowerCase()).not.toMatch(/take|dose|should/);
    }
  });

  it('describes the edge states', () => {
    expect(describeAction(run(supply({ units_on_hand: 0 })))).toBe('Out of stock');
    expect(describeAction(run(supply({ daily_units: null, prescription: null })))).toBe('No dose entered');
    expect(describeAction(run(supply({ prescription: prescription({ valid_until: addDays(TODAY, -1) }) })))).toBe('Renew Rx today');
    expect(describePrescriptionRunway(run(supply({ prescription: null })))).toBe('No prescription recorded');
    expect(describePrescriptionRunway(run(supply({ prescription: prescription({ valid_until: null }) })))).toBe('Valid, no expiry');
  });
});
