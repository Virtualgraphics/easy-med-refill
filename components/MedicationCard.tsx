import React from 'react';
import { View } from 'react-native';

import { Badge, type BadgeTone, Body, Card, Heading, Muted } from '@/components/ui';
import { formatUnits, type MedicationSupply } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { describeAction, forecastTone, type SupplyForecast, type Tone } from '@/lib/supply';

const toneToBadge: Record<Tone, BadgeTone> = { ok: 'ok', warn: 'warn', critical: 'critical', neutral: 'neutral' };

export function badgeToneFor(forecast: SupplyForecast): BadgeTone {
  return toneToBadge[forecastTone(forecast)];
}

interface MedicationCardProps {
  item: MedicationSupply;
  forecast: SupplyForecast;
  onPress: () => void;
}

export function MedicationCard({ item, forecast, onPress }: MedicationCardProps) {
  const { t } = useI18n();
  const { medication, units_on_hand, daily_units } = item;
  const subtitle = [medication.strength, medication.form].filter(Boolean).join(' · ');
  const runway =
    forecast.pill_runway_days === null ? t('dashboard.cardNoDose') : t('dashboard.cardSupplyDays', { count: forecast.pill_runway_days });
  const rx =
    forecast.prescription_status === 'none'
      ? t('dashboard.cardNoRx')
      : forecast.prescription_status === 'valid'
        ? forecast.prescription_runway_days === null
          ? t('dashboard.cardRxOpen')
          : t('dashboard.cardRxDays', { count: forecast.prescription_runway_days })
        : forecast.prescription_status === 'expired'
          ? t('dashboard.cardRxExpired')
          : t('dashboard.cardRxNoRefills');

  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Heading>{medication.name}</Heading>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
        {medication.is_critical ? <Badge text={t('common.critical')} tone="critical" /> : null}
      </View>

      <View className="mt-3 flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Body className="font-semibold">
            {t('dashboard.cardUnits', { units: formatUnits(units_on_hand) })} · {runway}
          </Body>
          <Muted>
            {daily_units !== null ? `${t('dashboard.cardPerDay', { units: formatUnits(daily_units) })} · ` : ''}
            {rx}
          </Muted>
        </View>
        <Badge text={describeAction(forecast)} tone={badgeToneFor(forecast)} />
      </View>
    </Card>
  );
}
