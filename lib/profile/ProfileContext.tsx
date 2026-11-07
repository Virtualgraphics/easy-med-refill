import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { LaunchScreen } from '@/components/LaunchScreen';
import { getActiveProfile, listProfiles, type ProfileRow, setActiveProfile, useDb } from '@/lib/db';

interface ProfileContextValue {
  /** The list the app is showing right now. */
  profile: ProfileRow;
  /** Every list on this phone, default first. */
  profiles: ProfileRow[];
  /** Re-reads the active profile and the list after edits. */
  reload: () => Promise<void>;
  /** Makes another list the active one; every screen re-queries. */
  switchProfile: (id: string) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** The launch screen stays at least this long so it does not flash. */
const MIN_LAUNCH_MS = 1500;

/** Loads the active local profile (creating the default on first launch) behind the launch screen. */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [minElapsed, setMinElapsed] = useState(false);

  const load = useCallback(async () => {
    const active = await getActiveProfile(db);
    const all = await listProfiles(db);
    setProfiles(all);
    setProfile(active);
  }, [db]);

  const switchProfile = useCallback(
    async (id: string) => {
      await setActiveProfile(db, id);
      await load();
    },
    [db, load],
  );

  useEffect(() => {
    let active = true;
    load().catch(() => undefined);
    const timer = setTimeout(() => {
      if (active) setMinElapsed(true);
    }, MIN_LAUNCH_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);

  const value = useMemo(() => (profile ? { profile, profiles, reload: load, switchProfile } : null), [profile, profiles, load, switchProfile]);

  if (!value || !minElapsed) {
    return <LaunchScreen />;
  }
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error('useProfile must be used inside ProfileProvider');
  }
  return value;
}
