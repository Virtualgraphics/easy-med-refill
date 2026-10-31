import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Body, Button, Card, Muted, Screen, Section, Segmented, TextField } from '@/components/ui';
import { ApiError, isStubMode, submitReorder } from '@/lib/api';
import {
  addDays,
  createReorderRequest,
  type DbClient,
  effectiveLeadTimeDays,
  formatDate,
  formatUnits,
  getShortageForMedication,
  getSupplyOverview,
  isIsoDate,
  listProviders,
  listShortageMatchedMedicationIds,
  markReorderSent,
  parseNumber,
  refillsRemaining,
  type ReorderLanguage,
  todayIso,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { buildReorderPayload, renderReorderMessage, requestReference, suggestReorder } from '@/lib/reorder';
import { forecastAll } from '@/lib/supply';

async function loadReorder(db: DbClient, profileId: string, medicationId: string) {
  const [overview, providers, shortages, shortage] = await Promise.all([
    getSupplyOverview(db, profileId),
    listProviders(db, profileId),
    listShortageMatchedMedicationIds(db, profileId),
    getShortageForMedication(db, medicationId),
  ]);
  const supply = overview.find((s) => s.medication.id === medicationId) ?? null;
  const forecast = supply ? forecastAll([supply], providers, { shortageMedicationIds: shortages })[0] : null;
  return { supply, forecast, providers, shortage };
}

export default function ReorderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { data, loading } = useDbQuery((d) => loadReorder(d, profile.id, id), [id, profile.id]);

  const [providerId, setProviderId] = useState<string>('');
  const [quantity, setQuantity] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [note, setNote] = useState('');
  const [language, setLanguage] = useState<ReorderLanguage>('de');
  const [initialised, setInitialised] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialised || !data?.supply || !data.forecast) return;
    const suggestion = suggestReorder(data.supply, data.forecast);
    setQuantity(String(suggestion.quantity_packs));
    setNeededBy(suggestion.needed_by);
    const preferred = data.supply.medication.preferred_provider_id ?? data.supply.prescription?.provider_id ?? data.providers[0]?.id ?? '';
    setProviderId(preferred);
    setInitialised(true);
  }, [data, initialised]);

  const provider = useMemo(() => data?.providers.find((p) => p.id === providerId) ?? null, [data, providerId]);

  const preview = useMemo(() => {
    if (!data?.supply || !data.forecast || !provider) return null;
    const q = parseNumber(quantity);
    return renderReorderMessage({
      language,
      providerKind: provider.kind,
      patientReference: profile.patient_reference,
      medication: {
        name: data.supply.medication.name,
        strength: data.supply.medication.strength,
        form: data.supply.medication.form,
        gtin: data.supply.medication.gtin,
        pharmacode: data.supply.medication.pharmacode,
      },
      packSize: data.supply.last_pack_size,
      quantityPacks: q && q > 0 ? Math.round(q) : 1,
      unitsRemaining: data.supply.units_on_hand,
      runoutDate: data.forecast.pill_runout_date,
      neededBy: isIsoDate(neededBy) ? neededBy : null,
      prescription: {
        status: data.forecast.prescription_status,
        validUntil: data.forecast.prescription_end_date,
        refillsRemaining: data.supply.prescription ? refillsRemaining(data.supply.prescription) : null,
      },
      shortage: data.forecast.shortage && data.shortage ? { status: data.shortage.status } : null,
      note: note.trim() || null,
      reference: '…',
    });
  }, [data, provider, quantity, neededBy, note, language, profile.patient_reference]);

  if (!data?.supply || !data.forecast) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>Medication not found.</Muted>}
        </View>
      </Screen>
    );
  }

  const { supply, forecast, providers } = data;

  if (supply.open_request) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: `Reorder ${supply.medication.name}` }} />
        <Card className="gap-3">
          <Body className="font-semibold">A request is already open</Body>
          <Muted>Finish or cancel it before starting another one for this medication.</Muted>
          <Button title="Open request" onPress={() => router.replace({ pathname: '/order/[id]', params: { id: supply.open_request!.id } })} />
        </Card>
      </Screen>
    );
  }

  if (providers.length === 0) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: `Reorder ${supply.medication.name}` }} />
        <Card className="gap-3">
          <Body className="font-semibold">Add a practice or pharmacy first</Body>
          <Muted>Reorders are sent to a supplier by email. Add one under Settings, then come back.</Muted>
          <Button title="Add supplier" onPress={() => router.push('/provider/new')} />
        </Card>
      </Screen>
    );
  }

  const approve = async () => {
    const q = parseNumber(quantity);
    if (!provider) return Alert.alert('Choose a supplier');
    if (!provider.email) return Alert.alert('No email address', `${provider.name} has no email address. Add one under Settings.`);
    if (q === null || q < 1 || !Number.isInteger(q)) return Alert.alert('Quantity', 'Enter a whole number of packs.');
    if (!isIsoDate(neededBy)) return Alert.alert('Needed by', 'Use the format YYYY-MM-DD.');
    if (!preview) return;

    setSaving(true);
    try {
      const request = await createReorderRequest(
        db,
        {
          medication_id: supply.medication.id,
          provider_id: provider.id,
          prescription_id: supply.prescription?.id ?? null,
          quantity_packs: q,
          units_remaining_at_request: supply.units_on_hand,
          needed_by: neededBy,
          note: note.trim() || null,
          language,
          message_subject: preview.subject,
          message_body: '',
        },
        { approve: true },
      );
      // Render once more with the real reference and store it with the request.
      const message = renderReorderMessage({ ...previewInput(), reference: requestReference(request.id) });
      await db.runAsync('UPDATE reorder_requests SET message_subject = ?, message_body = ? WHERE id = ?', [message.subject, message.body, request.id]);
      const stored = { ...request, message_subject: message.subject, message_body: message.body };

      try {
        const result = await submitReorder(buildReorderPayload(stored, supply.medication, provider, profile));
        await markReorderSent(db, request.id, {
          server_reference: result.reference,
          expected_by: addDays(todayIso(), Math.round(effectiveLeadTimeDays(provider))),
        });
      } catch (e) {
        const reason = e instanceof ApiError ? e.message : 'Unknown error';
        Alert.alert('Saved, not sent yet', `${reason} The request is kept and can be sent from the Orders tab.`);
      }
      router.replace({ pathname: '/order/[id]', params: { id: request.id } });
    } finally {
      setSaving(false);
    }
  };

  function previewInput() {
    return {
      language,
      providerKind: provider!.kind,
      patientReference: profile.patient_reference,
      medication: {
        name: supply.medication.name,
        strength: supply.medication.strength,
        form: supply.medication.form,
        gtin: supply.medication.gtin,
        pharmacode: supply.medication.pharmacode,
      },
      packSize: supply.last_pack_size,
      quantityPacks: Math.round(parseNumber(quantity) ?? 1),
      unitsRemaining: supply.units_on_hand,
      runoutDate: forecast.pill_runout_date,
      neededBy: isIsoDate(neededBy) ? neededBy : null,
      prescription: {
        status: forecast.prescription_status,
        validUntil: forecast.prescription_end_date,
        refillsRemaining: supply.prescription ? refillsRemaining(supply.prescription) : null,
      },
      shortage: forecast.shortage && data?.shortage ? { status: data.shortage.status } : null,
      note: note.trim() || null,
    };
  }

  const packsLabel = supply.last_pack_size ? `Packs of ${formatUnits(supply.last_pack_size)} units` : 'Packs';

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: `Reorder ${supply.medication.name}` }} />

      <Card className="gap-1">
        <Body className="font-semibold">
          {formatUnits(supply.units_on_hand)} units on hand
          {forecast.pill_runout_date ? ` · runs out ${formatDate(forecast.pill_runout_date)}` : ''}
        </Body>
        <Muted>
          {supply.daily_units !== null ? `${formatUnits(supply.daily_units)} per day. ` : ''}
          Suggested: enough for about 90 days after delivery.
        </Muted>
        {!profile.patient_reference ? <Muted className="text-amber-700">No patient reference set. Add one under Settings so the practice can match the request.</Muted> : null}
        {forecast.shortage ? (
          <Muted className="text-amber-700">
            A shortage is reported for this product. The message tells the supplier and asks for early handling.
          </Muted>
        ) : null}
      </Card>

      <Card className="gap-4">
        <Segmented label="Send to" options={providers.map((p) => ({ value: p.id, label: p.name }))} value={providerId} onChange={setProviderId} />
        {provider && !provider.email ? <Muted className="text-status-critical">This supplier has no email address.</Muted> : null}
        {provider ? <Muted>Typical lead time {Math.round(effectiveLeadTimeDays(provider))} days.</Muted> : null}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label={packsLabel} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          </View>
          <View className="flex-1">
            <TextField label="Needed by" value={neededBy} onChangeText={setNeededBy} placeholder="YYYY-MM-DD" />
          </View>
        </View>
        <TextField label="Note to the supplier" value={note} onChangeText={setNote} placeholder="optional" multiline />
        <Segmented
          label="Language"
          options={[
            { value: 'de', label: 'Deutsch' },
            { value: 'en', label: 'English' },
          ]}
          value={language}
          onChange={setLanguage}
        />
      </Card>

      {preview ? (
        <Section title="Message preview">
          <Card className="gap-2">
            <Body className="font-semibold">{preview.subject}</Body>
            <Text className="font-mono text-xs leading-5 text-neutral-800 dark:text-neutral-200">{preview.body}</Text>
            <Muted>Fixed template; only the values change. Nothing is sent until you approve.</Muted>
          </Card>
        </Section>
      ) : null}

      <Button title={isStubMode() ? 'Approve (no server: tracked locally)' : 'Approve and send'} onPress={approve} loading={saving} />
    </Screen>
  );
}
