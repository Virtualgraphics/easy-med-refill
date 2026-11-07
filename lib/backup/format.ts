/**
 * What goes into an export and how it comes back. One profile per file:
 * the person, their suppliers, medications with dose history, packs,
 * prescriptions and orders. Shortage matches are left out; they are
 * recomputed from the shortage list on the importing phone.
 *
 * Importing always creates a new profile with fresh ids, so a file can
 * be imported more than once and never collides with existing rows.
 */
import type { DbClient } from '../db/client';
import { nowIso } from '../db/clock';
import { newId } from '../db/ids';
import { insertRow } from '../db/repo/_helpers';
import { createProfile, getProfile } from '../db/repo/profiles';
import type { DoseScheduleRow, MedicationRow, PackRow, PrescriptionRow, ProfileRow, ProviderRow, ReorderRequestRow } from '../db/types';

export interface ProfileExport {
  version: 1;
  exported_at: string;
  profile: Pick<ProfileRow, 'display_name' | 'patient_reference'>;
  providers: ProviderRow[];
  medications: MedicationRow[];
  dose_schedules: DoseScheduleRow[];
  packs: PackRow[];
  prescriptions: PrescriptionRow[];
  reorder_requests: ReorderRequestRow[];
}

export async function collectProfileExport(db: DbClient, profileId: string): Promise<ProfileExport> {
  const profile = await getProfile(db, profileId);
  if (!profile) throw new Error('Profile not found.');
  const byProfile = 'WHERE profile_id = ?';
  const viaMedication = 'WHERE medication_id IN (SELECT id FROM medications WHERE profile_id = ?)';
  const [providers, medications, dose_schedules, packs, prescriptions, reorder_requests] = await Promise.all([
    db.getAllAsync<ProviderRow>(`SELECT * FROM providers ${byProfile} ORDER BY created_at`, [profileId]),
    db.getAllAsync<MedicationRow>(`SELECT * FROM medications ${byProfile} ORDER BY created_at`, [profileId]),
    db.getAllAsync<DoseScheduleRow>(`SELECT * FROM dose_schedules ${viaMedication} ORDER BY created_at`, [profileId]),
    db.getAllAsync<PackRow>(`SELECT * FROM packs ${viaMedication} ORDER BY created_at`, [profileId]),
    db.getAllAsync<PrescriptionRow>(`SELECT * FROM prescriptions ${viaMedication} ORDER BY created_at`, [profileId]),
    db.getAllAsync<ReorderRequestRow>(`SELECT * FROM reorder_requests ${viaMedication} ORDER BY created_at`, [profileId]),
  ]);
  return {
    version: 1,
    exported_at: nowIso(),
    profile: { display_name: profile.display_name, patient_reference: profile.patient_reference },
    providers,
    medications,
    dose_schedules,
    packs,
    prescriptions,
    reorder_requests,
  };
}

export function parseProfileExport(json: string): ProfileExport {
  const data = JSON.parse(json) as Partial<ProfileExport>;
  if (data.version !== 1 || !data.profile || !Array.isArray(data.medications)) {
    throw new Error('The export file has an unknown layout.');
  }
  return {
    version: 1,
    exported_at: data.exported_at ?? '',
    profile: data.profile,
    providers: data.providers ?? [],
    medications: data.medications,
    dose_schedules: data.dose_schedules ?? [],
    packs: data.packs ?? [],
    prescriptions: data.prescriptions ?? [],
    reorder_requests: data.reorder_requests ?? [],
  };
}

export interface RestoreOptions {
  /** Name for the new list; defaults to the exported name. */
  displayName?: string;
}

/** Creates a new profile from an export; every id is remapped. */
export async function restoreProfileExport(db: DbClient, data: ProfileExport, options: RestoreOptions = {}): Promise<ProfileRow> {
  const ids = new Map<string, string>();
  const map = (old: string): string => {
    let fresh = ids.get(old);
    if (!fresh) {
      fresh = newId();
      ids.set(old, fresh);
    }
    return fresh;
  };
  const mapNullable = (old: string | null | undefined): string | null => (old ? map(old) : null);

  let profile: ProfileRow | null = null;
  await db.withTransactionAsync(async () => {
    profile = await createProfile(db, {
      display_name: options.displayName ?? data.profile.display_name,
      patient_reference: data.profile.patient_reference,
    });
    const profileId = profile.id;
    for (const row of data.providers) {
      await insertRow(db, 'providers', { ...row, id: map(row.id), profile_id: profileId });
    }
    for (const row of data.medications) {
      await insertRow(db, 'medications', { ...row, id: map(row.id), profile_id: profileId, preferred_provider_id: mapNullable(row.preferred_provider_id) });
    }
    for (const row of data.dose_schedules) {
      await insertRow(db, 'dose_schedules', { ...row, id: map(row.id), medication_id: map(row.medication_id) });
    }
    for (const row of data.packs) {
      await insertRow(db, 'packs', { ...row, id: map(row.id), medication_id: map(row.medication_id) });
    }
    for (const row of data.prescriptions) {
      await insertRow(db, 'prescriptions', { ...row, id: map(row.id), medication_id: map(row.medication_id), provider_id: mapNullable(row.provider_id) });
    }
    for (const row of data.reorder_requests) {
      await insertRow(db, 'reorder_requests', {
        ...row,
        id: map(row.id),
        batch_id: map(row.batch_id),
        medication_id: map(row.medication_id),
        provider_id: map(row.provider_id),
        prescription_id: mapNullable(row.prescription_id),
      });
    }
  });
  return profile!;
}
