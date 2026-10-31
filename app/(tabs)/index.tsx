import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { DashboardRow } from '@/components/DashboardRow';
import { Body, Button, Card, Muted, Screen, Section, Title } from '@/components/ui';
import {
  type DbClient,
  getBoolSetting,
  getSupplyOverview,
  listProviders,
  listShortageMatchedMedicationIds,
  type MedicationSupply,
  seedDemoData,
  setBoolSetting,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { ensureNotificationPermission, syncReminders } from '@/lib/notifications';
import { useProfile } from '@/lib/profile/ProfileContext';
import { compareUrgency, forecastAll, type SupplyForecast, type SupplyStatus } from '@/lib/supply';

async function loadDashboard(db: DbClient, profileId: string) {
  const [overview, providers, shortages, remindersEnabled] = await Promise.all([
    getSupplyOverview(db, profileId),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
    getBoolSetting(db, 'reminders_enabled'),
  ]);
  return { overview, providers, shortages, remindersEnabled };
}

interface Row {
  supply: MedicationSupply;
  forecast: SupplyForecast;
}

const GROUPS: { key: string; title: string; statuses: SupplyStatus[]; empty?: string }[] = [
  { key: 'now', title: 'Act now', statuses: ['out', 'overdue', 'due'], empty: 'Nothing needs action today.' },
  { key: 'week', title: 'Due this week', statuses: ['due_soon'] },
  { key: 'ordered', title: 'On order', statuses: ['ordered'] },
  { key: 'later', title: 'Coming up', statuses: ['ok'] },
  { key: 'info', title: 'Needs a dose entry', statuses: ['unknown'] },
];

export default function DashboardScreen() {
  const router = useRouter();
  const db = useDb();
  const { profile, reload: reloadProfile } = useProfile();
  const { data, loading, error, reload } = useDbQuery((d) => loadDashboard(d, profile.id), [profile.id]);
  const [seeding, setSeeding] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const forecasts = forecastAll(data.overview, data.providers, { shortageMedicationIds: data.shortages });
    return data.overview.map((supply, i) => ({ supply, forecast: forecasts[i] })).sort(compareUrgency);
  }, [data]);

  // Keep local reminders in step with the latest forecast whenever the dashboard shows it.
  useEffect(() => {
    if (data?.remindersEnabled && rows.length > 0) {
      syncReminders(rows.map((r) => r.forecast)).catch(() => undefined);
    }
  }, [data?.remindersEnabled, rows]);

  const enableReminders = async () => {
    setEnabling(true);
    try {
      const granted = await ensureNotificationPermission();
      await setBoolSetting(db, 'reminders_enabled', granted);
      await reload();
    } finally {
      setEnabling(false);
    }
  };

  const loadDemo = async () => {
    setSeeding(true);
    try {
      await seedDemoData(db);
      await reloadProfile();
      await reload();
    } finally {
      setSeeding(false);
    }
  };

  if (loading && !data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0B5CAB" />
        </View>
      </Screen>
    );
  }

  if (rows.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Title className="text-center">Your supply at a glance</Title>
          <Muted className="text-center">
            Once medications are added, this screen shows what needs a reorder or a prescription renewal, and when.
          </Muted>
          <Button title="Add medication" onPress={() => router.push('/medication/new')} />
          <Button title="Load demo data" variant="secondary" onPress={loadDemo} loading={seeding} />
        </View>
      </Screen>
    );
  }

  const count = (statuses: SupplyStatus[]) => rows.filter((r) => statuses.includes(r.forecast.status)).length;
  const actNow = count(['out', 'overdue', 'due']);
  const thisWeek = count(['due_soon']);
  const fine = count(['ok', 'ordered']);

  return (
    <Screen scroll>
      {error ? <Body className="text-status-critical">{error.message}</Body> : null}

      <View className="flex-row gap-3">
        <StatTile label="Act now" value={actNow} tone={actNow > 0 ? 'critical' : 'ok'} />
        <StatTile label="This week" value={thisWeek} tone={thisWeek > 0 ? 'warn' : 'ok'} />
        <StatTile label="Fine" value={fine} tone="ok" />
      </View>

      {!data?.remindersEnabled ? (
        <Card className="gap-3">
          <Body className="font-semibold">Get a reminder on the day</Body>
          <Muted>A local notification on the day a reorder or renewal is due. It never includes medication names.</Muted>
          <Button title="Enable reminders" variant="secondary" onPress={enableReminders} loading={enabling} />
        </Card>
      ) : null}

      {GROUPS.map((group) => {
        const items = rows.filter((r) => group.statuses.includes(r.forecast.status));
        if (items.length === 0 && !group.empty) return null;
        return (
          <Section key={group.key} title={group.title}>
            {items.length === 0 ? (
              <Card>
                <Muted>{group.empty}</Muted>
              </Card>
            ) : (
              <View className="gap-2">
                {items.map((row) => (
                  <DashboardRow
                    key={row.supply.medication.id}
                    supply={row.supply}
                    forecast={row.forecast}
                    onPress={() => router.push({ pathname: '/medication/[id]', params: { id: row.supply.medication.id } })}
                  />
                ))}
              </View>
            )}
          </Section>
        );
      })}
    </Screen>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'critical' }) {
  const colors = {
    ok: 'text-status-ok',
    warn: 'text-amber-600',
    critical: 'text-status-critical',
  }[tone];
  return (
    <Pressable className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <Text className={`text-3xl font-bold ${value === 0 ? 'text-neutral-400' : colors}`}>{value}</Text>
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</Text>
    </Pressable>
  );
}
