import { formatUnits } from 'ethers';
import { formatAmount, truncateAddress } from '../utils/formatters.js';

function amount(tokens, token, value) {
  const t = tokens.find((x) => x.address.toLowerCase() === String(token).toLowerCase());
  return t ? `${formatAmount(formatUnits(value, t.decimals))} ${t.symbol}` : `${value} base units of ${truncateAddress(token)}`;
}

/** Human description of one indexed contract event. */
export function describeEvent(ev, tokens) {
  const a = ev.args || {};
  switch (ev.name) {
    case 'TransferExecuted':
      return `Agent transfer of ${amount(tokens, a.token, a.amount)} to ${truncateAddress(a.recipient)}`;
    case 'Deposited':
      return `Deposit of ${formatAmount(formatUnits(a.amount, 18))} ETH from ${truncateAddress(a.from)}`;
    case 'Withdrawn':
      return `Owner withdrawal of ${amount(tokens, a.token, a.amount)} to ${truncateAddress(a.to)}`;
    case 'EmergencyWithdrawal':
      return `Emergency withdrawal of ${amount(tokens, a.token, a.amount)} to ${truncateAddress(a.to)}`;
    case 'RecipientUpdated':
      return `${a.allowed ? 'Allowlisted' : 'Removed'} recipient ${truncateAddress(a.recipient)}`;
    case 'TokenPolicyUpdated':
      return `Limits set: per-tx ${amount(tokens, a.token, a.perTxLimit)}, daily ${amount(tokens, a.token, a.dailyLimit)}, ${a.enabled ? 'enabled' : 'disabled'}`;
    case 'AgentUpdated':
      return `Agent changed ${truncateAddress(a.previousAgent)} → ${truncateAddress(a.newAgent)}`;
    case 'EmergencyStop':
      return `Emergency stop: paused and revoked agent ${truncateAddress(a.revokedAgent)}`;
    default:
      return ev.name;
  }
}

export const EVENT_ICON = {
  TransferExecuted: 'north_east',
  Deposited: 'south_west',
  Withdrawn: 'north',
  EmergencyWithdrawal: 'emergency',
  RecipientUpdated: 'person_add',
  TokenPolicyUpdated: 'tune',
  AgentUpdated: 'key',
  EmergencyStop: 'emergency_home',
  Paused: 'pause_circle',
  Unpaused: 'play_circle',
};

export function auditIcon(action) {
  const a = String(action || '');
  if (a.startsWith('AUTH')) return 'key';
  if (a.includes('REJECT') || a.includes('FAILED') || a.includes('POLICY_FAILED')) return 'block';
  if (a.startsWith('PROPOSAL')) return 'fact_check';
  if (a.startsWith('TASK') || a.startsWith('AUTOMATION') || a.startsWith('RUN')) return 'event_repeat';
  if (a.startsWith('AGENT')) return 'smart_toy';
  if (a.startsWith('POLICY')) return 'tune';
  if (a.includes('EXECUT') || a.includes('TX')) return 'receipt_long';
  return 'history_edu';
}
