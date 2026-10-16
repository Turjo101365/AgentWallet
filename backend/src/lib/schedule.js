import { z } from 'zod';
import { ethers } from 'ethers';

const MIN_INTERVAL_SECONDS = 10;

export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('once'), at: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('interval'), everySeconds: z.number().int().min(MIN_INTERVAL_SECONDS).max(86400 * 90), startAt: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('weekly'), weekday: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict(),
]);

export const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('gas_below_gwei'), gwei: z.string().regex(/^\d+(\.\d{1,9})?$/) }).strict(),
  z.object({ type: z.literal('balance_above'), token: z.string().regex(/^0x[0-9a-fA-F]{40}$/), amountWei: z.string().regex(/^\d+$/) }).strict(),
]);

/** Next occurrence strictly after `after` (unix seconds), or null if the schedule has no more. */
export function nextOccurrence(schedule, after) {
  if (schedule.type === 'once') return schedule.at > after ? schedule.at : null;
  if (schedule.type === 'interval') {
    if (schedule.startAt > after) return schedule.startAt;
    const k = Math.floor((after - schedule.startAt) / schedule.everySeconds) + 1;
    return schedule.startAt + k * schedule.everySeconds;
  }
  // weekly, UTC
  const d = new Date(after * 1000);
  const candidate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), schedule.hour, schedule.minute, 0) / 1000;
  const dayDiff = (schedule.weekday - d.getUTCDay() + 7) % 7;
  let t = candidate + dayDiff * 86400;
  if (t <= after) t += 7 * 86400;
  return t;
}

/** First occurrence at or after `from`. */
export function firstOccurrence(schedule, from) {
  if (schedule.type === 'once') return schedule.at;
  return nextOccurrence(schedule, from - 1);
}

export function describeSchedule(schedule) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (schedule.type === 'once') return `once at ${new Date(schedule.at * 1000).toISOString()}`;
  if (schedule.type === 'interval') return `every ${schedule.everySeconds}s starting ${new Date(schedule.startAt * 1000).toISOString()}`;
  return `every ${days[schedule.weekday]} at ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} UTC`;
}

const stable = (v) =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
      : JSON.stringify(v ?? null);

export function scheduleHash(schedule, condition) {
  return ethers.keccak256(ethers.toUtf8Bytes(stable({ schedule, condition: condition || null })));
}

/** EIP-712 grant the owner signs to authorize a task's bounded autonomous runs. */
export const GRANT_TYPES = {
  AuthorizeTask: [
    { name: 'taskId', type: 'string' },
    { name: 'token', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amountPerRun', type: 'uint256' },
    { name: 'maxRuns', type: 'uint256' },
    { name: 'maxTotal', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'scheduleHash', type: 'bytes32' },
    { name: 'executionWindowSeconds', type: 'uint256' },
  ],
};

export function grantTypedData(task) {
  return {
    domain: { name: 'AgentWallet Task Authorization', version: '1', chainId: task.chainId, verifyingContract: task.contractAddress },
    types: GRANT_TYPES,
    primaryType: 'AuthorizeTask',
    message: {
      taskId: task.id,
      token: task.token.address,
      recipient: task.recipient,
      amountPerRun: task.amountWei,
      maxRuns: String(task.maxRuns ?? 0),
      maxTotal: task.maxTotalWei ?? '0',
      validUntil: String(task.validUntil),
      scheduleHash: scheduleHash(task.schedule, task.condition),
      executionWindowSeconds: String(task.executionWindowSeconds),
    },
  };
}

export function recoverGrantSigner(task, signature) {
  const { domain, types, message } = task.grantTypedData;
  return ethers.verifyTypedData(domain, types, message, signature);
}

/**
 * Verifies a task grant against the fields that will actually be executed. The typed data is rebuilt
 * from the task's columns, never taken from the stored copy alone: the stored copy must match the
 * rebuild exactly, and the signature is recovered over the rebuild. So editing a task's recipient,
 * amount, bounds or schedule in the database after the owner signed invalidates the grant.
 * @returns {{ valid: boolean, signer: string|null, reason: string|null }}
 */
export function verifyGrant(task, signature = task.grantSignature) {
  let rebuilt;
  try {
    rebuilt = grantTypedData(task);
  } catch (err) {
    return { valid: false, signer: null, reason: `task fields cannot form a grant: ${err.message}` };
  }
  if (!task.grantTypedData || stable(rebuilt) !== stable(task.grantTypedData)) {
    return { valid: false, signer: null, reason: 'the stored grant does not match the task fields being executed' };
  }
  let signer;
  try {
    signer = ethers.verifyTypedData(rebuilt.domain, rebuilt.types, rebuilt.message, signature);
  } catch {
    return { valid: false, signer: null, reason: 'the grant signature is malformed' };
  }
  if (!task.authorizedBy || signer.toLowerCase() !== task.authorizedBy.toLowerCase()) {
    return { valid: false, signer, reason: 'the grant signature was not produced by the recorded authorizer' };
  }
  return { valid: true, signer, reason: null };
}
