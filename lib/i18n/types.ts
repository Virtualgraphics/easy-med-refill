/** UI languages. Swiss national languages plus English. */
export type Locale = 'de' | 'en' | 'fr' | 'it';

export const LOCALES: readonly Locale[] = ['de', 'en', 'fr', 'it'];

/** What the user picked in Settings; 'system' follows the phone. */
export type LanguagePreference = 'system' | Locale;

/** BCP 47 tags for date formatting. */
export const LOCALE_TAGS: Record<Locale, string> = {
  de: 'de-CH',
  en: 'en-GB',
  fr: 'fr-CH',
  it: 'it-CH',
};

/** Native names for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
