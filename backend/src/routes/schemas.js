import { z } from 'zod';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte hex address');
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'must be a 65-byte hex signature');

export const nonceRequest = z.object({ address }).strict();
export const verifyRequest = z.object({ message: z.string().min(50).max(2000), signature }).strict();

// .strict(): unknown keys (e.g. overrideState, recipientOverride, walletState) are rejected outright.
export const createProposalRequest = z
  .object({
    token: address,
    recipient: address,
    amount: z.string().min(1).max(80),
    memo: z.string().max(200).optional(),
  })
  .strict();

export const approveRequest = z.object({ signature }).strict();
export const rejectRequest = z.object({ reason: z.string().max(300).optional() }).strict();
export const idParam = z.object({ id: z.string().uuid() }).strict();
export const listQuery = z
  .object({
    status: z.string().regex(/^[A-Z_]+(,[A-Z_]+)*$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const pauseRequest = z.object({ reason: z.string().max(300).optional() }).strict();
export const trackRequest = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).strict();
export const labelRequest = z.object({ label: z.string().min(1).max(80), category: z.enum(['supplier', 'payroll', 'operations', 'treasury', 'other']).optional() }).strict();
export const addressParam = z.object({ address }).strict();
export const rlSelectRequest = z.object({ agentType: z.enum(['PPO', 'DQN']) }).strict();
export const rlEvaluateRequest = z.object({ episodes: z.number().int().min(50).max(2000).default(300) }).strict();
export const timingPreviewRequest = z.object({ windowSeconds: z.number().int().min(60).max(86400), agentType: z.enum(['PPO', 'DQN']).optional() }).strict();

export const chatRequest = z.object({ message: z.string().min(1).max(4000), conversationId: z.string().uuid().nullable().optional() }).strict();

const wei = z.string().regex(/^\d+$/);
const decimalAmount = z.string().regex(/^\d+(\.\d+)?$/);
export const createTaskRequest = z
  .object({
    token: address,
    recipient: address,
    amount: decimalAmount,
    title: z.string().max(160).nullable().optional(),
    schedule: z.object({ type: z.enum(['once', 'interval', 'weekly']) }).passthrough(),
    condition: z.object({ type: z.enum(['gas_below_gwei', 'balance_above']) }).passthrough().nullable().optional(),
    maxRuns: z.number().int().min(1).max(1000).nullable().optional(),
    maxTotal: decimalAmount.nullable().optional(),
    validUntil: z.number().int().positive(),
    executionWindowSeconds: z.number().int().min(0).max(86400).optional(),
    useRlTiming: z.boolean().optional(),
    retryMaxAttempts: z.number().int().min(1).max(10).optional(),
    retryBackoffSeconds: z.number().int().min(1).max(86400).optional(),
  })
  .strict();

export const policyUpdateRequest = z
  .object({
    reserveFloors: z.record(z.string(), wei).optional(),
    autoApprovalMaxPerTx: z.record(z.string(), wei).optional(),
    allowContractRecipients: z.boolean().optional(),
    dailyUsdLimit: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
    circuitBreaker: z.object({ maxConsecutiveFailures: z.number().int().min(1).max(20).optional(), hourlyAutonomousOutflow: z.record(z.string(), wei).optional() }).strict().optional(),
    confirmLoosening: z.boolean().optional(),
  })
  .strict();

export const spendingQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).strict();
export const targetsRequest = z.object({ targets: z.record(z.string(), z.number().min(0).max(100)) }).strict();
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'Idempotency-Key must be 16-128 URL-safe characters');
