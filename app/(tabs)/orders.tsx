import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OrderStatusBadge } from '@/components/OrderStatus';
import { Body, Button, Card, Muted, Screen, Section, Title } from '@/components/ui';
import { type DbClient, detectOverdueReorders, formatDate, listReorderBatches, type ReorderBatch } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { syncReorderStatuses } from '@/lib/reorder';

async function loadOrders(db: DbClient, profileId: string) {
  await syncReorderStatuses(db, profileId);
  await detectOverdueReorders(db, profileId);
  const [open, closed] = await Promise.all([listReorderBatches(db, profileId, { active: true }), listReorderBatches(db, profileId, { active: false })]);
  return { open, closed };
}

function describeTiming(b: ReorderBatch): string {
  switch (b.status) {
    case 'approved':
      return 'Not sent yet';
    case 'sent':
      return b.expected_by ? `Sent ${formatDate(b.sent_at?.slice(0, 10))} · reply expected by ${formatDate(b.expected_by)}` : `Sent ${formatDate(b.sent_at?.slice(0, 10))}`;
    case 'confirmed':
      return b.expected_by ? `Confirmed · ready by ${formatDate(b.expected_by)}` : `Confirmed ${formatDate(b.confirmed_at?.slice(0, 10))}`;
    case 'overdue':
      return `No reply since ${formatDate(b.sent_at?.slice(0, 10))}${b.follow_up_count > 0 ? ` · ${b.follow_up_count} follow-up${b.follow_up_count === 1 ? '' : 's'}` : ''}`;
    case 'received':
      return `Received ${formatDate(b.received_at?.slice(0, 10))}`;
    case 'cancelled':
      return `Cancelled ${formatDate(b.cancelled_at?.slice(0, 10))}`;
    default:
      return `Created ${formatDate(b.created_at.slice(0, 10))}`;
  }
}

/** "Tacrolimus, Mycophenolate +3 more" */
function describeItems(b: ReorderBatch): string {
  const names = b.items.filter((i) => i.status !== 'cancelled').map((i) => i.medication_name);
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${shown} +${names.length - 2} more` : shown || b.items.map((i) => i.medication_name).join(', ');
}

export default function OrdersScreen() {
  const router = useRouter();
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
          <Title className="text-center">No orders yet</Title>
          <Muted className="text-center">
            Order several medications at once from your practice or pharmacy. The request goes out as one templated email, and its progress shows here.
          </Muted>
          <Button title="New order" onPress={newOrder} />
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
              {describeItems(b)}
            </Body>
            <Muted>
              {b.items.length} {b.items.length === 1 ? 'medication' : 'medications'} · {packs} {packs === 1 ? 'pack' : 'packs'} · {b.provider_name}
            </Muted>
            <Muted>{describeTiming(b)}</Muted>
          </View>
          <OrderStatusBadge status={b.status} />
        </View>
      </Card>
    );
  };

  return (
    <Screen scroll>
      <Button title="New order" onPress={newOrder} />
      <Section title="Open">
        {open.length === 0 ? (
          <Card>
            <Muted>Nothing in progress.</Muted>
          </Card>
        ) : (
          <View className="gap-2">{open.map(row)}</View>
        )}
      </Section>
      {closed.length > 0 ? (
        <Section title="History">
          <View className="gap-2">{closed.map(row)}</View>
        </Section>
      ) : null}
    </Screen>
  );
}
