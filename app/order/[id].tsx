import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { OrderStatusBadge } from '@/components/OrderStatus';
import { Body, Button, Card, Muted, Screen, Section } from '@/components/ui';
import { ApiError, isStubMode, submitReorder } from '@/lib/api';
import {
  addDays,
  cancelReorderRequest,
  type DbClient,
  effectiveLeadTimeDays,
  formatDate,
  getMedication,
  getProvider,
  getReorderRequest,
  markReorderConfirmed,
  markReorderReceived,
  markReorderSent,
  recordFollowUp,
  todayIso,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { buildReorderPayload, requestReference } from '@/lib/reorder';

async function loadOrder(db: DbClient, id: string) {
  const request = await getReorderRequest(db, id);
  if (!request) return null;
  const [medication, provider] = await Promise.all([getMedication(db, request.medication_id), getProvider(db, request.provider_id)]);
  return { request, medication, provider };
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { data, loading, reload } = useDbQuery((d) => loadOrder(d, id), [id]);
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>Request not found.</Muted>}
        </View>
      </Screen>
    );
  }

  const { request, medication, provider } = data;

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const sendNow = () =>
    act('send', async () => {
      if (!medication || !provider) throw new Error('Medication or supplier is missing.');
      const result = await submitReorder(buildReorderPayload(request, medication, provider, profile));
      await markReorderSent(db, request.id, {
        server_reference: result.reference,
        expected_by: addDays(todayIso(), Math.round(effectiveLeadTimeDays(provider))),
      });
    });

  const confirm = () => act('confirm', () => markReorderConfirmed(db, request.id).then(() => undefined));

  const received = () =>
    act('received', async () => {
      await markReorderReceived(db, request.id);
      Alert.alert('Received', 'Add the delivered packs to your stock now?', [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Add packs',
          onPress: () =>
            router.replace({ pathname: '/medication/[id]/pack', params: { id: request.medication_id, gtin: medication?.gtin ?? '' } }),
        },
      ]);
    });

  const followUp = () =>
    act('followup', async () => {
      await recordFollowUp(db, request.id);
      Alert.alert('Follow-up noted', 'Automatic follow-up emails are sent by the server once it is connected. The count is tracked here.');
    });

  const cancel = () =>
    Alert.alert('Cancel this request?', 'The practice or pharmacy is not notified automatically.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => act('cancel', () => cancelReorderRequest(db, request.id).then(() => undefined)) },
    ]);

  const timeline: { label: string; at: string | null }[] = [
    { label: 'Created', at: request.created_at },
    { label: 'Approved', at: request.approved_at },
    { label: 'Sent', at: request.sent_at },
    { label: 'Confirmed', at: request.confirmed_at },
    { label: 'Marked overdue', at: request.overdue_at },
    { label: 'Received', at: request.received_at },
    { label: 'Cancelled', at: request.cancelled_at },
  ];

  const open = ['approved', 'sent', 'confirmed', 'overdue'].includes(request.status);

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: request.medication_name }} />

      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Body className="font-semibold">
              {request.quantity_packs} {request.quantity_packs === 1 ? 'pack' : 'packs'} from {request.provider_name}
            </Body>
            <Muted>Reference {requestReference(request.id)}{request.server_reference ? ` · server ${request.server_reference}` : ''}</Muted>
            {request.needed_by ? <Muted>Needed by {formatDate(request.needed_by)}</Muted> : null}
            {request.expected_by ? <Muted>Expected by {formatDate(request.expected_by)}</Muted> : null}
          </View>
          <OrderStatusBadge status={request.status} />
        </View>
        {isStubMode() && request.status !== 'draft' ? (
          <Muted>No server configured: the request is tracked on this phone only, no email was sent.</Muted>
        ) : null}
      </Card>

      {open ? (
        <Section title="Update">
          <View className="gap-2">
            {request.status === 'approved' ? <Button title="Send now" onPress={sendNow} loading={busy === 'send'} /> : null}
            {request.status === 'sent' || request.status === 'overdue' ? (
              <Button title="Practice confirmed" variant="secondary" onPress={confirm} loading={busy === 'confirm'} />
            ) : null}
            {request.status === 'overdue' ? <Button title="Log a follow-up" variant="secondary" onPress={followUp} loading={busy === 'followup'} /> : null}
            {request.status !== 'approved' ? <Button title="Received the delivery" onPress={received} loading={busy === 'received'} /> : null}
            <Button title="Cancel request" variant="ghost" onPress={cancel} loading={busy === 'cancel'} />
          </View>
        </Section>
      ) : null}

      <Section title="Timeline">
        <Card className="gap-2">
          {timeline
            .filter((t) => t.at)
            .map((t) => (
              <View key={t.label} className="flex-row justify-between">
                <Body>{t.label}</Body>
                <Muted>{formatDate(t.at!.slice(0, 10))}</Muted>
              </View>
            ))}
          {request.follow_up_count > 0 ? (
            <View className="flex-row justify-between">
              <Body>Follow-ups</Body>
              <Muted>{request.follow_up_count}</Muted>
            </View>
          ) : null}
        </Card>
      </Section>

      {request.message_body ? (
        <Section title="Message">
          <Card className="gap-2">
            <Body className="font-semibold">{request.message_subject}</Body>
            <Text className="font-mono text-xs leading-5 text-neutral-800 dark:text-neutral-200">{request.message_body}</Text>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
