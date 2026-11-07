import Feather from '@expo/vector-icons/Feather';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { badgeToneFor } from '@/components/MedicationCard';
import { Badge, Body, Button, Card, Collapsible, Heading, Muted, Screen } from '@/components/ui';
import {
  dailyUnits,
  type DbClient,
  type DosePeriod,
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
import { useI18n } from '@/lib/i18n';
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
  const { t } = useI18n();
  const { data, loading, reload } = useDbQuery((d) => loadDetail(d, id, profile.id), [id, profile.id]);
  const sections = useOpenSections();

  if (!data?.medication) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>{t('medication.notFound')}</Muted>}
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

  const go = (screen: 'edit' | 'pack' | 'dose' | 'prescription') =>
    router.push({ pathname: `/medication/[id]/${screen}`, params: { id } });

  const periodWord = (period: DosePeriod) => (period === 'week' ? t('medication.periodWeek') : t('medication.periodDay'));
  const doseText = (entry: { units_per_intake: number; intakes_per_period: number; period: DosePeriod; is_prn: number }) =>
    `${t('medication.doseLine', { units: formatUnits(entry.units_per_intake), times: formatUnits(entry.intakes_per_period), period: periodWord(entry.period) })}${
      entry.is_prn ? ` ${t('medication.asNeeded')}` : ''
    }`;

  const doseLine = schedule ? doseText(schedule) : t('medication.doseNotEntered');
  const supplyLine =
    packs.length === 0
      ? t('medication.noPacks')
      : t('medication.unitsAndRunway', { units: formatUnits(unitsOnHand), runway: runway === null ? t('medication.noDose') : t('common.days', { count: runway }) });
  const rxRefills = currentRx ? refillsRemaining(currentRx) : null;
  const rxSummary = !currentRx
    ? t('medication.rxNone')
    : `${currentRx.type === 'standing' ? t('medication.rxStanding') : t('medication.rxSingle')} · ${
        currentRx.valid_until ? t('medication.rxValidUntil', { date: formatDate(currentRx.valid_until) }) : t('medication.rxNoExpiry')
      } · ${rxRefills === null ? t('medication.rxUnlimited') : t('medication.rxRefillsLeft', { count: rxRefills })}`;
  const forecastSummary = `${t('medication.forecastSummary', { lead: forecast.lead_time_days, buffer: forecast.safety_buffer_days })}${
    forecast.pill_runout_date ? ` · ${t('medication.runsOut', { date: formatDate(forecast.pill_runout_date) })}` : ''
  }`;
  const historySummary = schedule
    ? `${t('medication.historySince', { date: formatDate(schedule.valid_from) })}${history.length > 1 ? ` · ${t('medication.historyEarlier', { count: history.length - 1 })}` : ''}`
    : t('medication.noDoseYet');

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: medication.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} onPress={() => go('edit')} hitSlop={8}>
              <Feather name="edit-2" size={20} color="#fff" style={{ marginRight: 16 }} />
            </Pressable>
          ),
        }}
      />

      {/* At a glance */}
      <Card className="gap-4">
        <View className="gap-1">
          <View className="flex-row flex-wrap gap-2">
            {medication.is_critical ? <Badge text={t('common.critical')} tone="critical" /> : null}
            {forecast.shortage ? <Badge text={t('medication.shortageReported')} tone="warn" /> : null}
            {openRequest ? <Badge text={t('medication.orderOpen')} tone="brand" /> : null}
          </View>
          <Muted>
            {[medication.active_ingredient, medication.strength, medication.form].filter(Boolean).join(' · ') || t('medication.noDetails')}
            {preferred ? ` · ${preferred.name}` : ''}
          </Muted>
        </View>

        <View className="flex-row gap-3">
          <Fact label={t('medication.dailyDose')} value={doseLine} onPress={() => go('dose')} />
          <Fact label={t('medication.onHand')} value={supplyLine} />
        </View>
        <View className="gap-1">
          <Muted className="text-xs font-semibold uppercase tracking-wide">{t('medication.nextStep')}</Muted>
          <View className="flex-row items-center gap-2">
            <Badge text={describeAction(forecast)} tone={badgeToneFor(forecast)} />
          </View>
          {forecast.shortage && shortage?.status ? <Muted>{shortage.status}</Muted> : null}
        </View>

        {openRequest ? (
          <Button title={t('medication.viewOpenReorder')} variant="secondary" onPress={() => router.push({ pathname: '/order/[id]', params: { id: openRequest.batch_id } })} />
        ) : (
          <Button title={t('medication.reorder')} onPress={() => router.push({ pathname: '/reorder', params: { medicationId: id } })} />
        )}
      </Card>

      <Collapsible
        title={t('medication.supply')}
        summary={supplyLine}
        expanded={sections.isOpen('supply')}
        onToggle={() => sections.toggle('supply')}
        action={{ label: t('medication.addPack'), onPress: () => go('pack') }}>
        {packs.length === 0 ? <Muted>{t('medication.addPacksHint')}</Muted> : null}
        {packs.map((pack, index) => (
          <View key={pack.id} className={`flex-row items-center justify-between gap-3 ${index > 0 ? 'border-t border-neutral-100 pt-3 dark:border-neutral-800' : ''}`}>
            <View className="flex-1 gap-0.5">
              <Body className="font-semibold">{t('medication.packUnits', { remaining: formatUnits(pack.units_remaining), size: formatUnits(pack.units_per_pack) })}</Body>
              <Muted>
                {pack.expiry_date ? t('medication.expires', { date: formatDate(pack.expiry_date) }) : t('medication.noExpiry')}
                {pack.batch ? ` · ${t('medication.batchLabel', { batch: pack.batch })}` : ''}
              </Muted>
            </View>
            <View className="flex-row items-center gap-1">
              <StepButton label="−" onPress={() => adjustPack(pack, -1)} disabled={pack.units_remaining <= 0} />
              <StepButton label="+" onPress={() => adjustPack(pack, 1)} disabled={pack.units_remaining >= pack.units_per_pack} />
            </View>
          </View>
        ))}
      </Collapsible>

      <Collapsible
        title={t('medication.prescription')}
        summary={rxSummary}
        expanded={sections.isOpen('prescription')}
        onToggle={() => sections.toggle('prescription')}
        action={{ label: t('common.add'), onPress: () => go('prescription') }}>
        {prescriptions.length === 0 ? <Muted>{t('medication.noPrescriptionHint')}</Muted> : null}
        {prescriptions.map((rx, index) => {
          const remaining = refillsRemaining(rx);
          const issuer = rx.provider_id ? providerById.get(rx.provider_id)?.name : null;
          return (
            <View key={rx.id} className={`gap-0.5 ${index > 0 ? 'border-t border-neutral-100 pt-3 opacity-60 dark:border-neutral-800' : ''}`}>
              <Body className="font-semibold">
                {rx.type === 'standing' ? t('medication.standingPrescription') : t('medication.singlePrescription')}
                {index === 0 ? '' : ` ${t('medication.older')}`}
              </Body>
              <Muted>
                {t('medication.issued', { date: formatDate(rx.issued_at) })}
                {rx.valid_until ? ` · ${t('medication.rxValidUntil', { date: formatDate(rx.valid_until) })}` : ` · ${t('medication.rxNoExpiry')}`}
              </Muted>
              <Muted>
                {remaining === null ? t('medication.unlimitedRefills') : t('medication.rxRefillsLeft', { count: remaining })}
                {issuer ? ` · ${issuer}` : ''}
              </Muted>
            </View>
          );
        })}
      </Collapsible>

      <Collapsible title={t('medication.forecast')} summary={forecastSummary} expanded={sections.isOpen('forecast')} onToggle={() => sections.toggle('forecast')}>
        <ForecastRow label={t('medication.pillRunway')} value={describePillRunway(forecast)} />
        <ForecastRow label={t('medication.prescriptionRunway')} value={describePrescriptionRunway(forecast)} />
        <ForecastRow label={t('medication.margin')} value={t('medication.marginValue', { lead: forecast.lead_time_days, buffer: forecast.safety_buffer_days })} />
        {forecast.reorder_by ? <ForecastRow label={t('medication.reorderBy')} value={formatDate(forecast.reorder_by)} /> : null}
        {forecast.renewal_by ? <ForecastRow label={t('medication.renewBy')} value={formatDate(forecast.renewal_by)} /> : null}
        <Muted>{t('medication.forecastHint')}</Muted>
      </Collapsible>

      <Collapsible
        title={t('medication.doseHistory')}
        summary={historySummary}
        expanded={sections.isOpen('history')}
        onToggle={() => sections.toggle('history')}
        action={{ label: schedule ? t('medication.update') : t('medication.enter'), onPress: () => go('dose') }}>
        {history.length === 0 ? <Muted>{t('medication.historyHint')}</Muted> : null}
        {history.map((entry, index) => (
          <View key={entry.id} className={`gap-0.5 ${index > 0 ? 'border-t border-neutral-100 pt-3 dark:border-neutral-800' : ''}`}>
            <Body className={index === 0 && entry.id === schedule?.id ? 'font-semibold' : ''}>{doseText(entry)}</Body>
            <Muted>
              {formatDate(entry.valid_from)}
              {entry.valid_to ? ` ${t('medication.to', { date: formatDate(entry.valid_to) })}` : ` ${t('medication.onwards')}`}
              {entry.source === 'emediplan' ? ` · ${t('medication.fromEmediplan')}` : ''}
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
