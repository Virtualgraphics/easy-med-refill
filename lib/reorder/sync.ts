/**
 * Pulls server-side status for open requests (confirmed by the practice,
 * follow-ups sent) into the local database. Offline or stub mode: no-op.
 */
import { fetchReorderStatus, isStubMode } from '../api';
import type { DbClient } from '../db/client';
import { listReorderRequests, markReorderConfirmed, setFollowUpCount } from '../db/repo/reorders';

export async function syncReorderStatuses(db: DbClient, profileId: string): Promise<number> {
  if (isStubMode()) return 0;
  const open = await listReorderRequests(db, profileId, { active: true });
  let changed = 0;
  for (const request of open) {
    if (!request.server_reference || !['sent', 'overdue'].includes(request.status)) continue;
    try {
      const remote = await fetchReorderStatus(request.server_reference);
      if (!remote) continue;
      if (remote.status === 'confirmed') {
        await markReorderConfirmed(db, request.id);
        changed++;
      } else if (remote.follow_up_count > request.follow_up_count) {
        await setFollowUpCount(db, request.id, remote.follow_up_count);
        changed++;
      }
    } catch {
      // Network problems are not errors here; the next load tries again.
    }
  }
  return changed;
}
