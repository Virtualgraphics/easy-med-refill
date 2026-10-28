/**
 * Anonymised demo data: a typical post-transplant medication list.
 * No real patient identifiers. Product codes are fabricated.
 * Safe to call repeatedly; it only seeds an empty profile.
 */
import type { DbClient } from './client';
import { addDays, todayIso } from './clock';
import {
  addPack,
  createMedication,
  createPrescription,
  createProvider,
  ensureDefaultProfile,
  listMedications,
  setDoseSchedule,
  updateProfile,
} from './repo';
import type { DosePeriod } from './types';

interface DemoMedication {
  name: string;
  active_ingredient: string;
  strength: string;
  form: string;
  gtin: string;
  is_critical?: boolean;
  dose: { units: number; times: number; period?: DosePeriod };
  packs: { size: number; remaining: number; expiryInDays: number }[];
  rx: { type: 'single' | 'standing'; issuedDaysAgo: number; validForDays: number | null; refills?: number | null; via: 'practice' | 'pharmacy' };
}

const DEMO: DemoMedication[] = [
  {
    name: 'Tacrolimus 1 mg',
    active_ingredient: 'Tacrolimus',
    strength: '1 mg',
    form: 'capsule',
    gtin: '7680000000014',
    is_critical: true,
    dose: { units: 3, times: 2 },
    // 46 days of supply against a 40-day margin: reorder due within the week.
    packs: [
      { size: 100, remaining: 76, expiryInDays: 300 },
      { size: 100, remaining: 100, expiryInDays: 400 },
      { size: 100, remaining: 100, expiryInDays: 420 },
    ],
    rx: { type: 'standing', issuedDaysAgo: 120, validForDays: 365, via: 'practice' },
  },
  {
    name: 'Mycophenolate mofetil 500 mg',
    active_ingredient: 'Mycophenolate mofetil',
    strength: '500 mg',
    form: 'tablet',
    gtin: '7680000000021',
    is_critical: true,
    dose: { units: 2, times: 2 },
    // 75 days of pills but the prescription ends in 45: renewal is the next action.
    packs: [
      { size: 150, remaining: 150, expiryInDays: 500 },
      { size: 150, remaining: 150, expiryInDays: 520 },
    ],
    rx: { type: 'standing', issuedDaysAgo: 135, validForDays: 180, via: 'practice' },
  },
  {
    name: 'Prednisone 5 mg',
    active_ingredient: 'Prednisone',
    strength: '5 mg',
    form: 'tablet',
    gtin: '7680000000038',
    dose: { units: 1, times: 1 },
    packs: [{ size: 100, remaining: 41, expiryInDays: 600 }],
    rx: { type: 'standing', issuedDaysAgo: 90, validForDays: 365, via: 'practice' },
  },
  {
    name: 'Valganciclovir 450 mg',
    active_ingredient: 'Valganciclovir',
    strength: '450 mg',
    form: 'tablet',
    gtin: '7680000000045',
    dose: { units: 1, times: 1 },
    // Running low: reorder is overdue.
    packs: [{ size: 60, remaining: 9, expiryInDays: 300 }],
    rx: { type: 'single', issuedDaysAgo: 50, validForDays: 90, refills: 1, via: 'pharmacy' },
  },
  {
    name: 'Amlodipine 5 mg',
    active_ingredient: 'Amlodipine',
    strength: '5 mg',
    form: 'tablet',
    gtin: '7680000000052',
    dose: { units: 1, times: 1 },
    packs: [{ size: 100, remaining: 73, expiryInDays: 700 }],
    rx: { type: 'standing', issuedDaysAgo: 30, validForDays: 365, via: 'practice' },
  },
  {
    name: 'Atorvastatin 20 mg',
    active_ingredient: 'Atorvastatin',
    strength: '20 mg',
    form: 'tablet',
    gtin: '7680000000069',
    dose: { units: 1, times: 1 },
    packs: [{ size: 100, remaining: 36, expiryInDays: 650 }],
    rx: { type: 'standing', issuedDaysAgo: 200, validForDays: 365, via: 'pharmacy' },
  },
  {
    name: 'Pantoprazole 40 mg',
    active_ingredient: 'Pantoprazole',
    strength: '40 mg',
    form: 'tablet',
    gtin: '7680000000076',
    dose: { units: 1, times: 1 },
    packs: [{ size: 100, remaining: 62, expiryInDays: 550 }],
    rx: { type: 'standing', issuedDaysAgo: 100, validForDays: 365, via: 'pharmacy' },
  },
  {
    name: 'Magnesium 10 mmol',
    active_ingredient: 'Magnesium',
    strength: '10 mmol',
    form: 'sachet',
    gtin: '7680000000083',
    dose: { units: 1, times: 2 },
    packs: [
      { size: 60, remaining: 37, expiryInDays: 450 },
      { size: 60, remaining: 60, expiryInDays: 480 },
    ],
    rx: { type: 'standing', issuedDaysAgo: 60, validForDays: 365, via: 'pharmacy' },
  },
  {
    name: 'Cotrimoxazole 400/80 mg',
    active_ingredient: 'Sulfamethoxazole / Trimethoprim',
    strength: '400/80 mg',
    form: 'tablet',
    gtin: '7680000000090',
    dose: { units: 1, times: 3, period: 'week' },
    // Three a week: 11 tablets is about 25 days, reorder due within the week.
    packs: [{ size: 30, remaining: 11, expiryInDays: 380 }],
    rx: { type: 'single', issuedDaysAgo: 40, validForDays: 90, refills: 0, via: 'practice' },
  },
  {
    name: 'Calcium / Vitamin D3',
    active_ingredient: 'Calcium carbonate / Cholecalciferol',
    strength: '500 mg / 800 IU',
    form: 'chewable tablet',
    gtin: '7680000000106',
    dose: { units: 1, times: 1 },
    packs: [{ size: 60, remaining: 52, expiryInDays: 500 }],
    rx: { type: 'standing', issuedDaysAgo: 20, validForDays: 365, via: 'pharmacy' },
  },
];

export interface SeedResult {
  profileId: string;
  seeded: boolean;
}

export async function seedDemoData(db: DbClient): Promise<SeedResult> {
  const profile = await ensureDefaultProfile(db);
  const existing = await listMedications(db, profile.id, { includeArchived: true });
  if (existing.length > 0) {
    return { profileId: profile.id, seeded: false };
  }

  const today = todayIso();

  await updateProfile(db, profile.id, { display_name: 'Demo patient', patient_reference: 'DP-1968' });

  const practice = await createProvider(db, {
    profile_id: profile.id,
    kind: 'practice',
    name: 'Hausarztpraxis Demo',
    email: 'praxis@example.invalid',
    phone: '+41 00 000 00 00',
    default_lead_time_days: 5,
  });
  const pharmacy = await createProvider(db, {
    profile_id: profile.id,
    kind: 'pharmacy',
    name: 'Apotheke Demo',
    email: 'apotheke@example.invalid',
    phone: '+41 00 000 00 01',
    default_lead_time_days: 2,
  });

  for (const item of DEMO) {
    const medication = await createMedication(db, {
      profile_id: profile.id,
      name: item.name,
      active_ingredient: item.active_ingredient,
      strength: item.strength,
      form: item.form,
      gtin: item.gtin,
      is_critical: item.is_critical ?? false,
      preferred_provider_id: item.rx.via === 'practice' ? practice.id : pharmacy.id,
    });

    await setDoseSchedule(db, medication.id, {
      units_per_intake: item.dose.units,
      intakes_per_period: item.dose.times,
      period: item.dose.period ?? 'day',
      valid_from: addDays(today, -item.rx.issuedDaysAgo),
    });

    for (const [index, pack] of item.packs.entries()) {
      await addPack(db, {
        medication_id: medication.id,
        units_per_pack: pack.size,
        units_remaining: pack.remaining,
        gtin: item.gtin,
        expiry_date: addDays(today, pack.expiryInDays),
        opened_at: pack.remaining < pack.size ? addDays(today, -7 * (index + 1)) : null,
      });
    }

    const issued = addDays(today, -item.rx.issuedDaysAgo);
    await createPrescription(db, {
      medication_id: medication.id,
      provider_id: item.rx.via === 'practice' ? practice.id : pharmacy.id,
      type: item.rx.type,
      issued_at: issued,
      valid_until: item.rx.validForDays === null ? null : addDays(issued, item.rx.validForDays),
      refills_allowed: item.rx.refills ?? null,
    });
  }

  return { profileId: profile.id, seeded: true };
}
