import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import type { ShortageMatchDetail } from '@/lib/db';
import { useI18n } from '@/lib/i18n';

interface ShortageBannerProps {
  matches: ShortageMatchDetail[];
  onOpen: (match: ShortageMatchDetail) => void;
  onReorder: (match: ShortageMatchDetail) => void;
}

/**
 * Dashboard alert for reported shortages. Supply language only: it says
 * what is affected and what the app did (earlier reorder), never what to
 * take instead.
 */
export function ShortageBanner({ matches, onOpen, onReorder }: ShortageBannerProps) {
  const { t } = useI18n();
  if (matches.length === 0) return null;
  return (
    <View className="gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <View className="flex-row items-center gap-2">
        <Feather name="alert-triangle" size={18} color="#B45309" />
        <Text className="text-base font-semibold text-amber-900 dark:text-amber-200">
          {t('dashboard.shortageReported', { count: matches.length })}
        </Text>
      </View>
      {matches.map((m) => (
        <Pressable key={m.id} accessibilityRole="button" onPress={() => onOpen(m)} className="gap-0.5 rounded-xl bg-white/70 p-3 dark:bg-black/20">
          <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {m.medication_name}
            {m.is_critical ? <Text className="text-red-700 dark:text-red-300">{t('dashboard.shortageCritical')}</Text> : null}
          </Text>
          <Text className="text-sm text-neutral-700 dark:text-neutral-300">
            {m.status ?? t('dashboard.shortageListed')}
            {m.product_code.startsWith('ATC:') ? t('dashboard.shortageMatchedBy', { ingredient: m.active_ingredient ?? m.product_code.slice(4) }) : ''}
            {m.is_critical ? t('dashboard.shortageMovedToday') : '.'}
          </Text>
          {m.is_critical ? (
            <View className="mt-2">
              <Button title={t('dashboard.shortageReorderNow')} compact onPress={() => onReorder(m)} />
            </View>
          ) : null}
        </Pressable>
      ))}
      <Text className="text-xs text-amber-900/80 dark:text-amber-200/80">
        {t('dashboard.shortageFooter')}
      </Text>
    </View>
  );
}
