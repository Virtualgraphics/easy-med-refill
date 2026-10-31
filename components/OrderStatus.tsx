import React from 'react';

import { Badge, type BadgeTone } from '@/components/ui';
import type { ReorderStatus } from '@/lib/db';

export const ORDER_STATUS_LABEL: Record<ReorderStatus, string> = {
  draft: 'Draft',
  approved: 'Waiting to send',
  sent: 'Sent',
  confirmed: 'Confirmed',
  received: 'Received',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_TONE: Record<ReorderStatus, BadgeTone> = {
  draft: 'neutral',
  approved: 'warn',
  sent: 'brand',
  confirmed: 'ok',
  received: 'ok',
  overdue: 'critical',
  cancelled: 'neutral',
};

export function OrderStatusBadge({ status }: { status: ReorderStatus }) {
  return <Badge text={ORDER_STATUS_LABEL[status]} tone={ORDER_STATUS_TONE[status]} />;
}
