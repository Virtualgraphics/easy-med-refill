import Feather from '@expo/vector-icons/Feather';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { Body, Button, Card, Muted, Screen, Section, Segmented, TextField } from '@/components/ui';
import { ApiError, isStubMode, submitReorder } from '@/lib/api';
import {
  addDays,
  createReorderBatch,
  type DbClient,
  effectiveLeadTimeDays,
  formatUnits,
  getShortageForMedication,
  getSupplyOverview,
  isIsoDate,
  listProviders,
  listShortageMatchedMedicationIds,
  markBatchSent,
  type MedicationSupply,
  refillsRemaining,
  type ReorderLanguage,
  setBatchMessage,
  todayIso,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { LOCALE_NAMES, LOCALES, useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';
import { buildReorderPayload, type ReorderItemInput, renderReorderMessage, requestReference, suggestReorder } from '@/lib/reorder';
import { describeAction, forecastAll, type SupplyForecast } from '@/lib/supply';

interface Row {
  supply: MedicationSupply;
  forecast: SupplyForecast;
  shortageStatus: string | null;
}

/** Statuses that make a medication a natural candidate for the next order. */
const DUE_STATUSES: readonly SupplyForecast['status'][] = ['due_soon', 'due', 'overdue', 'out'];

async function loadReorder(db: DbClient, profileId: string) {
  const [overview, providers, shortageIds] = await Promise.all([
    getSupplyOverview(db, profileId),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
  ]);
  const forecasts = forecastAll(overview, providers, { shortageMedicationIds: shortageIds });
  const rows: Row[] = [];
  let onOrder = 0;
  for (const [index, supply] of overview.entries()) {
    if (supply.open_request) {
      onOrder++;
      continue;
    }
    const forecast = forecasts[index];
    const shortage = forecast.shortage ? await getShortageForMedication(db, supply.medication.id) : null;
    rows.push({ supply, forecast, shortageStatus: shortage?.status ?? null });
  }
  // Due first (earliest action date), then everything else by name.
  const dueKey = (r: Row) => (DUE_STATUSES.includes(r.forecast.status) ? (r.forecast.action_by ?? '0000-00-00') : '9999-99-99');
  rows.sort((a, b) => {
    const ka = dueKey(a);
    const kb = dueKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.supply.medication.name.localeCompare(b.supply.medication.name);
  });
  return { rows, providers, onOrder };
}

export default function ReorderScreen() {
  const { medicationId } = useLocalSearchParams<{ medicationId?: string }>();
  const router = useRouter();
  const db = useDb();
  const { t, locale } = useI18n();
  const { profile } = useProfile();
  const { data, loading } = useDbQuery((d) => loadReorder(d, profile.id), [profile.id]);

  const [providerId, setProviderId] = useState('');
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [neededBy, setNeededBy] = useState('');
  const [neededByTouched, setNeededByTouched] = useState(false);
  const [note, setNote] = useState('');
  const [language, setLanguage] = useState<ReorderLanguage>(locale);
  const [initialised, setInitialised] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestReorder>>();
    for (const row of data?.rows ?? []) map.set(row.supply.medication.id, suggestReorder(row.supply, row.forecast));
    return map;
  }, [data]);

  // Preselect the medication the user came from plus everything that is due
  // and goes to the same supplier.
  useEffect(() => {
    if (initialised || !data) return;
    const start = data.rows.find((r) => r.supply.medication.id === medicationId) ?? null;
    const preferred =
      start?.supply.medication.preferred_provider_id ?? start?.supply.prescription?.provider_id ?? data.providers[0]?.id ?? '';
    setProviderId(preferred);
    const initial = new Map<string, number>();
    for (const row of data.rows) {
      const med = row.supply.medication;
      const sameSupplier = !med.preferred_provider_id || med.preferred_provider_id === preferred;
      if (med.id === medicationId || (sameSupplier && DUE_STATUSES.includes(row.forecast.status))) {
        initial.set(med.id, suggestions.get(med.id)?.quantity_packs ?? 1);
      }
    }
    setQuantities(initial);
    setInitialised(true);
  }, [data, initialised, medicationId, suggestions]);

  const selectedRows = useMemo(() => (data?.rows ?? []).filter((r) => quantities.has(r.supply.medication.id)), [data, quantities]);

  // Earliest suggested date among the selection, until the user edits it.
  useEffect(() => {
    if (neededByTouched) return;
    let earliest: string | null = null;
    for (const row of selectedRows) {
      const d = suggestions.get(row.supply.medication.id)?.needed_by ?? null;
      if (d && (!earliest || d < earliest)) earliest = d;
    }
    setNeededBy(earliest ?? '');
  }, [selectedRows, suggestions, neededByTouched]);

  const provider = useMemo(() => data?.providers.find((p) => p.id === providerId) ?? null, [data, providerId]);

  const toggle = (id: string) =>
    setQuantities((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, suggestions.get(id)?.quantity_packs ?? 1);
      return next;
    });

  const adjust = (id: string, delta: number) =>
    setQuantities((current) => {
      const next = new Map(current);
      next.set(id, Math.min(99, Math.max(1, (next.get(id) ?? 1) + delta)));
      return next;
    });

  const messageItems = (): ReorderItemInput[] =>
    selectedRows.map(({ supply, forecast, shortageStatus }) => ({
      medication: {
        name: supply.medication.name,
        strength: supply.medication.strength,
        form: supply.medication.form,
        gtin: supply.medication.gtin,
        pharmacode: supply.medication.pharmacode,
      },
      packSize: supply.last_pack_size,
      quantityPacks: quantities.get(supply.medication.id) ?? 1,
      unitsRemaining: supply.units_on_hand,
      runoutDate: forecast.pill_runout_date,
      prescription: {
        status: forecast.prescription_status,
        validUntil: forecast.prescription_end_date,
        refillsRemaining: supply.prescription ? refillsRemaining(supply.prescription) : null,
      },
      shortage: forecast.shortage ? { status: shortageStatus } : null,
    }));

  const preview = useMemo(() => {
    if (!provider || selectedRows.length === 0) return null;
    return renderReorderMessage({
      language,
      providerKind: provider.kind,
      patientReference: profile.patient_reference,
      items: messageItems(),
      neededBy: isIsoDate(neededBy) ? neededBy : null,
      note: note.trim() || null,
      reference: '…',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, selectedRows, quantities, neededBy, note, language, profile.patient_reference]);

  if (!data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">{loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>{t('orders.nothingToOrder')}</Muted>}</View>
      </Screen>
    );
  }

  if (data.providers.length === 0) {
    return (
      <Screen scroll>
        <Card className="gap-3">
          <Body className="font-semibold">{t('orders.addSupplierFirst')}</Body>
          <Muted>{t('orders.addSupplierFirstBody')}</Muted>
          <Button title={t('orders.addSupplier')} onPress={() => router.push('/provider/new')} />
        </Card>
      </Screen>
    );
  }

  const approve = async () => {
    if (!provider) return Alert.alert(t('orders.chooseSupplier'));
    if (!provider.email) return Alert.alert(t('orders.noEmailTitle'), t('orders.noEmailBody', { name: provider.name }));
    if (selectedRows.length === 0) return Alert.alert(t('orders.nothingSelected'), t('orders.nothingSelectedBody'));
    if (!isIsoDate(neededBy)) return Alert.alert(t('orders.neededByLabel'), t('common.dateInvalid'));
    if (!preview) return;

    setSaving(true);
    try {
      const rows = await createReorderBatch(
        db,
        {
          provider_id: provider.id,
          items: selectedRows.map(({ supply }) => ({
            medication_id: supply.medication.id,
            prescription_id: supply.prescription?.id ?? null,
            quantity_packs: quantities.get(supply.medication.id) ?? 1,
            units_remaining_at_request: supply.units_on_hand,
            needed_by: neededBy,
          })),
          note: note.trim() || null,
          language,
          message_subject: preview.subject,
          message_body: '',
        },
        { approve: true },
      );
      const batchId = rows[0].batch_id;
      // Render once more with the real reference and store it with the batch.
      const message = renderReorderMessage({
        language,
        providerKind: provider.kind,
        patientReference: profile.patient_reference,
        items: messageItems(),
        neededBy,
        note: note.trim() || null,
        reference: requestReference(batchId),
      });
      await setBatchMessage(db, batchId, message);

      try {
        const payload = buildReorderPayload(
          { batch_id: batchId, language, message_subject: message.subject, message_body: message.body },
          rows.map((request) => ({ request, medication: selectedRows.find((r) => r.supply.medication.id === request.medication_id)!.supply.medication })),
          provider,
          profile,
        );
        const result = await submitReorder(payload);
        await markBatchSent(db, batchId, {
          server_reference: result.reference,
          expected_by: addDays(todayIso(), Math.round(effectiveLeadTimeDays(provider))),
        });
      } catch (e) {
        const reason = e instanceof ApiError ? e.message : t('common.unknownError');
        Alert.alert(t('orders.savedNotSent'), t('orders.savedNotSentBody', { reason }));
      }
      router.replace({ pathname: '/order/[id]', params: { id: batchId } });
    } finally {
      setSaving(false);
    }
  };

  const count = selectedRows.length;
  const title = count === 0 ? t('orders.approveSend') : t('orders.approveSendCount', { medications: t('common.medications', { count }) });

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('orders.newOrderTitle') }} />

      <Card className="gap-4">
        <Segmented label={t('orders.sendTo')} options={data.providers.map((p) => ({ value: p.id, label: p.name }))} value={providerId} onChange={setProviderId} />
        {provider && !provider.email ? <Muted className="text-status-critical">{t('orders.supplierNoEmail')}</Muted> : null}
        {provider ? <Muted>{t('orders.leadTimeLine', { days: t('common.days', { count: Math.round(effectiveLeadTimeDays(provider)) }) })}</Muted> : null}
        {!profile.patient_reference ? <Muted className="text-amber-700">{t('orders.noPatientReference')}</Muted> : null}
      </Card>

      <Section title={t('orders.medications')}>
        <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {data.rows.length === 0 ? (
            <View className="p-4">
              <Muted>{data.onOrder > 0 ? t('orders.everythingOnOrder') : t('orders.noMedicationsYet')}</Muted>
            </View>
          ) : null}
          {data.rows.map((row, index) => {
            const med = row.supply.medication;
            const selected = quantities.has(med.id);
            const qty = quantities.get(med.id) ?? 0;
            const packLabel = row.supply.last_pack_size ? t('orders.packsOf', { size: formatUnits(row.supply.last_pack_size) }) : t('orders.packsPlain');
            return (
              <View key={med.id} className={index > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggle(med.id)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-brand-50 dark:active:bg-neutral-800">
                  <Feather name={selected ? 'check-square' : 'square'} size={22} color={selected ? '#005BAA' : '#A3A3A3'} />
                  <View className="flex-1 gap-0.5">
                    <Body className="font-semibold">{med.name}</Body>
                    <Muted numberOfLines={1}>
                      {[
                        med.strength && !med.name.toLowerCase().includes(med.strength.toLowerCase()) ? med.strength : null,
                        t('orders.onHand', { units: formatUnits(row.supply.units_on_hand) }),
                        describeAction(row.forecast),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Muted>
                  </View>
                  {selected ? (
                    <View className="flex-row items-center gap-2">
                      <StepButton label="−" onPress={() => adjust(med.id, -1)} disabled={qty <= 1} />
                      <Text className="w-5 text-center text-base font-semibold text-neutral-900 dark:text-neutral-50">{qty}</Text>
                      <StepButton label="+" onPress={() => adjust(med.id, 1)} disabled={qty >= 99} />
                    </View>
                  ) : null}
                </Pressable>
                {selected ? (
                  <View className="px-4 pb-2 pl-14 -mt-1">
                    <Muted>{packLabel}</Muted>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        {data.onOrder > 0 ? (
          <Muted className="mt-2">{t('orders.alreadyOnOrder', { count: data.onOrder })}</Muted>
        ) : null}
      </Section>

      <Card className="gap-4">
        <TextField
          label={t('orders.neededByLabel')}
          value={neededBy}
          onChangeText={(v) => {
            setNeededByTouched(true);
            setNeededBy(v);
          }}
          placeholder={t('common.dateFormatHint')}
        />
        <TextField label={t('orders.noteToSupplier')} value={note} onChangeText={setNote} placeholder={t('common.optional')} multiline />
        <Segmented
          label={t('orders.language')}
          options={LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))}
          value={language}
          onChange={setLanguage}
        />
      </Card>

      {preview ? (
        <Section title={t('orders.messagePreview')}>
          <Card className="gap-2">
            <Body className="font-semibold">{preview.subject}</Body>
            <Text className="font-mono text-xs leading-5 text-neutral-800 dark:text-neutral-200">{preview.body}</Text>
            <Muted>{t('orders.fixedTemplate')}</Muted>
          </Card>
        </Section>
      ) : null}

      <Button title={isStubMode() ? t('orders.approveLocal') : title} onPress={approve} loading={saving} disabled={count === 0} />
    </Screen>
  );
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`h-8 w-8 items-center justify-center rounded-full border border-brand-600 ${disabled ? 'opacity-30' : 'active:bg-brand-50'}`}>
      <Text className="text-base font-bold text-brand-700">{label}</Text>
    </Pressable>
  );
}
