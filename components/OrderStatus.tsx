import React from 'react';

import { Badge, type BadgeTone } from '@/components/ui';
import type { ReorderStatus } from '@/lib/db';
import { useI18n } from '@/lib/i18n';

export const ORDER_STATUS_TONE: Record<ReorderStatus, BadgeTone> = {
  draft: 'neutral',
  approved: 'warn',
  sent: 'brand',
  confirmed: 'ok',
  received: 'ok',
  overdue: 'critical',
  cancelled: 'neutral',
};

const LABEL_KEY = {
  draft: 'orders.statusDraft',
  approved: 'orders.statusApproved',
  sent: 'orders.statusSent',
  confirmed: 'orders.statusConfirmed',
  received: 'orders.statusReceived',
  overdue: 'orders.statusOverdue',
  cancelled: 'orders.statusCancelled',
} as const;

export function OrderStatusBadge({ status }: { status: ReorderStatus }) {
  const { t } = useI18n();
  return <Badge text={t(LABEL_KEY[status])} tone={ORDER_STATUS_TONE[status]} />;
}
