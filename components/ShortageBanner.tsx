import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import type { ShortageMatchDetail } from '@/lib/db';

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
  if (matches.length === 0) return null;
  return (
    <View className="gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <View className="flex-row items-center gap-2">
        <FontAwesome name="exclamation-triangle" size={16} color="#B45309" />
        <Text className="text-base font-semibold text-amber-900 dark:text-amber-200">
          {matches.length === 1 ? 'Shortage reported' : `${matches.length} shortages reported`}
        </Text>
      </View>
      {matches.map((m) => (
        <Pressable key={m.id} accessibilityRole="button" onPress={() => onOpen(m)} className="gap-0.5 rounded-xl bg-white/70 p-3 dark:bg-black/20">
          <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {m.medication_name}
            {m.is_critical ? <Text className="text-red-700 dark:text-red-300"> · critical</Text> : null}
          </Text>
          <Text className="text-sm text-neutral-700 dark:text-neutral-300">
            {m.status ?? 'Supply shortage listed by the source'}
            {m.is_critical ? '. Reorder date moved to today; the request tells your clinic.' : '.'}
          </Text>
          {m.is_critical ? (
            <View className="mt-2">
              <Button title="Reorder now" compact onPress={() => onReorder(m)} />
            </View>
          ) : null}
        </Pressable>
      ))}
      <Text className="text-xs text-amber-900/80 dark:text-amber-200/80">
        Shortage data is matched on this phone only. Nothing about your list is sent anywhere.
      </Text>
    </View>
  );
}
