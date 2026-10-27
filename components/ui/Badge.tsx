import React from 'react';
import { Text, View } from 'react-native';

export type BadgeTone = 'critical' | 'warn' | 'ok' | 'neutral' | 'brand';

const tones: Record<BadgeTone, { box: string; text: string }> = {
  critical: { box: 'bg-red-100 dark:bg-red-950', text: 'text-red-700 dark:text-red-300' },
  warn: { box: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-800 dark:text-amber-300' },
  ok: { box: 'bg-green-100 dark:bg-green-950', text: 'text-green-700 dark:text-green-300' },
  neutral: { box: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-300' },
  brand: { box: 'bg-brand-50 dark:bg-brand-900', text: 'text-brand-700 dark:text-brand-200' },
};

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: BadgeTone }) {
  const t = tones[tone];
  return (
    <View className={`${t.box} self-start rounded-full px-2.5 py-0.5`}>
      <Text className={`${t.text} text-xs font-semibold`}>{text}</Text>
    </View>
  );
}
