import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { MedicationCard } from '@/components/MedicationCard';
import { Body, Button, Muted, Screen, Title } from '@/components/ui';
import { type DbClient, getSupplyOverview, listProviders, listShortageMatchedMedicationIds, seedDemoData, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';
import { forecastAll } from '@/lib/supply';

async function loadList(db: DbClient, profileId: string) {
  const [overview, providers, shortages] = await Promise.all([
    getSupplyOverview(db, profileId),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
  ]);
  return { overview, providers, shortages };
}

/** Full list in management order: critical first, then alphabetical. */
export default function MedicationsScreen() {
  const router = useRouter();
  const db = useDb();
  const { profile, reload: reloadProfile } = useProfile();
  const { t } = useI18n();
  const { data, loading, error, reload } = useDbQuery((d) => loadList(d, profile.id), [profile.id]);
  const [seeding, setSeeding] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const forecasts = forecastAll(data.overview, data.providers, { shortageMedicationIds: data.shortages });
    return data.overview.map((supply, i) => ({ supply, forecast: forecasts[i] }));
  }, [data]);

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

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View className="flex-row items-center">
              <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.scanCode')} onPress={() => router.push('/scan')} hitSlop={8}>
                <MaterialCommunityIcons name="qrcode-scan" size={22} color="#fff" style={{ marginRight: 20 }} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.addMedication')} onPress={() => router.push('/medication/new')} hitSlop={8}>
                <Feather name="plus" size={24} color="#fff" style={{ marginRight: 16 }} />
              </Pressable>
            </View>
          ),
        }}
      />
      {error ? (
        <View className="p-4">
          <Body className="text-status-critical">{error.message}</Body>
        </View>
      ) : null}
      {loading && !data ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0B5CAB" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.supply.medication.id}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          renderItem={({ item }) => (
            <MedicationCard
              item={item.supply}
              forecast={item.forecast}
              onPress={() => router.push({ pathname: '/medication/[id]', params: { id: item.supply.medication.id } })}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-4 px-6">
              <Title className="text-center">{t('dashboard.emptyTitle')}</Title>
              <Muted className="text-center">{t('dashboard.emptyBody')}</Muted>
              <Button title={t('dashboard.emptyScan')} onPress={() => router.push('/scan')} />
              <Button title={t('dashboard.emptyManual')} variant="secondary" onPress={() => router.push('/medication/new')} />
              <Button title={t('dashboard.loadDemo')} variant="ghost" onPress={loadDemo} loading={seeding} />
            </View>
          }
        />
      )}
    </Screen>
  );
}
