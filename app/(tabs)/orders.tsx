import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OrderStatusBadge } from '@/components/OrderStatus';
import { Body, Card, Muted, Screen, Section, Title } from '@/components/ui';
import { type DbClient, detectOverdueReorders, formatDate, listReorderRequests, type ReorderRequestListItem } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { syncReorderStatuses } from '@/lib/reorder';

async function loadOrders(db: DbClient, profileId: string) {
  await syncReorderStatuses(db, profileId);
  await detectOverdueReorders(db, profileId);
  const [open, closed] = await Promise.all([
    listReorderRequests(db, profileId, { active: true }),
    listReorderRequests(db, profileId, { active: false }),
  ]);
  return { open, closed };
}

function describeTiming(r: ReorderRequestListItem): string {
  switch (r.status) {
    case 'approved':
      return 'Not sent yet';
    case 'sent':
      return r.expected_by ? `Sent ${formatDate(r.sent_at?.slice(0, 10))} · reply expected by ${formatDate(r.expected_by)}` : `Sent ${formatDate(r.sent_at?.slice(0, 10))}`;
    case 'confirmed':
      return r.expected_by ? `Confirmed · ready by ${formatDate(r.expected_by)}` : `Confirmed ${formatDate(r.confirmed_at?.slice(0, 10))}`;
    case 'overdue':
      return `No reply since ${formatDate(r.sent_at?.slice(0, 10))}${r.follow_up_count > 0 ? ` · ${r.follow_up_count} follow-up${r.follow_up_count === 1 ? '' : 's'}` : ''}`;
    case 'received':
      return `Received ${formatDate(r.received_at?.slice(0, 10))}`;
    case 'cancelled':
      return `Cancelled ${formatDate(r.cancelled_at?.slice(0, 10))}`;
    default:
      return `Created ${formatDate(r.created_at.slice(0, 10))}`;
  }
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

  if (open.length === 0 && closed.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Title className="text-center">No reorders yet</Title>
          <Muted className="text-center">
            Start a reorder from a medication's page. The request goes to your practice or pharmacy as a templated email, and its progress shows here.
          </Muted>
        </View>
      </Screen>
    );
  }

  const row = (r: ReorderRequestListItem) => (
    <Card key={r.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: r.id } })}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Body className="font-semibold">{r.medication_name}</Body>
          <Muted>
            {r.quantity_packs} {r.quantity_packs === 1 ? 'pack' : 'packs'} · {r.provider_name}
          </Muted>
          <Muted>{describeTiming(r)}</Muted>
        </View>
        <OrderStatusBadge status={r.status} />
      </View>
    </Card>
  );

  return (
    <Screen scroll>
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
