import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { type DbClient, useDb } from '@/lib/db';

export interface DbQueryResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Runs a read against the local database whenever the screen gains focus,
 * so edits made on a pushed screen show up as soon as the user comes back.
 */
export function useDbQuery<T>(query: (db: DbClient) => Promise<T>, deps: readonly unknown[] = []): DbQueryResult<T> {
  const db = useDb();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => query(db), [db, ...deps]);

  const reload = useCallback(async () => {
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      run()
        .then((result) => {
          if (active) {
            setData(result);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e : new Error(String(e)));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [run]),
  );

  return { data, error, loading, reload };
}
