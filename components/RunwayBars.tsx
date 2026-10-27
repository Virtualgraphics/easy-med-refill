import React from 'react';
import { Text, View } from 'react-native';

import type { SupplyForecast } from '@/lib/supply';

/** Bars are drawn against this many days; longer runways fill the bar. */
const HORIZON_DAYS = 90;

type Tone = 'ok' | 'warn' | 'critical' | 'neutral';

const fill: Record<Tone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  critical: 'bg-status-critical',
  neutral: 'bg-neutral-300 dark:bg-neutral-700',
};

function toneForDays(days: number | null, marginDays: number): Tone {
  if (days === null) return 'neutral';
  if (days <= marginDays) return 'critical';
  if (days <= marginDays + 7) return 'warn';
  return 'ok';
}

function Bar({ label, days, caption, tone }: { label: string; days: number | null; caption: string; tone: Tone }) {
  const fraction = days === null ? 0 : Math.max(0.02, Math.min(1, days / HORIZON_DAYS));
  return (
    <View className="flex-row items-center gap-3">
      <Text className="w-9 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
      <View className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <View className={`h-2 rounded-full ${fill[tone]}`} style={{ width: `${Math.round(fraction * 100)}%` }} />
      </View>
      <Text className="w-20 text-right text-xs text-neutral-600 dark:text-neutral-300" numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

/** The two runways side by side: pills on hand and prescription validity. */
export function RunwayBars({ forecast }: { forecast: SupplyForecast }) {
  const margin = forecast.lead_time_days + forecast.safety_buffer_days;

  const pillDays = forecast.pill_runway_days;
  const pillCaption = pillDays === null ? 'no dose' : pillDays === 0 ? 'empty' : `${pillDays} d`;

  let rxDays: number | null = forecast.prescription_runway_days;
  let rxCaption: string;
  let rxTone: Tone;
  switch (forecast.prescription_status) {
    case 'none':
      rxCaption = 'none';
      rxTone = 'neutral';
      rxDays = null;
      break;
    case 'expired':
      rxCaption = 'expired';
      rxTone = 'critical';
      rxDays = 0;
      break;
    case 'exhausted':
      rxCaption = 'no refills';
      rxTone = 'critical';
      rxDays = 0;
      break;
    case 'valid':
      if (rxDays === null) {
        rxCaption = 'open';
        rxTone = 'ok';
        rxDays = HORIZON_DAYS;
      } else {
        rxCaption = `${rxDays} d`;
        rxTone = toneForDays(rxDays, margin);
      }
      break;
  }

  return (
    <View className="gap-1.5">
      <Bar label="Pills" days={pillDays} caption={pillCaption} tone={toneForDays(pillDays, margin)} />
      <Bar label="Rx" days={rxDays} caption={rxCaption} tone={rxTone} />
    </View>
  );
}
