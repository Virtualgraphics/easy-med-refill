import React from 'react';
import { Text, View } from 'react-native';

import { Card, Muted } from '@/components/ui';
import { formatLongDate, useI18n } from '@/lib/i18n';
import { greetingForHour, type StatusCounts, summariseSupply } from '@/lib/supply/summary';

interface GreetingCardProps {
  /** Shown after the greeting when set; the default list name is not a person. */
  name: string | null;
  counts: StatusCounts;
  now?: Date;
  /** Opens the people switcher when a caregiver manages several lists. */
  onPressName?: () => void;
}

export function GreetingCard({ name, counts, now = new Date(), onPressName }: GreetingCardProps) {
  const { t, locale } = useI18n();
  const greeting = greetingForHour(now.getHours());
  const date = formatLongDate(now, locale);
  const total = counts.actNow + counts.thisWeek + counts.ordered + counts.fine + counts.unknown;

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <View className="self-start rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 dark:border-brand-700 dark:bg-brand-900">
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-200">{t('dashboard.supplyOverview')}</Text>
        </View>
        <Text className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {greeting}
          {name ? (
            <>
              ,{' '}
              <Text className="text-brand-600 dark:text-brand-300" onPress={onPressName} accessibilityRole={onPressName ? 'button' : undefined}>
                {name}
              </Text>
            </>
          ) : null}
        </Text>
        <Muted>{date}</Muted>
        <Text className="mt-1 text-base text-neutral-700 dark:text-neutral-200">{summariseSupply(counts)}</Text>
      </View>

      <View className="flex-row border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <Stat label={t('dashboard.statActNow')} value={counts.actNow} tone={counts.actNow > 0 ? 'critical' : 'muted'} />
        <Stat label={t('dashboard.statThisWeek')} value={counts.thisWeek} tone={counts.thisWeek > 0 ? 'warn' : 'muted'} />
        <Stat label={t('dashboard.statOnOrder')} value={counts.ordered} tone={counts.ordered > 0 ? 'brand' : 'muted'} />
        <Stat label={t('dashboard.statFine')} value={counts.fine} tone={counts.fine > 0 ? 'ok' : 'muted'} />
      </View>
      {total === 0 ? null : null}
    </Card>
  );
}

const toneClass = {
  critical: 'text-status-critical',
  warn: 'text-amber-600',
  brand: 'text-brand-600 dark:text-brand-300',
  ok: 'text-status-ok',
  muted: 'text-neutral-400 dark:text-neutral-600',
} as const;

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof toneClass }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</Text>
      <Text className={`text-2xl font-bold ${toneClass[tone]}`}>{value}</Text>
    </View>
  );
}
