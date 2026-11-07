import { getLocales } from 'expo-localization';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSetting, setSetting, useDb } from '../db';
import type { MessageKey, MessageParams } from './messages';
import { getLocale, setLocale, translate } from './translate';
import { isLocale, type LanguagePreference, type Locale } from './types';

export { LOCALE_NAMES, LOCALE_TAGS, LOCALES, type LanguagePreference, type Locale } from './types';
export type { MessageKey, MessageParams } from './messages';
export { formatLongDate, getLocale, setLocale, t, translate } from './translate';

/** The phone's first preferred language we support, else English. */
export function deviceLocale(): Locale {
  for (const l of getLocales()) {
    if (isLocale(l.languageCode)) return l.languageCode;
  }
  return 'en';
}

export function resolveLocale(preference: LanguagePreference): Locale {
  return preference === 'system' ? deviceLocale() : preference;
}

interface I18nContextValue {
  locale: Locale;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => Promise<void>;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Loads the language setting before rendering children, so nothing flashes in English. */
export function I18nProvider({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const db = useDb();
  const [preference, setPreferenceState] = useState<LanguagePreference | null>(null);

  useEffect(() => {
    let active = true;
    getSetting(db, 'language')
      .then((value) => {
        if (!active) return;
        const pref: LanguagePreference = isLocale(value) ? value : 'system';
        setLocale(resolveLocale(pref));
        setPreferenceState(pref);
      })
      .catch(() => {
        if (active) setPreferenceState('system');
      });
    return () => {
      active = false;
    };
  }, [db]);

  const setPreference = useCallback(
    async (next: LanguagePreference) => {
      await setSetting(db, 'language', next === 'system' ? null : next);
      setLocale(resolveLocale(next));
      setPreferenceState(next);
    },
    [db],
  );

  const value = useMemo<I18nContextValue | null>(() => {
    if (preference === null) return null;
    const locale = resolveLocale(preference);
    setLocale(locale);
    return { locale, preference, setPreference, t: (key, params) => translate(locale, key, params) };
  }, [preference, setPreference]);

  if (!value) return <>{fallback}</>;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
