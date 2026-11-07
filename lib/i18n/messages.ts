/**
 * Message catalogue types. English is the source of truth: every other
 * language must provide the same keys (checked by TypeScript) with
 * string values. Keys are two levels deep: area.key.
 */
import type en from './locales/en';

/** Same keys as the English area, string values. */
export type AreaMessages<T> = { [K in keyof T]: string };

export type Messages = { [A in keyof typeof en]: AreaMessages<(typeof en)[A]> };

type Area = keyof Messages;

/** 'orders.packs_one' -> 'orders.packs'; the count parameter picks the form. */
type BaseKey<K> = K extends `${infer B}_one` ? B : K extends `${string}_other` ? never : K;

/** Every valid key, e.g. 'common.save' or 'orders.packs'. */
export type MessageKey = { [A in Area]: `${A}.${BaseKey<Extract<keyof Messages[A], string>>}` }[Area];

export type MessageParams = Record<string, string | number | null | undefined> & { count?: number };
