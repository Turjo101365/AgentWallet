import React from 'react';
import { Badge } from '../ui/Badge.jsx';

const VARIANTS = {
  AWAITING_APPROVAL: ['warning', 'Awaiting approval'],
  APPROVED: ['warning', 'Approved · executing'],
  SUBMITTED: ['warning', 'Submitted · awaiting receipt'],
  CONFIRMED: ['success', 'Confirmed on-chain'],
  FAILED: ['error', 'Failed'],
  POLICY_REJECTED: ['error', 'Blocked by policy'],
  REJECTED: ['neutral', 'Rejected by operator'],
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
