import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { badgeToneFor } from '@/components/MedicationCard';
import { Badge, Body, Button, Card, Heading, Muted, Screen, Section } from '@/components/ui';
import {
  dailyUnits,
  type DbClient,
  formatDate,
  formatUnits,
  getActiveDoseSchedule,
  getMedication,
  listDoseScheduleHistory,
  listPacks,
  listPrescriptions,
  listProviders,
  listShortageMatchedMedicationIds,
  type MedicationSupply,
  type PackRow,
  type ProviderRow,
  refillsRemaining,
  setPackUnitsRemaining,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { describeAction, describePillRunway, describePrescriptionRunway, forecastAll } from '@/lib/supply';

async function loadDetail(db: DbClient, id: string, profileId: string) {
  const [medication, packs, schedule, history, prescriptions, providers, shortages] = await Promise.all([
    getMedication(db, id),
    listPacks(db, id),
    getActiveDoseSchedule(db, id),
    listDoseScheduleHistory(db, id),
    listPrescriptions(db, id),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
  ]);
  return { medication, packs, schedule, history, prescriptions, providers, shortages };
}

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { data, loading, reload } = useDbQuery((d) => loadDetail(d, id, profile.id), [id, profile.id]);

  if (!data?.medication) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>Medication not found.</Muted>}
        </View>
      </Screen>
    );
  }

  const { medication, packs, schedule, history, prescriptions, providers, shortages } = data;
  const providerById = new Map(providers.map((p) => [p.id, p] as [string, ProviderRow]));
  const unitsOnHand = packs.reduce((sum, p) => sum + p.units_remaining, 0);
  const daily = schedule ? dailyUnits(schedule) : null;
  const preferred = medication.preferred_provider_id ? providerById.get(medication.preferred_provider_id) : undefined;

  const supply: MedicationSupply = {
    medication,
    units_on_hand: unitsOnHand,
    pack_count: packs.length,
    next_expiry: packs.find((p) => p.expiry_date)?.expiry_date ?? null,
    schedule,
    daily_units: daily,
    prescription: prescriptions[0] ?? null,
  };
  const [forecast] = forecastAll([supply], providers, { shortageMedicationIds: shortages });

  const adjustPack = async (pack: PackRow, delta: number) => {
    await setPackUnitsRemaining(db, pack.id, pack.units_remaining + delta);
    await reload();
  };

  const go = (screen: 'edit' | 'pack' | 'dose' | 'prescription') =>
    router.push({ pathname: `/medication/[id]/${screen}`, params: { id } });

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: medication.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={() => go('edit')} hitSlop={8}>
              <FontAwesome name="pencil" size={20} color="#fff" style={{ marginRight: 16 }} />
            </Pressable>
          ),
        }}
      />

      <Card className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {medication.is_critical ? <Badge text="Critical" tone="critical" /> : null}
          <Badge text={describeAction(forecast)} tone={badgeToneFor(forecast)} />
          {forecast.shortage ? <Badge text="Shortage reported" tone="warn" /> : null}
        </View>
        <View className="gap-0.5">
          {medication.active_ingredient ? <Body>{medication.active_ingredient}</Body> : null}
          <Muted>{[medication.strength, medication.form].filter(Boolean).join(' · ') || 'No strength or form recorded'}</Muted>
          {medication.gtin ? <Muted>GTIN {medication.gtin}</Muted> : null}
          {preferred ? <Muted>Supplier: {preferred.name}</Muted> : null}
          {medication.notes ? <Muted>{medication.notes}</Muted> : null}
        </View>
      </Card>

      <Section title="Forecast">
        <Card className="gap-3">
          <ForecastRow label="Pill runway" value={describePillRunway(forecast)} />
          <ForecastRow label="Prescription runway" value={describePrescriptionRunway(forecast)} />
          <ForecastRow
            label="Margin"
            value={`${forecast.lead_time_days} days lead time + ${forecast.safety_buffer_days} days safety buffer`}
          />
          {forecast.reorder_by ? <ForecastRow label="Reorder by" value={formatDate(forecast.reorder_by)} /> : null}
          {forecast.renewal_by ? <ForecastRow label="Renew prescription by" value={formatDate(forecast.renewal_by)} /> : null}
        </Card>
      </Section>

      <Section title="Supply" action={{ label: 'Add pack', onPress: () => go('pack') }}>
        <Card className="gap-3">
          <View className="flex-row items-baseline justify-between">
            <Heading>{formatUnits(unitsOnHand)} units on hand</Heading>
            <Muted>{packs.length} {packs.length === 1 ? 'pack' : 'packs'}</Muted>
          </View>
          {packs.length === 0 ? <Muted>No packs recorded. Add the packs you have at home.</Muted> : null}
          {packs.map((pack) => (
            <View key={pack.id} className="flex-row items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <View className="flex-1 gap-0.5">
                <Body className="font-semibold">
                  {formatUnits(pack.units_remaining)} / {formatUnits(pack.units_per_pack)} units
                </Body>
                <Muted>
                  {pack.expiry_date ? `Expires ${formatDate(pack.expiry_date)}` : 'No expiry'}
                  {pack.batch ? ` · Batch ${pack.batch}` : ''}
                </Muted>
              </View>
              <View className="flex-row items-center gap-1">
                <StepButton label="−" onPress={() => adjustPack(pack, -1)} disabled={pack.units_remaining <= 0} />
                <StepButton label="+" onPress={() => adjustPack(pack, 1)} disabled={pack.units_remaining >= pack.units_per_pack} />
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Prescribed dose" action={{ label: schedule ? 'Update' : 'Enter', onPress: () => go('dose') }}>
        <Card className="gap-2">
          {schedule ? (
            <>
              <Heading>
                {formatUnits(schedule.units_per_intake)} × {formatUnits(schedule.intakes_per_period)} per {schedule.period}
                {schedule.is_prn ? ' (as needed)' : ''}
              </Heading>
              <Muted>
                {formatUnits(daily)} units per day · since {formatDate(schedule.valid_from)}
                {schedule.source === 'emediplan' ? ' · from eMediplan' : ''}
              </Muted>
              {history.length > 1 ? <Muted>{history.length - 1} earlier {history.length === 2 ? 'entry' : 'entries'} kept in history</Muted> : null}
            </>
          ) : (
            <Muted>Enter the dose exactly as prescribed. It is used only to forecast your supply.</Muted>
          )}
        </Card>
      </Section>

      <Section title="Prescriptions" action={{ label: 'Add', onPress: () => go('prescription') }}>
        {prescriptions.length === 0 ? (
          <Card>
            <Muted>No prescription recorded. The prescription runway needs one.</Muted>
          </Card>
        ) : (
          <View className="gap-2">
            {prescriptions.map((rx, index) => {
              const remaining = refillsRemaining(rx);
              const issuer = rx.provider_id ? providerById.get(rx.provider_id)?.name : null;
              return (
                <Card key={rx.id} className={index > 0 ? 'opacity-60' : ''}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-0.5">
                      <Body className="font-semibold">
                        {rx.type === 'standing' ? 'Standing prescription' : 'Single prescription'}
                        {index === 0 ? '' : ' (older)'}
                      </Body>
                      <Muted>
                        Issued {formatDate(rx.issued_at)}
                        {rx.valid_until ? ` · valid until ${formatDate(rx.valid_until)}` : ' · no expiry'}
                      </Muted>
                      <Muted>
                        {remaining === null ? 'Unlimited refills' : `${remaining} refill${remaining === 1 ? '' : 's'} left`}
                        {issuer ? ` · ${issuer}` : ''}
                      </Muted>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Section>

      <Button title="Edit medication" variant="secondary" onPress={() => go('edit')} />
    </Screen>
  );
}

function ForecastRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Muted>{label}</Muted>
      <Body className="font-semibold">{value}</Body>
    </View>
  );
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`h-9 w-9 items-center justify-center rounded-full border border-brand-600 ${disabled ? 'opacity-30' : 'active:bg-brand-50'}`}>
      <Body className="text-lg font-bold text-brand-700">{label}</Body>
    </Pressable>
  );
}
