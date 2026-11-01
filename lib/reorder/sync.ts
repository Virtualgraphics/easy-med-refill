/**
 * Pulls server-side status for open batches (confirmed by the practice,
 * follow-ups sent) into the local database. One server reference covers
 * every medication in the batch. Offline or stub mode: no-op.
 */
import { fetchReorderStatus, isStubMode } from '../api';
import type { DbClient } from '../db/client';
import { listReorderBatches, markBatchConfirmed, setBatchFollowUpCount } from '../db/repo/reorders';

export async function syncReorderStatuses(db: DbClient, profileId: string): Promise<number> {
  if (isStubMode()) return 0;
  const open = await listReorderBatches(db, profileId, { active: true });
  let changed = 0;
  for (const batch of open) {
    if (!batch.server_reference || !['sent', 'overdue'].includes(batch.status)) continue;
    try {
      const remote = await fetchReorderStatus(batch.server_reference);
      if (!remote) continue;
      if (remote.status === 'confirmed') {
        await markBatchConfirmed(db, batch.batch_id);
        changed++;
      } else if (remote.follow_up_count > batch.follow_up_count) {
        await setBatchFollowUpCount(db, batch.batch_id, remote.follow_up_count);
        changed++;
      }
    } catch {
      // Network problems are not errors here; the next load tries again.
    }
  }
  return changed;
}
