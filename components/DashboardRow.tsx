import React from 'react';
import { View } from 'react-native';

import { badgeToneFor } from '@/components/MedicationCard';
import { RunwayBars } from '@/components/RunwayBars';
import { Badge, Card, Heading, Muted } from '@/components/ui';
import type { MedicationSupply } from '@/lib/db';
import { describeAction, type SupplyForecast } from '@/lib/supply';

interface DashboardRowProps {
  supply: MedicationSupply;
  forecast: SupplyForecast;
  onPress: () => void;
}

export function DashboardRow({ supply, forecast, onPress }: DashboardRowProps) {
  const { medication } = supply;
  return (
    <Card onPress={onPress} className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Heading numberOfLines={1}>{medication.name}</Heading>
          {medication.is_critical ? <Muted className="text-red-700 dark:text-red-300">Critical medication</Muted> : null}
        </View>
        <Badge text={describeAction(forecast)} tone={badgeToneFor(forecast)} />
      </View>
      <RunwayBars forecast={forecast} />
    </Card>
  );
}
