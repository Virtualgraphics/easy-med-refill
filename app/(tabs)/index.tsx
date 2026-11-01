import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { DashboardRow } from '@/components/DashboardRow';
import { GreetingCard } from '@/components/GreetingCard';
import { ShortageBanner } from '@/components/ShortageBanner';
import { Body, Button, Card, Muted, Screen, Section } from '@/components/ui';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import {
  type DbClient,
  getBoolSetting,
  getSupplyOverview,
  listProviders,
  listShortageMatchedMedicationIds,
  listShortageMatches,
  type MedicationSupply,
  seedDemoData,
  setBoolSetting,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { ensureNotificationPermission, notifySupplyAlert, syncReminders } from '@/lib/notifications';
import { syncShortages } from '@/lib/shortages';
import { useProfile } from '@/lib/profile/ProfileContext';
import { compareUrgency, forecastAll, type SupplyForecast, type SupplyStatus } from '@/lib/supply';
import { countStatuses } from '@/lib/supply/summary';

async function loadDashboard(db: DbClient, profileId: string) {
  // Refresh the shortage list (throttled) and match it on the device first,
  // so the forecast below already reflects any new shortage.
  let newShortageMatches = 0;
  try {
    newShortageMatches = (await syncShortages(db, profileId)).newMatches;
  } catch {
    // Offline or server trouble: the cached list still applies.
  }
  if (newShortageMatches > 0) {
    notifySupplyAlert(newShortageMatches).catch(() => undefined);
  }
  const [overview, providers, shortages, shortageMatches, remindersEnabled] = await Promise.all([
    getSupplyOverview(db, profileId),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
    listShortageMatches(db, profileId),
    getBoolSetting(db, 'reminders_enabled'),
  ]);
  return { overview, providers, shortages, shortageMatches, remindersEnabled };
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
      <>
        <Tabs.Screen options={{ headerShown: false }} />
        <WelcomeScreen
          onScan={() => router.push('/scan')}
          onPhoto={() => router.push('/photo-import')}
          onAddManually={() => router.push('/medication/new')}
          onLoadDemo={loadDemo}
          loadingDemo={seeding}
        />
      </>
    );
  }

  const counts = countStatuses(rows.map((r) => r.forecast.status));
  const greetingName = profile.display_name === 'My medications' ? null : profile.display_name;

  return (
    <Screen scroll>
      <Tabs.Screen options={{ headerShown: true }} />
      {error ? <Body className="text-status-critical">{error.message}</Body> : null}

      <GreetingCard name={greetingName} counts={counts} />

      <ShortageBanner
        matches={data?.shortageMatches ?? []}
        onOpen={(m) => router.push({ pathname: '/medication/[id]', params: { id: m.medication_id } })}
        onReorder={(m) => router.push({ pathname: '/reorder', params: { medicationId: m.medication_id } })}
      />

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

