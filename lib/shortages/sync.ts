/**
 * Fetches the shortage list and matches it on the device. The server only
 * ever sees the request for the list, never which medications matched.
 */
import { fetchShortages, isStubMode, refreshShortagesOnServer } from '../api';
import type { DbClient } from '../db/client';
import { nowIso } from '../db/clock';
import { listMedications } from '../db/repo/medications';
import { getSetting, setSetting } from '../db/repo/settings';
import { listShortageEntries, recordShortageMatch, replaceShortageEntries, resolveStaleShortageMatches, type ShortageEntryInput } from '../db/repo/shortages';
import type { ShortageSource } from '../db/types';
import { matchShortages } from './match';
import { SIMULATED_SHORTAGES } from './simulated';

export interface ShortageSyncResult {
  entries: number;
  newMatches: number;
  resolved: number;
  source: 'server' | 'simulated' | 'cached';
  /** What the server reported when asked to rebuild its list (forced sync only). */
  serverRefresh: { simulated: number; bwl: number | null; bwl_error: string | null } | null;
  /** Why the server could not be used, if it could not. */
  serverError: string | null;
}

/** Re-fetch at most this often unless forced. */
export const SHORTAGE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

const SOURCES: ShortageSource[] = ['drugshortage_ch', 'bwl', 'simulated'];

export async function syncShortages(db: DbClient, profileId: string, options: { force?: boolean } = {}): Promise<ShortageSyncResult> {
  const last = await getSetting(db, 'shortages_synced_at');
  const stale = !last || Date.now() - Date.parse(last) > SHORTAGE_SYNC_INTERVAL_MS;
  let source: ShortageSyncResult['source'] = 'cached';
  let serverRefresh: ShortageSyncResult['serverRefresh'] = null;
  let serverError: string | null = null;

  if (options.force || stale) {
    let entries: ShortageEntryInput[] | null = null;
    if (isStubMode()) {
      entries = SIMULATED_SHORTAGES;
      source = 'simulated';
    } else {
      try {
        if (options.force) {
          // Manual check: have the server re-read the federal list first.
          serverRefresh = await refreshShortagesOnServer(true);
        }
        const remote = await fetchShortages();
        if (remote) {
          entries = remote
            .filter((r) => SOURCES.includes(r.source as ShortageSource))
            .map((r) => ({ source: r.source as ShortageSource, product_code: r.product_code, active_ingredient: r.active_ingredient, status: r.status }));
          source = 'server';
        }
      } catch (e) {
        // Offline or server trouble: keep the cached list and match against that.
        serverError = e instanceof Error ? e.message : String(e);
      }
    }
    if (entries) {
      await replaceShortageEntries(db, entries);
      await setSetting(db, 'shortages_synced_at', nowIso());
    }
  }

  const [entries, medications] = await Promise.all([listShortageEntries(db), listMedications(db, profileId, { includeArchived: true })]);
  let newMatches = 0;
  const seen = new Set<string>();
  for (const hit of matchShortages(entries, medications)) {
    const key = `${hit.medication_id}|${hit.source}|${hit.product_code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (await recordShortageMatch(db, hit.medication_id, hit.source, hit.product_code)) {
      newMatches++;
    }
  }
  const resolved = await resolveStaleShortageMatches(db);

  return { entries: entries.length, newMatches, resolved, source, serverRefresh, serverError };
}
