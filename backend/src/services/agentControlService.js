import { normalizeAddress } from '../lib/address.js';

const PAUSE_KEY = 'agent.paused';
const PAYEE_KEY = 'agent.rlPayee';

/** Persistent (restart-safe) off-chain agent controls. The on-chain pause is separate and owner-signed. */
export function createAgentControlService({ repos }) {
  return {
    async isPaused() {
      const v = await repos.settings.get(PAUSE_KEY, { paused: false });
      return Boolean(v.paused);
    },
    async getPauseState() {
      return repos.settings.get(PAUSE_KEY, { paused: false, reason: null, by: null, at: null });
    },
    async setPaused(paused, actor, reason = null) {
      const value = { paused: Boolean(paused), reason, by: actor, at: new Date().toISOString() };
      await repos.settings.set(PAUSE_KEY, value, actor);
      await repos.audit.append({ actor, action: paused ? 'AGENT_PAUSED' : 'AGENT_RESUMED', entityType: 'agent', entityId: 'agent', details: { reason } });
      return value;
    },
    async getRlPayee() {
      const v = await repos.settings.get(PAYEE_KEY, { address: null });
      return v.address;
    },
    async setRlPayee(address, actor) {
      const value = { address: address === null ? null : normalizeAddress(address, 'rlPayee') };
      await repos.settings.set(PAYEE_KEY, value, actor);
      await repos.audit.append({ actor, action: 'RL_PAYEE_SET', entityType: 'settings', entityId: PAYEE_KEY, details: value });
      return value.address;
    },
  };
}
