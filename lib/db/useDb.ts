import { useSQLiteContext } from 'expo-sqlite';

import type { DbClient } from './client';

/** The app database, typed to the surface the repository layer uses. */
export function useDb(): DbClient {
  return useSQLiteContext();
}
