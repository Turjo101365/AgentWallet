import { get } from '../lib/api.js';
import { usePolling } from './usePolling.js';

export const useWalletState = (ms = 6000) => usePolling(() => get('/wallet/state'), ms);
export const useProposals = (status, ms = 3000) =>
  usePolling(() => get(`/proposals?limit=100${status ? `&status=${status}` : ''}`), ms, [status]);
export const useRecipients = (ms = 15000) => usePolling(() => get('/recipients'), ms);
export const useAgentStatus = (ms = 6000) => usePolling(() => get('/agent/status'), ms);
export const useTransactions = (ms = 6000) => usePolling(() => get('/transactions'), ms);

export function labelFor(recipients, address) {
  return recipients?.find((r) => r.address.toLowerCase() === String(address).toLowerCase())?.label || null;
}
