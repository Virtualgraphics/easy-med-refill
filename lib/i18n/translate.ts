/**
 * Pure translation core: catalogue lookup, placeholders, plurals, dates.
 * No React, no database, so library code and unit tests can import it
 * without pulling in native modules. The provider in ./index.tsx sets
 * the current locale.
 */
import de from './locales/de';
import en from './locales/en';
import fr from './locales/fr';
import it from './locales/it';
import type { MessageKey, MessageParams, Messages } from './messages';
import { LOCALE_TAGS, type Locale } from './types';

const CATALOGUE: Record<Locale, Messages> = { de, en, fr, it };

let currentLocale: Locale = 'en';

/** Locale currently in use (set by the provider; 'en' in tests). */
export function getLocale(): Locale {
  return currentLocale;
}

/** For the provider, tests and non-React callers that need to force a language. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

function lookup(locale: Locale, area: string, key: string): string | undefined {
  const own = (CATALOGUE[locale] as Record<string, Record<string, string>>)[area]?.[key];
  if (own !== undefined) return own;
  return (CATALOGUE.en as Record<string, Record<string, string>>)[area]?.[key];
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const dot = key.indexOf('.');
  const area = key.slice(0, dot);
  const name = key.slice(dot + 1);
  let text: string | undefined;
  if (params && typeof params.count === 'number') {
    text = lookup(locale, area, params.count === 1 ? `${name}_one` : `${name}_other`);
  }
  text ??= lookup(locale, area, name);
  if (text === undefined) return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, p: string) => {
    const value = params[p];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Translate with the current locale. Use outside components. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(currentLocale, key, params);
}

/** Long date like "Sunday, 1 November 2026" in the current language. */
export function formatLongDate(date: Date, locale: Locale = currentLocale): string {
  return date.toLocaleDateString(LOCALE_TAGS[locale], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
