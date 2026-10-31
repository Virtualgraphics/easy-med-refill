import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { getSetting, setSetting, useDb } from '@/lib/db';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  /** What the user chose in Settings. */
  preference: ThemePreference;
  /** What is actually in effect right now. */
  scheme: ColorScheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const isPreference = (v: string | null): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';

/**
 * Applies the stored appearance preference to NativeWind's dark: variants
 * and exposes the effective scheme for React Navigation.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const systemScheme = useSystemColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    getSetting(db, 'theme').then((value) => {
      if (active && isPreference(value)) setPreferenceState(value);
    });
    return () => {
      active = false;
    };
  }, [db]);

  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      setPreferenceState(next);
      await setSetting(db, 'theme', next);
    },
    [db],
  );

  const scheme: ColorScheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
