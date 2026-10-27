import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ensureDefaultProfile, type ProfileRow, useDb } from '@/lib/db';

interface ProfileContextValue {
  profile: ProfileRow;
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** Loads (or creates) the default local profile before rendering the app. */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const reload = useCallback(async () => {
    setProfile(await ensureDefaultProfile(db));
  }, [db]);

  useEffect(() => {
    let active = true;
    ensureDefaultProfile(db).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [db]);

  const value = useMemo(() => (profile ? { profile, reload } : null), [profile, reload]);

  if (!value) {
    return null;
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
