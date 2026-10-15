import { z } from 'zod';
import { ethers } from 'ethers';
import { badRequest, conflict } from '../lib/errors.js';

const KEY = 'policy.settings';
const AUTOMATION_KEY = 'automation.paused';
const wei = z.string().regex(/^\d+$/);

export const policySettingsSchema = z
  .object({
    // Minimum balance to keep per asset, in base units. The effective floor is max(this, server floor).
    reserveFloors: z.record(z.string(), wei).default({}),
    // Autonomous (grant-approved) task runs above this amount per transfer escalate to a human. Absent = never auto.
    autoApprovalMaxPerTx: z.record(z.string(), wei).default({}),
    // Paying contract addresses requires explicit opt-in (they can behave unexpectedly on receive).
    allowContractRecipients: z.boolean().default(false),
    // Optional aggregate cap across all assets, valued via configured price feeds; fails closed without prices.
    dailyUsdLimit: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().default(null),
    circuitBreaker: z
      .object({
        maxConsecutiveFailures: z.number().int().min(1).max(20).default(3),
        // Max autonomous outflow per asset in any rolling hour; exceeding it pauses automation.
        hourlyAutonomousOutflow: z.record(z.string(), wei).default({}),
      })
      .default({ maxConsecutiveFailures: 3, hourlyAutonomousOutflow: {} }),
  })
  .strict();

const DEFAULTS = policySettingsSchema.parse({});

function normalizeTokenKeys(map, config) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (!ethers.isAddress(k)) throw badRequest('INVALID_TOKEN', `Unknown token key ${k}`);
    const addr = ethers.getAddress(k);
    if (!config.tokens.some((t) => t.address === addr)) throw badRequest('UNSUPPORTED_TOKEN', `Token ${addr} is not supported`);
    out[addr] = v;
  }
  return out;
}

/**
 * Owner-managed risk settings. Changes that make policy STRICTER can be applied by any owner path
 * (including the LLM agent on the owner's behalf). Changes that LOOSEN policy require an explicit
 * owner action in the console (`allowLoosening`), never an agent tool call.
 */
export function createPolicySettings({ config, repos }) {
  async function get() {
    const stored = await repos.settings.get(KEY, null);
    return stored ? policySettingsSchema.parse(stored) : DEFAULTS;
  }

  function loosens(current, next) {
    const reasons = [];
    for (const t of config.tokens) {
      const a = t.address;
      if (BigInt(next.reserveFloors[a] || 0) < BigInt(current.reserveFloors[a] || 0)) reasons.push(`lower ${t.symbol} reserve floor`);
      if (BigInt(next.autoApprovalMaxPerTx[a] || 0) > BigInt(current.autoApprovalMaxPerTx[a] || 0)) reasons.push(`raise ${t.symbol} auto-approval limit`);
      const ch = current.circuitBreaker.hourlyAutonomousOutflow[a];
      const nh = next.circuitBreaker.hourlyAutonomousOutflow[a];
      if (ch !== undefined && (nh === undefined || BigInt(nh) > BigInt(ch))) reasons.push(`raise or remove ${t.symbol} hourly autonomous outflow cap`);
    }
    if (next.allowContractRecipients && !current.allowContractRecipients) reasons.push('allow contract recipients');
    if (current.dailyUsdLimit !== null && (next.dailyUsdLimit === null || Number(next.dailyUsdLimit) > Number(current.dailyUsdLimit))) reasons.push('raise or remove the USD daily limit');
    if (next.circuitBreaker.maxConsecutiveFailures > current.circuitBreaker.maxConsecutiveFailures) reasons.push('raise the failure circuit-breaker threshold');
    return reasons;
  }

  async function update(patch, actor, { allowLoosening = false, via = 'console' } = {}) {
    const current = await get();
    const merged = policySettingsSchema.parse({
      ...current,
      ...patch,
      reserveFloors: { ...current.reserveFloors, ...normalizeTokenKeys(patch.reserveFloors, config) },
      autoApprovalMaxPerTx: patch.autoApprovalMaxPerTx ? normalizeTokenKeys(patch.autoApprovalMaxPerTx, config) : current.autoApprovalMaxPerTx,
      circuitBreaker: {
        ...current.circuitBreaker,
        ...(patch.circuitBreaker || {}),
        hourlyAutonomousOutflow: patch.circuitBreaker?.hourlyAutonomousOutflow
          ? normalizeTokenKeys(patch.circuitBreaker.hourlyAutonomousOutflow, config)
          : current.circuitBreaker.hourlyAutonomousOutflow,
      },
    });
    const loosening = loosens(current, merged);
    if (loosening.length && !allowLoosening) {
      throw conflict('LOOSENING_REQUIRES_OWNER_CONSOLE', `This change loosens policy (${loosening.join(', ')}); confirm it in the Risk settings page.`, { loosening });
    }
    await repos.settings.set(KEY, merged, actor);
    await repos.audit.append({ actor, action: 'POLICY_SETTINGS_UPDATED', entityType: 'settings', entityId: KEY, details: { via, loosening, settings: merged } });
    return merged;
  }

  async function automationState() {
    return repos.settings.get(AUTOMATION_KEY, { paused: false, reason: null, by: null, at: null });
  }

  async function setAutomationPaused(paused, actor, reason = null) {
    const value = { paused: Boolean(paused), reason, by: actor, at: new Date().toISOString() };
    await repos.settings.set(AUTOMATION_KEY, value, actor);
    await repos.audit.append({ actor, action: paused ? 'AUTOMATION_PAUSED' : 'AUTOMATION_RESUMED', entityType: 'automation', entityId: 'automation', details: { reason } });
    return value;
  }

  return { get, update, loosens, automationState, setAutomationPaused, defaults: DEFAULTS };
}
