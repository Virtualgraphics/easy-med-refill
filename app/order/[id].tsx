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
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';
import { buildReorderPayload, requestReference } from '@/lib/reorder';

const STATUS_KEY = {
  draft: 'orders.statusDraft',
  approved: 'orders.statusApproved',
  sent: 'orders.statusSent',
  confirmed: 'orders.statusConfirmed',
  received: 'orders.statusReceived',
  overdue: 'orders.statusOverdue',
  cancelled: 'orders.statusCancelled',
} as const;

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
  const { t } = useI18n();
  const { profile } = useProfile();
  const { data, loading, reload } = useDbQuery((d) => loadOrder(d, id), [id]);
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">{loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>{t('orders.orderNotFound')}</Muted>}</View>
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
      Alert.alert(t('common.couldNotUpdate'), e instanceof Error ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  };

  const sendNow = () =>
    act('send', async () => {
      if (!provider) throw new Error(t('orders.supplierMissing'));
      const items = batch.items.map((request) => {
        const medication = medicationFor(request);
        if (!medication) throw new Error(t('orders.medicationMissing'));
        return { request, medication };
      });
      try {
        const result = await submitReorder(buildReorderPayload(batch, items, provider, profile));
        await markBatchSent(db, batch.batch_id, {
          server_reference: result.reference,
          expected_by: addDays(todayIso(), Math.round(effectiveLeadTimeDays(provider))),
        });
      } catch (e) {
        throw new Error(e instanceof ApiError ? e.message : t('orders.serverUnreachable'));
      }
    });

  const confirm = () => act('confirm', () => markBatchConfirmed(db, batch.batch_id));

  const receivedAll = () => act('received', () => markBatchReceived(db, batch.batch_id));

  const receivedOne = (item: ReorderRequestListItem) =>
    act(`received-${item.id}`, async () => {
      await markReorderReceived(db, item.id, todayIso(), { learnLeadTime: false });
    });

  const cancelOne = (item: ReorderRequestListItem) =>
    Alert.alert(t('orders.removeItemTitle', { name: item.medication_name }), t('orders.supplierNotNotified'), [
      { text: t('common.keep'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => act(`cancel-${item.id}`, () => cancelReorderRequest(db, item.id).then(() => undefined)) },
    ]);

  const followUp = () =>
    act('followup', async () => {
      await recordBatchFollowUp(db, batch.batch_id);
      Alert.alert(t('orders.followUpNoted'), t('orders.followUpNotedBody'));
    });

  const cancel = () =>
    Alert.alert(t('orders.cancelOrderTitle'), t('orders.cancelOrderBody'), [
      { text: t('common.keep'), style: 'cancel' },
      { text: t('orders.cancelOrder'), style: 'destructive', onPress: () => act('cancel', () => cancelReorderBatch(db, batch.batch_id)) },
    ]);

  const addPacks = (item: ReorderRequestListItem) =>
    router.push({ pathname: '/medication/[id]/pack', params: { id: item.medication_id, gtin: medicationFor(item)?.gtin ?? '' } });

  const timeline: { label: string; at: string | null }[] = [
    { label: t('orders.tlCreated'), at: batch.created_at },
    { label: t('orders.tlApproved'), at: batch.approved_at },
    { label: t('orders.tlSent'), at: batch.sent_at },
    { label: t('orders.tlConfirmed'), at: batch.confirmed_at },
    { label: t('orders.tlOverdue'), at: batch.overdue_at },
    { label: t('orders.tlReceived'), at: batch.received_at },
    { label: t('orders.tlCancelled'), at: batch.cancelled_at },
  ];

  const open = ACTIVE_REORDER_STATUSES.includes(batch.status) && batch.status !== 'draft';
  const deliverable = ['sent', 'confirmed', 'overdue'].includes(batch.status);
  const openItems = batch.items.filter((i) => ACTIVE_REORDER_STATUSES.includes(i.status));
  const packs = batch.items.reduce((sum, i) => (i.status === 'cancelled' ? sum : sum + i.quantity_packs), 0);
  const count = batch.items.length;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: count === 1 ? batch.items[0].medication_name : t('orders.orderTitle', { medications: t('common.medications', { count }) }) }} />

      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Body className="font-semibold">
              {t('orders.headline', { medications: t('common.medications', { count }), packs: t('common.packs', { count: packs }), provider: batch.provider_name })}
            </Body>
            <Muted>
              {t('orders.reference', { ref: requestReference(batch.batch_id) })}
              {batch.server_reference ? t('orders.serverReference', { ref: batch.server_reference }) : ''}
            </Muted>
            {batch.needed_by ? <Muted>{t('orders.neededBy', { date: formatDate(batch.needed_by) })}</Muted> : null}
            {batch.expected_by ? <Muted>{t('orders.expectedBy', { date: formatDate(batch.expected_by) })}</Muted> : null}
          </View>
          <OrderStatusBadge status={batch.status} />
        </View>
        {isStubMode() && batch.status !== 'draft' ? <Muted>{t('orders.stubNote')}</Muted> : null}
      </Card>

      <Section title={t('orders.medications')}>
        <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {batch.items.map((item, index) => {
            const itemOpen = ACTIVE_REORDER_STATUSES.includes(item.status);
            const differs = item.status !== batch.status;
            return (
              <View key={item.id} className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <View className="flex-1 gap-0.5">
                  <Body className={`font-semibold ${item.status === 'cancelled' ? 'line-through text-neutral-400' : ''}`}>{item.medication_name}</Body>
                  <Muted>
                    {t('common.packs', { count: item.quantity_packs })}
                    {differs ? ` · ${t(STATUS_KEY[item.status])}` : ''}
                  </Muted>
                </View>
                {item.status === 'received' ? (
                  <LinkButton label={t('orders.addPacks')} onPress={() => addPacks(item)} />
                ) : deliverable && itemOpen && openItems.length > 1 ? (
                  <LinkButton label={t('orders.received')} onPress={() => receivedOne(item)} busy={busy === `received-${item.id}`} />
                ) : null}
                {itemOpen && openItems.length > 1 && !deliverable ? <LinkButton label={t('common.remove')} onPress={() => cancelOne(item)} tone="muted" /> : null}
              </View>
            );
          })}
        </View>
      </Section>

      {open ? (
        <Section title={t('orders.update')}>
          <View className="gap-2">
            {batch.status === 'approved' ? <Button title={t('orders.sendNow')} onPress={sendNow} loading={busy === 'send'} /> : null}
            {batch.status === 'sent' || batch.status === 'overdue' ? (
              <Button title={t('orders.practiceConfirmed')} variant="secondary" onPress={confirm} loading={busy === 'confirm'} />
            ) : null}
            {batch.status === 'overdue' ? <Button title={t('orders.logFollowUp')} variant="secondary" onPress={followUp} loading={busy === 'followup'} /> : null}
            {deliverable ? (
              <Button title={openItems.length > 1 ? t('orders.receivedEverything') : t('orders.receivedDelivery')} onPress={receivedAll} loading={busy === 'received'} />
            ) : null}
            <Button title={t('orders.cancelOrder')} variant="ghost" onPress={cancel} loading={busy === 'cancel'} />
          </View>
        </Section>
      ) : null}

      <Section title={t('orders.timeline')}>
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
              <Body>{t('orders.followUpsLabel')}</Body>
              <Muted>{batch.follow_up_count}</Muted>
            </View>
          ) : null}
        </Card>
      </Section>

      {batch.message_body ? (
        <Section title={t('orders.message')}>
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
