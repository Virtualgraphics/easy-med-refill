/**
 * Read model for the dashboard: one row per active medication with its
 * stock, the schedule in force and the current prescription. The runway
 * maths lives in the forecast engine; this only gathers the inputs.
 */
import type { DbClient } from '../client';
import { todayIso } from '../clock';
import type { DoseScheduleRow, IsoDate, MedicationRow, PrescriptionRow } from '../types';
import { dailyUnits } from './doseSchedules';
import { listMedications } from './medications';

export interface MedicationSupply {
  medication: MedicationRow;
  units_on_hand: number;
  pack_count: number;
  next_expiry: IsoDate | null;
  schedule: DoseScheduleRow | null;
  /** Planned consumption per day, null without a schedule. */
  daily_units: number | null;
  prescription: PrescriptionRow | null;
}

interface PackAggregate {
  medication_id: string;
  units_on_hand: number;
  pack_count: number;
  next_expiry: IsoDate | null;
}

export async function getSupplyOverview(
  db: DbClient,
  profileId: string,
  onDate: IsoDate = todayIso(),
): Promise<MedicationSupply[]> {
  const medications = await listMedications(db, profileId);
  if (medications.length === 0) {
    return [];
  }

  const [packs, schedules, prescriptions] = await Promise.all([
    db.getAllAsync<PackAggregate>(
      `SELECT p.medication_id,
              COALESCE(SUM(p.units_remaining), 0) AS units_on_hand,
              COUNT(*) AS pack_count,
              MIN(p.expiry_date) AS next_expiry
       FROM packs p
       JOIN medications m ON m.id = p.medication_id
       WHERE m.profile_id = ? AND p.depleted_at IS NULL
       GROUP BY p.medication_id`,
      [profileId],
    ),
    db.getAllAsync<DoseScheduleRow>(
      `SELECT s.*
       FROM dose_schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.profile_id = ? AND s.valid_from <= ? AND (s.valid_to IS NULL OR s.valid_to > ?)
       ORDER BY s.valid_from DESC, s.created_at DESC`,
      [profileId, onDate, onDate],
    ),
    db.getAllAsync<PrescriptionRow>(
      `SELECT r.*
       FROM prescriptions r
       JOIN medications m ON m.id = r.medication_id
       WHERE m.profile_id = ?
       ORDER BY r.issued_at DESC, r.created_at DESC`,
      [profileId],
    ),
  ]);

  const packByMed = new Map(packs.map((p) => [p.medication_id, p]));
  const scheduleByMed = firstPerMedication(schedules);
  const prescriptionByMed = firstPerMedication(prescriptions);

  return medications.map((medication) => {
    const pack = packByMed.get(medication.id);
    const schedule = scheduleByMed.get(medication.id) ?? null;
    return {
      medication,
      units_on_hand: pack?.units_on_hand ?? 0,
      pack_count: pack?.pack_count ?? 0,
      next_expiry: pack?.next_expiry ?? null,
      schedule,
      daily_units: schedule ? dailyUnits(schedule) : null,
      prescription: prescriptionByMed.get(medication.id) ?? null,
    };
  });
}

/** Keeps the first row seen per medication; rows must already be sorted. */
function firstPerMedication<T extends { medication_id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!map.has(row.medication_id)) {
      map.set(row.medication_id, row);
    }
  }
  return map;
}
