import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { LaunchScreen } from '@/components/LaunchScreen';
import { ensureDefaultProfile, type ProfileRow, useDb } from '@/lib/db';

interface ProfileContextValue {
  profile: ProfileRow;
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** The launch screen stays at least this long so it does not flash. */
const MIN_LAUNCH_MS = 1500;

/** Loads (or creates) the default local profile behind the launch screen. */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);

  const reload = useCallback(async () => {
    setProfile(await ensureDefaultProfile(db));
  }, [db]);

  useEffect(() => {
    let active = true;
    ensureDefaultProfile(db).then((p) => {
      if (active) setProfile(p);
    });
    const timer = setTimeout(() => {
      if (active) setMinElapsed(true);
    }, MIN_LAUNCH_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [db]);

  const value = useMemo(() => (profile ? { profile, reload } : null), [profile, reload]);

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
