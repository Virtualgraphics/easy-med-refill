import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { OrderStatusBadge } from '@/components/OrderStatus';
import { Body, Button, Card, Muted, Screen, Section } from '@/components/ui';
import { ApiError, isStubMode, submitReorder } from '@/lib/api';
import {
  ACTIVE_REORDER_STATUSES,
  addDays,
  cancelReorderBatch,
  cancelReorderRequest,
  type DbClient,
  effectiveLeadTimeDays,
  formatDate,
  getMedication,
  getProvider,
  getReorderBatch,
  markBatchConfirmed,
  markBatchReceived,
  markBatchSent,
  markReorderReceived,
  recordBatchFollowUp,
  type ReorderRequestListItem,
  todayIso,
  useDb,
} from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { buildReorderPayload, requestReference } from '@/lib/reorder';

async function loadOrder(db: DbClient, batchId: string) {
  const batch = await getReorderBatch(db, batchId);
  if (!batch) return null;
  const [provider, medications] = await Promise.all([getProvider(db, batch.provider_id), Promise.all(batch.items.map((i) => getMedication(db, i.medication_id)))]);
  return { batch, provider, medications };
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
        <View className="flex-1 items-center justify-center">{loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>Order not found.</Muted>}</View>
      </Screen>
    );
  }

  const { batch, provider, medications } = data;
  const medicationFor = (item: ReorderRequestListItem) => medications.find((m) => m?.id === item.medication_id) ?? null;

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
      if (!provider) throw new Error('The supplier is missing.');
      const items = batch.items.map((request) => {
        const medication = medicationFor(request);
        if (!medication) throw new Error('A medication in this order no longer exists.');
        return { request, medication };
      });
      try {
        const result = await submitReorder(buildReorderPayload(batch, items, provider, profile));
        await markBatchSent(db, batch.batch_id, {
          server_reference: result.reference,
          expected_by: addDays(todayIso(), Math.round(effectiveLeadTimeDays(provider))),
        });
      } catch (e) {
        throw new Error(e instanceof ApiError ? e.message : 'The server could not be reached.');
      }
    });

  const confirm = () => act('confirm', () => markBatchConfirmed(db, batch.batch_id));

  const receivedAll = () => act('received', () => markBatchReceived(db, batch.batch_id));

  const receivedOne = (item: ReorderRequestListItem) =>
    act(`received-${item.id}`, async () => {
      await markReorderReceived(db, item.id, todayIso(), { learnLeadTime: false });
    });

  const cancelOne = (item: ReorderRequestListItem) =>
    Alert.alert(`Remove ${item.medication_name}?`, 'The supplier is not notified automatically.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(`cancel-${item.id}`, () => cancelReorderRequest(db, item.id).then(() => undefined)) },
    ]);

  const followUp = () =>
    act('followup', async () => {
      await recordBatchFollowUp(db, batch.batch_id);
      Alert.alert('Follow-up noted', 'Automatic follow-up emails are sent by the server once it is connected. The count is tracked here.');
    });

  const cancel = () =>
    Alert.alert('Cancel this order?', 'Every medication in it is cancelled. The practice or pharmacy is not notified automatically.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => act('cancel', () => cancelReorderBatch(db, batch.batch_id)) },
    ]);

  const addPacks = (item: ReorderRequestListItem) =>
    router.push({ pathname: '/medication/[id]/pack', params: { id: item.medication_id, gtin: medicationFor(item)?.gtin ?? '' } });

  const timeline: { label: string; at: string | null }[] = [
    { label: 'Created', at: batch.created_at },
    { label: 'Approved', at: batch.approved_at },
    { label: 'Sent', at: batch.sent_at },
    { label: 'Confirmed', at: batch.confirmed_at },
    { label: 'Marked overdue', at: batch.overdue_at },
    { label: 'Received', at: batch.received_at },
    { label: 'Cancelled', at: batch.cancelled_at },
  ];

  const open = ACTIVE_REORDER_STATUSES.includes(batch.status) && batch.status !== 'draft';
  const deliverable = ['sent', 'confirmed', 'overdue'].includes(batch.status);
  const openItems = batch.items.filter((i) => ACTIVE_REORDER_STATUSES.includes(i.status));
  const packs = batch.items.reduce((sum, i) => (i.status === 'cancelled' ? sum : sum + i.quantity_packs), 0);
  const count = batch.items.length;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: count === 1 ? batch.items[0].medication_name : `Order · ${count} medications` }} />

      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Body className="font-semibold">
              {count} {count === 1 ? 'medication' : 'medications'} · {packs} {packs === 1 ? 'pack' : 'packs'} from {batch.provider_name}
            </Body>
            <Muted>
              Reference {requestReference(batch.batch_id)}
              {batch.server_reference ? ` · server ${batch.server_reference}` : ''}
            </Muted>
            {batch.needed_by ? <Muted>Needed by {formatDate(batch.needed_by)}</Muted> : null}
            {batch.expected_by ? <Muted>Expected by {formatDate(batch.expected_by)}</Muted> : null}
          </View>
          <OrderStatusBadge status={batch.status} />
        </View>
        {isStubMode() && batch.status !== 'draft' ? <Muted>No server configured: the order is tracked on this phone only, no email was sent.</Muted> : null}
      </Card>

      <Section title="Medications">
        <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {batch.items.map((item, index) => {
            const itemOpen = ACTIVE_REORDER_STATUSES.includes(item.status);
            const differs = item.status !== batch.status;
            return (
              <View key={item.id} className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <View className="flex-1 gap-0.5">
                  <Body className={`font-semibold ${item.status === 'cancelled' ? 'line-through text-neutral-400' : ''}`}>{item.medication_name}</Body>
                  <Muted>
                    {item.quantity_packs} {item.quantity_packs === 1 ? 'pack' : 'packs'}
                    {differs ? ` · ${item.status}` : ''}
                  </Muted>
                </View>
                {item.status === 'received' ? (
                  <LinkButton label="Add packs" onPress={() => addPacks(item)} />
                ) : deliverable && itemOpen && openItems.length > 1 ? (
                  <LinkButton label="Received" onPress={() => receivedOne(item)} busy={busy === `received-${item.id}`} />
                ) : null}
                {itemOpen && openItems.length > 1 && !deliverable ? <LinkButton label="Remove" onPress={() => cancelOne(item)} tone="muted" /> : null}
              </View>
            );
          })}
        </View>
      </Section>

      {open ? (
        <Section title="Update">
          <View className="gap-2">
            {batch.status === 'approved' ? <Button title="Send now" onPress={sendNow} loading={busy === 'send'} /> : null}
            {batch.status === 'sent' || batch.status === 'overdue' ? (
              <Button title="Practice confirmed" variant="secondary" onPress={confirm} loading={busy === 'confirm'} />
            ) : null}
            {batch.status === 'overdue' ? <Button title="Log a follow-up" variant="secondary" onPress={followUp} loading={busy === 'followup'} /> : null}
            {deliverable ? (
              <Button title={openItems.length > 1 ? 'Received everything' : 'Received the delivery'} onPress={receivedAll} loading={busy === 'received'} />
            ) : null}
            <Button title="Cancel order" variant="ghost" onPress={cancel} loading={busy === 'cancel'} />
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
          {batch.follow_up_count > 0 ? (
            <View className="flex-row justify-between">
              <Body>Follow-ups</Body>
              <Muted>{batch.follow_up_count}</Muted>
            </View>
          ) : null}
        </Card>
      </Section>

      {batch.message_body ? (
        <Section title="Message">
          <Card className="gap-2">
            <Body className="font-semibold">{batch.message_subject}</Body>
            <Text className="font-mono text-xs leading-5 text-neutral-800 dark:text-neutral-200">{batch.message_body}</Text>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function LinkButton({ label, onPress, busy, tone = 'brand' }: { label: string; onPress: () => void; busy?: boolean; tone?: 'brand' | 'muted' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={busy} hitSlop={8} className="px-1">
      {busy ? (
        <ActivityIndicator color="#0B5CAB" />
      ) : (
        <Text className={`text-base font-semibold ${tone === 'brand' ? 'text-brand-700 dark:text-brand-300' : 'text-neutral-500'}`}>{label}</Text>
      )}
    </Pressable>
  );
}
