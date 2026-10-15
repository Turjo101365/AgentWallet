/**
 * One Idempotency-Key per proposal approval, reused on retries so a flaky network can never turn
 * one click into two approvals. Kept in sessionStorage so a page reload reuses it too.
 */
const PREFIX = 'aw.idem.';

function newKey() {
  if (globalThis.crypto?.randomUUID) return `approve-${globalThis.crypto.randomUUID()}`;
  return `approve-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function approvalKey(proposalId) {
  try {
    const existing = sessionStorage.getItem(PREFIX + proposalId);
    if (existing) return existing;
    const key = newKey();
    sessionStorage.setItem(PREFIX + proposalId, key);
    return key;
  } catch {
    return newKey();
  }
}
