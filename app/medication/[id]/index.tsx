import Feather from '@expo/vector-icons/Feather';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { badgeToneFor } from '@/components/MedicationCard';
import { Badge, Body, Button, Card, Collapsible, Heading, Muted, Screen } from '@/components/ui';
import {
  dailyUnits,
  type DbClient,
  formatDate,
  formatUnits,
  getActiveDoseSchedule,
  getMedication,
  getOpenReorderRequest,
  getShortageForMedication,
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
import { useOpenSections } from '@/lib/hooks/useOpenSections';
import { useProfile } from '@/lib/profile/ProfileContext';
import { pillRunwayDays } from '@/lib/supply';
import { describeAction, describePillRunway, describePrescriptionRunway, forecastAll } from '@/lib/supply';

async function loadDetail(db: DbClient, id: string, profileId: string) {
  const [medication, packs, schedule, history, prescriptions, providers, shortages, openRequest, shortage] = await Promise.all([
    getMedication(db, id),
    listPacks(db, id),
    getActiveDoseSchedule(db, id),
    listDoseScheduleHistory(db, id),
    listPrescriptions(db, id),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
    getOpenReorderRequest(db, id),
    getShortageForMedication(db, id),
  ]);
  return { medication, packs, schedule, history, prescriptions, providers, shortages, openRequest, shortage };
}

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { data, loading, reload } = useDbQuery((d) => loadDetail(d, id, profile.id), [id, profile.id]);
  const sections = useOpenSections();

  if (!data?.medication) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>Medication not found.</Muted>}
        </View>
      </Screen>
    );
  }

  const { medication, packs, schedule, history, prescriptions, providers, shortages, openRequest, shortage } = data;
  const providerById = new Map(providers.map((p) => [p.id, p] as [string, ProviderRow]));
  const unitsOnHand = packs.reduce((sum, p) => sum + p.units_remaining, 0);
  const daily = schedule ? dailyUnits(schedule) : null;
  const runway = pillRunwayDays(unitsOnHand, daily);
  const preferred = medication.preferred_provider_id ? providerById.get(medication.preferred_provider_id) : undefined;
  const currentRx = prescriptions[0] ?? null;

  const supply: MedicationSupply = {
    medication,
    units_on_hand: unitsOnHand,
    pack_count: packs.length,
    next_expiry: packs.find((p) => p.expiry_date)?.expiry_date ?? null,
    last_pack_size: [...packs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]?.units_per_pack ?? null,
    schedule,
    daily_units: daily,
    prescription: currentRx,
    open_request: openRequest,
  };
  const [forecast] = forecastAll([supply], providers, { shortageMedicationIds: shortages });

  const adjustPack = async (pack: PackRow, delta: number) => {
    await setPackUnitsRemaining(db, pack.id, pack.units_remaining + delta);
    await reload();
  };

  const go = (screen: 'edit' | 'pack' | 'dose' | 'prescription' | 'reorder') =>
    router.push({ pathname: `/medication/[id]/${screen}`, params: { id } });

  const doseLine = schedule
    ? `${formatUnits(schedule.units_per_intake)} × ${formatUnits(schedule.intakes_per_period)} per ${schedule.period}${schedule.is_prn ? ' (as needed)' : ''}`
    : 'Not entered';
  const supplyLine =
    packs.length === 0
      ? 'No packs recorded'
      : `${formatUnits(unitsOnHand)} units · ${runway === null ? 'no dose' : `${runway} ${runway === 1 ? 'day' : 'days'}`}`;
  const rxSummary = !currentRx
    ? 'None recorded'
    : `${currentRx.type === 'standing' ? 'Standing' : 'Single'} · ${currentRx.valid_until ? `valid until ${formatDate(currentRx.valid_until)}` : 'no expiry'} · ${
        refillsRemaining(currentRx) === null ? 'unlimited refills' : `${refillsRemaining(currentRx)} refills left`
      }`;
  const forecastSummary = `${forecast.lead_time_days} days lead + ${forecast.safety_buffer_days} days buffer${
    forecast.pill_runout_date ? ` · runs out ${formatDate(forecast.pill_runout_date)}` : ''
  }`;
  const historySummary = schedule
    ? `Since ${formatDate(schedule.valid_from)}${history.length > 1 ? ` · ${history.length - 1} earlier ${history.length === 2 ? 'entry' : 'entries'}` : ''}`
    : 'No dose entered yet';

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: medication.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={() => go('edit')} hitSlop={8}>
              <Feather name="edit-2" size={20} color="#fff" style={{ marginRight: 16 }} />
            </Pressable>
          ),
        }}
      />

      {/* At a glance */}
      <Card className="gap-4">
        <View className="gap-1">
          <View className="flex-row flex-wrap gap-2">
            {medication.is_critical ? <Badge text="Critical" tone="critical" /> : null}
            {forecast.shortage ? <Badge text="Shortage reported" tone="warn" /> : null}
            {openRequest ? <Badge text="Order open" tone="brand" /> : null}
          </View>
          <Muted>
            {[medication.active_ingredient, medication.strength, medication.form].filter(Boolean).join(' · ') || 'No details recorded'}
            {preferred ? ` · ${preferred.name}` : ''}
          </Muted>
        </View>

        <View className="flex-row gap-3">
          <Fact label="Daily dose" value={doseLine} onPress={() => go('dose')} />
          <Fact label="On hand" value={supplyLine} />
        </View>
        <View className="gap-1">
          <Muted className="text-xs font-semibold uppercase tracking-wide">Next step</Muted>
          <View className="flex-row items-center gap-2">
            <Badge text={describeAction(forecast)} tone={badgeToneFor(forecast)} />
          </View>
          {forecast.shortage && shortage?.status ? <Muted>{shortage.status}</Muted> : null}
        </View>

        {openRequest ? (
          <Button title="View open reorder" variant="secondary" onPress={() => router.push({ pathname: '/order/[id]', params: { id: openRequest.id } })} />
        ) : (
          <Button title="Reorder" onPress={() => go('reorder')} />
        )}
      </Card>

      <Collapsible title="Supply" summary={supplyLine} expanded={sections.isOpen('supply')} onToggle={() => sections.toggle('supply')} action={{ label: 'Add pack', onPress: () => go('pack') }}>
        {packs.length === 0 ? <Muted>Add the packs you have at home; the stepper tracks what is left.</Muted> : null}
        {packs.map((pack, index) => (
          <View key={pack.id} className={`flex-row items-center justify-between gap-3 ${index > 0 ? 'border-t border-neutral-100 pt-3 dark:border-neutral-800' : ''}`}>
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
      </Collapsible>

      <Collapsible title="Prescription" summary={rxSummary} expanded={sections.isOpen('prescription')} onToggle={() => sections.toggle('prescription')} action={{ label: 'Add', onPress: () => go('prescription') }}>
        {prescriptions.length === 0 ? <Muted>No prescription recorded. The prescription runway needs one.</Muted> : null}
        {prescriptions.map((rx, index) => {
          const remaining = refillsRemaining(rx);
          const issuer = rx.provider_id ? providerById.get(rx.provider_id)?.name : null;
          return (
            <View key={rx.id} className={`gap-0.5 ${index > 0 ? 'border-t border-neutral-100 pt-3 opacity-60 dark:border-neutral-800' : ''}`}>
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
          );
        })}
      </Collapsible>

      <Collapsible title="Forecast" summary={forecastSummary} expanded={sections.isOpen('forecast')} onToggle={() => sections.toggle('forecast')}>
        <ForecastRow label="Pill runway" value={describePillRunway(forecast)} />
        <ForecastRow label="Prescription runway" value={describePrescriptionRunway(forecast)} />
        <ForecastRow label="Margin" value={`${forecast.lead_time_days} days lead time + ${forecast.safety_buffer_days} days safety buffer`} />
        {forecast.reorder_by ? <ForecastRow label="Reorder by" value={formatDate(forecast.reorder_by)} /> : null}
        {forecast.renewal_by ? <ForecastRow label="Renew prescription by" value={formatDate(forecast.renewal_by)} /> : null}
        <Muted>The buffer and preferred supplier can be changed under Edit.</Muted>
      </Collapsible>

      <Collapsible title="Dose history" summary={historySummary} expanded={sections.isOpen('history')} onToggle={() => sections.toggle('history')} action={{ label: schedule ? 'Update' : 'Enter', onPress: () => go('dose') }}>
        {history.length === 0 ? <Muted>Enter the dose exactly as prescribed. It is used only to forecast your supply.</Muted> : null}
        {history.map((entry, index) => (
          <View key={entry.id} className={`gap-0.5 ${index > 0 ? 'border-t border-neutral-100 pt-3 dark:border-neutral-800' : ''}`}>
            <Body className={index === 0 && entry.id === schedule?.id ? 'font-semibold' : ''}>
              {formatUnits(entry.units_per_intake)} × {formatUnits(entry.intakes_per_period)} per {entry.period}
              {entry.is_prn ? ' (as needed)' : ''}
            </Body>
            <Muted>
              {formatDate(entry.valid_from)}
              {entry.valid_to ? ` to ${formatDate(entry.valid_to)}` : ' onwards'}
              {entry.source === 'emediplan' ? ' · from eMediplan' : ''}
            </Muted>
          </View>
        ))}
      </Collapsible>

      {medication.notes ? (
        <Card>
          <Muted>{medication.notes}</Muted>
        </Card>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = (
    <>
      <Muted className="text-xs font-semibold uppercase tracking-wide">{label}</Muted>
      <Heading numberOfLines={2}>{value}</Heading>
    </>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} className="flex-1 gap-0.5 rounded-xl active:bg-brand-50 dark:active:bg-neutral-800">
        {content}
      </Pressable>
    );
  }
  return <View className="flex-1 gap-0.5">{content}</View>;
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
      <Text className="text-lg font-bold text-brand-700">{label}</Text>
    </Pressable>
  );
}
