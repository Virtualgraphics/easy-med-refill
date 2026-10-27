/**
 * Consumption schedules, entered by the user exactly as given by their
 * doctor. The app uses them only to compute supply runway. It never
 * calculates, suggests or changes what should be taken.
 */
import type { DbClient } from '../client';
import { nowIso, todayIso } from '../clock';
import { newId } from '../ids';
import type { DosePeriod, DoseScheduleRow, DoseSource, IsoDate } from '../types';
import { bool, insertRow } from './_helpers';

export interface DoseScheduleInput {
  units_per_intake: number;
  intakes_per_period: number;
  period: DosePeriod;
  is_prn?: boolean;
  /** Defaults to today. A future date schedules the change ahead of time. */
  valid_from?: IsoDate;
  source?: DoseSource;
}

/**
 * Records a new schedule and closes the one it replaces, keeping history.
 * A second change on the same day replaces the first instead of leaving a
 * zero-length row behind.
 */
export async function setDoseSchedule(
  db: DbClient,
  medicationId: string,
  input: DoseScheduleInput,
): Promise<DoseScheduleRow> {
  const validFrom = input.valid_from ?? todayIso();
  const row: DoseScheduleRow = {
    id: newId(),
    medication_id: medicationId,
    units_per_intake: input.units_per_intake,
    intakes_per_period: input.intakes_per_period,
    period: input.period,
    is_prn: bool(input.is_prn),
    valid_from: validFrom,
    valid_to: null,
    source: input.source ?? 'manual',
    created_at: nowIso(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE dose_schedules SET valid_to = ?
       WHERE medication_id = ? AND (valid_to IS NULL OR valid_to > ?)`,
      [validFrom, medicationId, validFrom],
    );
    await db.runAsync(
      `DELETE FROM dose_schedules
       WHERE medication_id = ? AND valid_to IS NOT NULL AND valid_to <= valid_from`,
      [medicationId],
    );
    await insertRow(db, 'dose_schedules', row);
  });

  return row;
}

/** The schedule in force on `onDate` (default today), if any. */
export async function getActiveDoseSchedule(
  db: DbClient,
  medicationId: string,
  onDate: IsoDate = todayIso(),
): Promise<DoseScheduleRow | null> {
  return db.getFirstAsync<DoseScheduleRow>(
    `SELECT * FROM dose_schedules
     WHERE medication_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
     ORDER BY valid_from DESC, created_at DESC LIMIT 1`,
    [medicationId, onDate, onDate],
  );
}

/** Newest first, including scheduled future changes. */
export async function listDoseScheduleHistory(db: DbClient, medicationId: string): Promise<DoseScheduleRow[]> {
  return db.getAllAsync<DoseScheduleRow>(
    'SELECT * FROM dose_schedules WHERE medication_id = ? ORDER BY valid_from DESC, created_at DESC',
    [medicationId],
  );
}

/** Planned units consumed per day under a schedule. PRN schedules are an upper bound. */
export function dailyUnits(schedule: Pick<DoseScheduleRow, 'units_per_intake' | 'intakes_per_period' | 'period'>): number {
  const perPeriod = schedule.units_per_intake * schedule.intakes_per_period;
  return schedule.period === 'week' ? perPeriod / 7 : perPeriod;
}
