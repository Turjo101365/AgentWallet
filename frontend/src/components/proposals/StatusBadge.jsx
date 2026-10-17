import React from 'react';
import { Badge } from '../ui/Badge.jsx';

const VARIANTS = {
  AWAITING_APPROVAL: ['warning', 'Needs your approval'],
  APPROVED: ['warning', 'Approved · processing'],
  SUBMITTED: ['warning', 'Sent · awaiting confirmation'],
  CONFIRMED: ['success', 'Payment completed'],
  FAILED: ['error', 'Failed'],
  POLICY_REJECTED: ['error', 'Blocked by a safety rule'],
  REJECTED: ['neutral', 'Declined'],
  EXPIRED: ['neutral', 'Expired'],
};

export function StatusBadge({ status }) {
  const [variant, label] = VARIANTS[status] || ['neutral', status];
  return (
    <Badge variant={variant} pulse={['APPROVED', 'SUBMITTED', 'AWAITING_APPROVAL'].includes(status)}>
      {label}
    </Badge>
  );
}
