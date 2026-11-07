import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OrderStatusBadge } from '@/components/OrderStatus';
import { Body, Button, Card, Muted, Screen, Section, Title } from '@/components/ui';
import { type DbClient, detectOverdueReorders, formatDate, listReorderBatches, type ReorderBatch } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { type MessageKey, type MessageParams, useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';
import { syncReorderStatuses } from '@/lib/reorder';

async function loadOrders(db: DbClient, profileId: string) {
  await syncReorderStatuses(db, profileId);
  await detectOverdueReorders(db, profileId);
  const [open, closed] = await Promise.all([listReorderBatches(db, profileId, { active: true }), listReorderBatches(db, profileId, { active: false })]);
  return { open, closed };
}

type T = (key: MessageKey, params?: MessageParams) => string;

function describeTiming(t: T, b: ReorderBatch): string {
  const sent = formatDate(b.sent_at?.slice(0, 10));
  switch (b.status) {
    case 'approved':
      return t('orders.notSentYet');
    case 'sent':
      return b.expected_by ? t('orders.sentReplyExpected', { date: sent, expected: formatDate(b.expected_by) }) : t('orders.sentOn', { date: sent });
    case 'confirmed':
      return b.expected_by ? t('orders.confirmedReadyBy', { date: formatDate(b.expected_by) }) : t('orders.confirmedOn', { date: formatDate(b.confirmed_at?.slice(0, 10)) });
    case 'overdue':
      return t('orders.noReplySince', { date: sent }) + (b.follow_up_count > 0 ? ` · ${t('orders.followUps', { count: b.follow_up_count })}` : '');
    case 'received':
      return t('orders.receivedOn', { date: formatDate(b.received_at?.slice(0, 10)) });
    case 'cancelled':
      return t('orders.cancelledOn', { date: formatDate(b.cancelled_at?.slice(0, 10)) });
    default:
      return t('orders.createdOn', { date: formatDate(b.created_at.slice(0, 10)) });
  }
}

/** "Tacrolimus, Mycophenolate +3 more" */
function describeItems(t: T, b: ReorderBatch): string {
  const names = b.items.filter((i) => i.status !== 'cancelled').map((i) => i.medication_name);
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${shown} ${t('orders.moreItems', { count: names.length - 2 })}` : shown || b.items.map((i) => i.medication_name).join(', ');
}

export default function OrdersScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { profile } = useProfile();
  const { data, loading } = useDbQuery((d) => loadOrders(d, profile.id), [profile.id]);

  if (loading && !data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0B5CAB" />
        </View>
      </Screen>
    );
  }

  const open = data?.open ?? [];
  const closed = data?.closed ?? [];
  const newOrder = () => router.push({ pathname: '/reorder', params: {} });

  if (open.length === 0 && closed.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Title className="text-center">{t('orders.noOrdersTitle')}</Title>
          <Muted className="text-center">{t('orders.noOrdersBody')}</Muted>
          <Button title={t('orders.newOrder')} onPress={newOrder} />
        </View>
      </Screen>
    );
  }

  const row = (b: ReorderBatch) => {
    const packs = b.items.reduce((sum, i) => (i.status === 'cancelled' ? sum : sum + i.quantity_packs), 0);
    return (
      <Card key={b.batch_id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: b.batch_id } })}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Body className="font-semibold" numberOfLines={2}>
              {describeItems(t, b)}
            </Body>
            <Muted>
              {t('orders.summary', {
                medications: t('common.medications', { count: b.items.length }),
                packs: t('common.packs', { count: packs }),
                provider: b.provider_name,
              })}
            </Muted>
            <Muted>{describeTiming(t, b)}</Muted>
          </View>
          <OrderStatusBadge status={b.status} />
        </View>
      </Card>
    );
  };

  return (
    <Screen scroll>
      <Button title={t('orders.newOrder')} onPress={newOrder} />
      <Section title={t('orders.open')}>
        {open.length === 0 ? (
          <Card>
            <Muted>{t('orders.nothingInProgress')}</Muted>
          </Card>
        ) : (
          <View className="gap-2">{open.map(row)}</View>
        )}
      </Section>
      {closed.length > 0 ? (
        <Section title={t('orders.history')}>
          <View className="gap-2">{closed.map(row)}</View>
        </Section>
      ) : null}
    </Screen>
  );
}
