import type { DbClient } from '../client';

/** Medications of a profile with an unresolved shortage match. */
export async function listShortageMatchedMedicationIds(db: DbClient, profileId: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ medication_id: string }>(
    `SELECT DISTINCT s.medication_id
     FROM shortage_matches s
     JOIN medications m ON m.id = s.medication_id
     WHERE m.profile_id = ? AND s.resolved_at IS NULL`,
    [profileId],
  );
  return new Set(rows.map((r) => r.medication_id));
}
