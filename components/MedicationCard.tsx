import React from 'react';
import { View } from 'react-native';

import { Badge, type BadgeTone, Body, Card, Heading, Muted } from '@/components/ui';
import { formatUnits, type MedicationSupply } from '@/lib/db';
import { describeAction, STATUS_TONE, type SupplyForecast, type Tone } from '@/lib/supply';

const toneToBadge: Record<Tone, BadgeTone> = { ok: 'ok', warn: 'warn', critical: 'critical', neutral: 'neutral' };

export function badgeToneFor(forecast: SupplyForecast): BadgeTone {
  return toneToBadge[STATUS_TONE[forecast.status]];
}

interface MedicationCardProps {
  item: MedicationSupply;
  forecast: SupplyForecast;
  onPress: () => void;
}

export function MedicationCard({ item, forecast, onPress }: MedicationCardProps) {
  const { medication, units_on_hand, daily_units } = item;
  const subtitle = [medication.strength, medication.form].filter(Boolean).join(' · ');
  const runway =
    forecast.pill_runway_days === null
      ? 'no dose entered'
      : `${forecast.pill_runway_days} ${forecast.pill_runway_days === 1 ? 'day' : 'days'} of supply`;
  const rx =
    forecast.prescription_status === 'none'
      ? 'no prescription'
      : forecast.prescription_status === 'valid'
        ? forecast.prescription_runway_days === null
          ? 'Rx open-ended'
          : `Rx ${forecast.prescription_runway_days} days`
        : forecast.prescription_status === 'expired'
          ? 'Rx expired'
          : 'Rx no refills';

  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Heading>{medication.name}</Heading>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
        {medication.is_critical ? <Badge text="Critical" tone="critical" /> : null}
      </View>

      <View className="mt-3 flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Body className="font-semibold">
            {formatUnits(units_on_hand)} units · {runway}
          </Body>
          <Muted>
            {daily_units !== null ? `${formatUnits(daily_units)} per day · ` : ''}
            {rx}
          </Muted>
        </View>
        <Badge text={describeAction(forecast)} tone={badgeToneFor(forecast)} />
      </View>
    </Card>
  );
}
