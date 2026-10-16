import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { routeApproval, explainDecision } from './policyService.js';
import { scheduleSchema, conditionSchema, firstOccurrence, nextOccurrence, grantTypedData, recoverGrantSigner, verifyGrant, describeSchedule } from '../lib/schedule.js';
import { normalizeAddress, sameAddress } from '../lib/address.js';
import { parseAmount, formatAmount } from '../lib/units.js';
import { nowSeconds } from '../lib/time.js';
import { Mutex } from '../lib/mutex.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';

// Violations that may clear on their own (fees, balances, daily caps, pauses) are retried with backoff.
const TRANSIENT_POLICY = new Set(['GAS_PRICE', 'EXECUTOR_GAS', 'BALANCE_AND_RESERVE', 'DAILY_LIMIT', 'USD_DAILY_LIMIT', 'CONTRACT_ACTIVE', 'AGENT_ACTIVE', 'AUTOMATION_ACTIVE', 'SIMULATION']);
const TRANSIENT_EXECUTION = new Set(['TX_NOT_FOUND', 'GAS_PRICE_TOO_HIGH', 'EXECUTOR_GAS_INSUFFICIENT', 'FEE_DATA_UNAVAILABLE', 'PREFLIGHT_POLICY_FAILED', 'SIMULATION_REVERTED']);
const MAX_HORIZON_SECONDS = 365 * 86400;

/**
 * Persistent, permission-bounded autonomous execution.
 *
 * A task is created PENDING_AUTHORIZATION and does nothing until the contract owner signs its
 * EIP-712 grant (token, recipient, exact amount per run, max runs, max total, expiry, schedule hash,
 * execution window). Each occurrence becomes an idempotent task_run (unique run_key). A run creates
 * a normal proposal that goes through the same risk engine as everything else, then is either
 * approved by the grant (only within the grant bounds AND the owner's auto-approval limit) or
 * escalated to the owner. Execution uses the limited agent key; the contract enforces the caps again.
 */
export function createSchedulerService({ config, repos, chain, auth, proposals, policySettings, timing, agentControl, logger, instanceId = crypto.randomUUID() }) {
  const runMutex = new Mutex();
  let timer = null;
  let ticking = false;
  const status = { lastTickAt: null, lastError: null, instanceId, ticks: 0 };

  const audit = (actor, action, entityId, details) => repos.audit.append({ actor, action, entityType: 'task', entityId, details });

  // ------------------------------------------------------------------ creation & authorization

  async function create(input, actor, { source = 'MANUAL', conversationId = null } = {}) {
    await auth.assertOwner(actor);
    const token = chain.findToken(normalizeAddress(input.token, 'token', { allowZero: true }));
    if (!token) throw badRequest('UNSUPPORTED_TOKEN', 'Token is not supported on this deployment');
    const recipient = normalizeAddress(input.recipient, 'recipient');
    if (!(await chain.isRecipientAllowed(recipient))) {
      throw badRequest('RECIPIENT_NOT_ALLOWLISTED', 'Recipient must be on the on-chain allowlist before a task can target it');
    }
    const amountWei = parseAmount(input.amount, token.decimals);
    const snapshot = await chain.getSnapshot();
    const live = snapshot.tokens.find((t) => t.address === token.address);
    if (!live?.enabled) throw badRequest('TOKEN_DISABLED', `${token.symbol} is disabled on-chain`);
    if (amountWei > live.perTxLimit) throw badRequest('ABOVE_PER_TX_CAP', `Amount exceeds the on-chain per-transaction cap of ${formatAmount(live.perTxLimit, token.decimals)} ${token.symbol}`);

    const schedule = scheduleSchema.parse(input.schedule);
    const condition = input.condition ? conditionSchema.parse(input.condition) : null;
    const now = nowSeconds();
    const kind = condition ? 'CONDITIONAL' : schedule.type === 'once' ? 'ONE_TIME' : 'RECURRING';
    if (condition && schedule.type !== 'once') throw badRequest('INVALID_TASK', 'Conditional tasks use a "once" schedule as their earliest check time');
    const validUntil = Number(input.validUntil);
    if (!Number.isInteger(validUntil) || validUntil <= now || validUntil > now + MAX_HORIZON_SECONDS) throw badRequest('INVALID_TASK', 'validUntil must be in the future and within 365 days');
    const maxRuns = input.maxRuns === undefined || input.maxRuns === null ? (kind === 'RECURRING' ? null : 1) : Number(input.maxRuns);
    const maxTotalWei = input.maxTotal ? parseAmount(input.maxTotal, token.decimals).toString() : null;
    if (kind === 'RECURRING' && maxRuns === null && maxTotalWei === null) throw badRequest('UNBOUNDED_TASK', 'Recurring tasks need maxRuns or maxTotal so the grant is bounded');
    const windowSeconds = Number(input.executionWindowSeconds || 0);
    if (windowSeconds < 0 || windowSeconds > 86400) throw badRequest('INVALID_TASK', 'executionWindowSeconds must be between 0 and 86400');
    if (schedule.type === 'interval' && windowSeconds >= schedule.everySeconds) throw badRequest('INVALID_TASK', 'The execution window must be shorter than the interval');
    if (input.useRlTiming && windowSeconds < 2 * config.scheduler.gasSampleSeconds) {
      throw badRequest('WINDOW_TOO_SHORT_FOR_RL', `RL timing needs an execution window of at least ${2 * config.scheduler.gasSampleSeconds}s (two gas-sampling steps); otherwise it could never defer`);
    }

    const draft = {
      id: crypto.randomUUID(),
      createdBy: actor,
      source,
      conversationId,
      kind,
      status: 'PENDING_AUTHORIZATION',
      title: String(input.title || `${formatAmount(amountWei, token.decimals)} ${token.symbol} ${describeSchedule(schedule)}`).slice(0, 160),
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      token: { address: token.address, symbol: token.symbol, decimals: token.decimals },
      recipient,
      amountWei: amountWei.toString(),
      schedule,
      condition,
      executionWindowSeconds: windowSeconds,
      useRlTiming: Boolean(input.useRlTiming),
      maxRuns,
      maxTotalWei,
      validUntil,
      retryMaxAttempts: Number(input.retryMaxAttempts || 3),
      retryBackoffSeconds: Number(input.retryBackoffSeconds || 60),
      nextRunAt: null,
    };
    draft.grantTypedData = grantTypedData(draft);
    const task = await repos.tasks.insert(draft);
    await audit(actor, 'TASK_CREATED', task.id, { source, kind, title: task.title, schedule, condition, amountWei: task.amountWei, recipient, maxRuns, maxTotalWei, validUntil });
    return task;
  }

  async function authorize(id, signature, session) {
    await auth.assertOwner(session.address);
    const task = await repos.tasks.findById(id);
    if (!task) throw notFound('Task not found');
    if (task.status !== 'PENDING_AUTHORIZATION') throw conflict('INVALID_STATE', `Task is ${task.status}`);
    let signer;
    try {
      signer = recoverGrantSigner(task, signature);
    } catch {
      throw unauthorized('Grant signature is malformed');
    }
    if (!sameAddress(signer, session.address)) throw unauthorized('Grant signature was not produced by the signed-in owner for this exact task');
    const now = nowSeconds();
    if (task.validUntil <= now) throw conflict('TASK_EXPIRED', 'Task grant has already expired');
    const nextRunAt = firstOccurrence(task.schedule, now);
    const active = await repos.tasks.transition(id, ['PENDING_AUTHORIZATION'], 'ACTIVE', {
      grantSignature: signature, authorizedBy: signer, authorizedAt: now, nextRunAt: nextRunAt === null ? now : Math.max(nextRunAt, now),
    });
    if (!active) throw conflict('INVALID_STATE', 'Task changed state during authorization');
    await audit(session.address, 'TASK_AUTHORIZED', id, { signature, grant: task.grantTypedData.message });
    return active;
  }

  async function setStatus(id, action, session, reason = null) {
    if (session) await auth.assertOwner(session.address);
    const actor = session?.address || 'system';
    const task = await repos.tasks.findById(id);
    if (!task) throw notFound('Task not found');
    let updated;
    if (action === 'pause') updated = await repos.tasks.transition(id, ['ACTIVE'], 'PAUSED', { statusReason: reason || 'Paused by owner' });
    else if (action === 'resume') updated = await repos.tasks.transition(id, ['PAUSED'], 'ACTIVE', { statusReason: null, consecutiveFailures: 0, nextRunAt: nextOccurrenceFromNow(task) });
    else if (action === 'cancel') updated = await repos.tasks.transition(id, ['PENDING_AUTHORIZATION', 'ACTIVE', 'PAUSED'], 'CANCELLED', { statusReason: reason || 'Cancelled by owner', nextRunAt: null });
    if (!updated) throw conflict('INVALID_STATE', `Cannot ${action} a task that is ${task.status}`);
    if (action === 'cancel') await closeOpenRuns(updated, 'Task cancelled');
    await audit(actor, `TASK_${action.toUpperCase()}`, id, { reason });
    return updated;
  }

  function nextOccurrenceFromNow(task) {
    const now = nowSeconds();
    if (task.kind === 'CONDITIONAL') return now;
    const n = firstOccurrence(task.schedule, now);
    return n === null ? null : n;
  }

  async function closeOpenRuns(task, reason) {
    for (const run of (await repos.runs.listForTask(task.id)).filter((r) => ['PENDING', 'DEFERRED', 'RETRY_WAIT', 'ESCALATED'].includes(r.status))) {
      if (run.status === 'ESCALATED' && run.proposalId) {
        const p = await repos.proposals.transition(run.proposalId, ['AWAITING_APPROVAL'], 'REJECTED', { resolvedBy: 'system', resolutionReason: reason, resolvedAt: nowSeconds() });
        if (p) await repos.tasks.releaseRun(task.id, task.amountWei);
      }
      await repos.runs.transition(run.id, [run.status], 'SKIPPED', { errorCode: 'TASK_CLOSED', errorMessage: reason });
    }
  }

  // ------------------------------------------------------------------ the loop

  async function evaluateCondition(task) {
    const c = task.condition;
    if (!c) return { met: true };
    const snapshot = await chain.getSnapshot();
    if (c.type === 'gas_below_gwei') {
      const fee = snapshot.gasPrice ?? snapshot.maxFeePerGas;
      const limit = ethers.parseUnits(c.gwei, 'gwei');
      return { met: fee !== null && fee <= limit, observed: fee === null ? null : ethers.formatUnits(fee, 'gwei'), detail: `gas ${fee === null ? 'unknown' : ethers.formatUnits(fee, 'gwei')} gwei vs ${c.gwei}` };
    }
    const t = snapshot.tokens.find((x) => x.address.toLowerCase() === c.token.toLowerCase());
    const met = Boolean(t) && t.balance > BigInt(c.amountWei);
    return { met, detail: t ? `balance ${formatAmount(t.balance, t.decimals)} vs threshold ${formatAmount(c.amountWei, t.decimals)}` : 'token not configured' };
  }

  /** Turns a due task occurrence into an idempotent run and advances the schedule. */
  async function processDueTask(task) {
    const now = nowSeconds();
    if (task.validUntil <= now) {
      await repos.tasks.release(task.id, instanceId, {});
      await repos.tasks.transition(task.id, ['ACTIVE'], 'EXPIRED', { statusReason: 'Grant expired', nextRunAt: null });
      await audit('scheduler', 'TASK_EXPIRED', task.id, {});
      return;
    }
    if (task.kind === 'CONDITIONAL') {
      const cond = await evaluateCondition(task);
      if (!cond.met) {
        await repos.tasks.release(task.id, instanceId, { nextRunAt: now + config.scheduler.conditionCheckSeconds, lastError: null, statusReason: `Waiting for condition: ${cond.detail}` });
        return;
      }
    }
    const occurrence = task.nextRunAt;
    const deadline = Math.min(occurrence + task.executionWindowSeconds, task.validUntil);
    const { created } = await repos.runs.getOrCreate({ taskId: task.id, scheduledFor: occurrence, deadlineAt: Math.max(deadline, occurrence) });
    let next = null;
    if (task.kind === 'RECURRING') {
      next = nextOccurrence(task.schedule, occurrence);
      while (next !== null && next <= now) next = nextOccurrence(task.schedule, next); // skip missed occurrences
      if (next !== null && next > task.validUntil) next = null;
    }
    await repos.tasks.release(task.id, instanceId, { nextRunAt: next, statusReason: task.kind === 'CONDITIONAL' ? 'Condition met' : null });
    if (created) await audit('scheduler', 'TASK_RUN_CREATED', task.id, { scheduledFor: occurrence, deadline });
  }

  function isTransientPolicy(policy) {
    return policy.violations.length > 0 && policy.violations.every((v) => TRANSIENT_POLICY.has(v.id));
  }

  async function failOrRetry(run, task, { code, message, retryable, decision = null }) {
    const attemptsLeft = run.attempt < task.retryMaxAttempts;
    const now = nowSeconds();
    if (retryable && attemptsLeft && now < run.deadlineAt + config.proposalTtlSeconds + task.retryBackoffSeconds * task.retryMaxAttempts) {
      const backoff = task.retryBackoffSeconds * 2 ** Math.max(0, run.attempt - 1);
      await repos.runs.transition(run.id, [run.status], 'RETRY_WAIT', { errorCode: code, errorMessage: message, nextAttemptAt: now + backoff, decision });
      await audit('scheduler', 'TASK_RUN_RETRY_SCHEDULED', task.id, { runId: run.id, attempt: run.attempt, backoff, code });
      return;
    }
    await repos.runs.transition(run.id, [run.status], 'FAILED', { errorCode: code, errorMessage: message, decision });
    const updated = await repos.tasks.update(task.id, { consecutiveFailures: task.consecutiveFailures + 1, lastError: `${code}: ${message}`.slice(0, 500) });
    await audit('scheduler', 'TASK_RUN_FAILED', task.id, { runId: run.id, code, message });
    const settings = await policySettings.get();
    if (updated.consecutiveFailures >= settings.circuitBreaker.maxConsecutiveFailures && updated.status === 'ACTIVE') {
      await repos.tasks.transition(task.id, ['ACTIVE'], 'PAUSED', { statusReason: `Circuit breaker: ${updated.consecutiveFailures} consecutive failed runs` });
      await audit('scheduler', 'TASK_CIRCUIT_BREAKER', task.id, { consecutiveFailures: updated.consecutiveFailures });
    }
    if (task.kind !== 'RECURRING' && !updated.nextRunAt) await repos.tasks.transition(task.id, ['ACTIVE'], 'FAILED', { statusReason: `${code}: ${message}`.slice(0, 300) });
  }

  /** Advances one open run. Safe to call concurrently: every state change is a compare-and-set. */
  async function processRun(run) {
    return runMutex.run(async () => {
      run = await repos.runs.findById(run.id);
      const task = await repos.tasks.findById(run.taskId);
      const now = nowSeconds();
      if (['EXECUTING', 'ESCALATED'].includes(run.status)) return reconcileRun(run, task);
      if (!['PENDING', 'DEFERRED', 'RETRY_WAIT'].includes(run.status)) return;
      if (['CANCELLED', 'EXPIRED', 'FAILED', 'COMPLETED'].includes(task.status)) {
        await repos.runs.transition(run.id, [run.status], 'SKIPPED', { errorCode: 'TASK_CLOSED', errorMessage: `Task is ${task.status}` });
        return;
      }
      if (task.status !== 'ACTIVE') return; // paused: hold the run
      if (run.status === 'RETRY_WAIT' && run.nextAttemptAt > now) return;
      if (now > run.deadlineAt + config.proposalTtlSeconds && run.status !== 'RETRY_WAIT') {
        await repos.runs.transition(run.id, [run.status], 'SKIPPED', { errorCode: 'WINDOW_MISSED', errorMessage: 'Execution window passed before the run could start' });
        return;
      }
      if (await agentControl.isPaused()) return;
      if ((await policySettings.automationState()).paused) return;

      // RL timing: may only defer within the window; never past the deadline.
      let timingAdvice = run.timingAdvice;
      if (task.useRlTiming && task.executionWindowSeconds > 0 && run.status !== 'RETRY_WAIT') {
        timingAdvice = await timing.advise({ deadlineAt: run.deadlineAt, windowSeconds: task.executionWindowSeconds, now });
        if (timingAdvice.deferred) {
          await repos.runs.transition(run.id, [run.status], 'DEFERRED', { timingAdvice, decision: explainDecision({ policy: null, timing: timingAdvice, outcome: 'DEFERRED' }) });
          return;
        }
      }

      // Claim the attempt (compare-and-set on status + attempt) so concurrent schedulers cannot both act.
      const claimed = await repos.runs.claim(run.id, [run.status], run.attempt);
      if (!claimed) return;
      run = await repos.runs.update(claimed.id, { timingAdvice: timingAdvice || null });

      const reserved = await repos.tasks.reserveRun(task.id, task.amountWei);
      if (!reserved) {
        await repos.runs.transition(run.id, ['CLAIMED'], 'SKIPPED', { errorCode: 'GRANT_EXHAUSTED', errorMessage: 'Authorized runs or total are used up' });
        await repos.tasks.transition(task.id, ['ACTIVE', 'PAUSED'], 'COMPLETED', { statusReason: 'Grant bounds reached', nextRunAt: null });
        return;
      }
      run = await repos.runs.update(run.id, { decision: { reserved: true } });

      let proposal;
      try {
        proposal = await proposals.create({ tokenAddress: task.token.address, recipient: task.recipient, amountWeiOverride: task.amountWei, source: 'TASK', taskRunId: run.id, memo: `Task: ${task.title}`.slice(0, 200) }, `task:${task.id}`);
      } catch (err) {
        await repos.tasks.releaseRun(task.id, task.amountWei);
        return failOrRetry(run, task, { code: err.code || 'PROPOSAL_ERROR', message: err.message, retryable: err.status >= 500 || err.status === undefined });
      }
      run = await repos.runs.update(run.id, { proposalId: proposal.id });
      return routeRun(run, task, proposal, timingAdvice);
    });
  }

  /** Decides AUTO_GRANT vs ESCALATE for a run whose proposal exists, and acts on it. */
  async function routeRun(run, task, proposal, timingAdvice) {
      const now = nowSeconds();
      if (proposal.status === 'POLICY_REJECTED') {
        await repos.tasks.releaseRun(task.id, task.amountWei);
        const decision = explainDecision({ policy: proposal.policyResult, timing: timingAdvice });
        return failOrRetry(run, task, { code: 'POLICY_REJECTED', message: decision.headline, retryable: isTransientPolicy(proposal.policyResult), decision });
      }

      const settings = await policySettings.get();
      // Rebuilt from the task's columns, so a task edited after signing no longer verifies.
      const grant = verifyGrant(task);
      const grantValid = grant.valid
        && sameAddress(proposal.recipient, task.recipient)
        && sameAddress(proposal.token.address, task.token.address);
      if (!grant.valid) await audit('scheduler', 'TASK_GRANT_INVALID', task.id, { runId: run.id, reason: grant.reason });
      const owner = await chain.getOwner();
      let route = routeApproval({ task, proposal, settings, grantValid, ownerMatches: sameAddress(owner, task.authorizedBy), now });

      // Circuit breaker: rolling-hour autonomous outflow cap per asset.
      const hourlyCap = settings.circuitBreaker.hourlyAutonomousOutflow[task.token.address];
      if (route.route === 'AUTO_GRANT' && hourlyCap !== undefined) {
        const recent = await repos.runs.recentAutonomousOutflow(task.token.address, 3600);
        if (recent + BigInt(task.amountWei) > BigInt(hourlyCap)) {
          route = { route: 'ESCALATE', reasons: [`rolling-hour autonomous outflow would exceed the ${task.token.symbol} circuit-breaker cap; automation paused`] };
          await policySettings.setAutomationPaused(true, 'scheduler', `Circuit breaker: hourly autonomous ${task.token.symbol} outflow cap reached`);
        }
      }

      if (route.route === 'AUTO_GRANT') {
        const result = await proposals.approveByGrant(proposal.id, { task, route });
        if (!result.approved) {
          await repos.tasks.releaseRun(task.id, task.amountWei);
          return failOrRetry(run, task, { code: 'POLICY_REJECTED', message: result.explanation.headline, retryable: isTransientPolicy(result.policy), decision: result.explanation });
        }
        await repos.runs.transition(run.id, ['CLAIMED'], 'EXECUTING', { decision: { ...result.explanation, timing: timingAdvice || null } });
        await audit('scheduler', 'TASK_RUN_AUTO_APPROVED', task.id, { runId: run.id, proposalId: proposal.id });
      } else {
        const decision = explainDecision({ policy: proposal.policyResult, route, timing: timingAdvice });
        await repos.runs.transition(run.id, ['CLAIMED'], 'ESCALATED', { decision });
        await audit('scheduler', 'TASK_RUN_ESCALATED', task.id, { runId: run.id, proposalId: proposal.id, reasons: route.reasons });
      }
  }

  /** Crash recovery for runs left CLAIMED by a dead process. */
  async function recoverStaleClaims() {
    for (const run of await repos.runs.staleClaims(config.scheduler.leaseSeconds)) {
      const task = await repos.tasks.findById(run.taskId);
      const proposal = run.proposalId ? await repos.proposals.findById(run.proposalId) : await repos.proposals.findByTaskRun(run.id);
      if (!proposal) {
        if (run.decision?.reserved) await repos.tasks.releaseRun(task.id, task.amountWei);
        await repos.runs.transition(run.id, ['CLAIMED'], 'RETRY_WAIT', { errorCode: 'RECOVERED', errorMessage: 'Process stopped before a proposal was created', nextAttemptAt: nowSeconds() });
        await audit('scheduler', 'TASK_RUN_RECOVERED', task.id, { runId: run.id, action: 'retry' });
        continue;
      }
      const linked = await repos.runs.update(run.id, { proposalId: proposal.id });
      if (proposal.status === 'AWAITING_APPROVAL') await runMutex.run(() => routeRun(linked, task, proposal, run.timingAdvice));
      else if (['APPROVED', 'SUBMITTED', 'CONFIRMED', 'FAILED'].includes(proposal.status)) await repos.runs.transition(run.id, ['CLAIMED'], 'EXECUTING', {});
      else await failOrRetry(linked, task, { code: 'RECOVERED_' + proposal.status, message: 'Recovered after restart', retryable: proposal.status === 'POLICY_REJECTED' && isTransientPolicy(proposal.policyResult) });
      await audit('scheduler', 'TASK_RUN_RECOVERED', task.id, { runId: run.id, proposalStatus: proposal.status });
    }
  }

  async function reconcileRun(run, task) {
    if (!run.proposalId) return;
    const p = await repos.proposals.findById(run.proposalId);
    if (!p) return;
    if (p.status === 'CONFIRMED') {
      await repos.runs.transition(run.id, [run.status], 'CONFIRMED', {});
      const t = await repos.tasks.update(task.id, { consecutiveFailures: 0, lastError: null });
      await audit('scheduler', 'TASK_RUN_CONFIRMED', task.id, { runId: run.id, proposalId: p.id });
      const exhausted = (t.maxRuns !== null && t.runsCount >= t.maxRuns) || (t.maxTotalWei !== null && BigInt(t.committedWei) + BigInt(t.amountWei) > BigInt(t.maxTotalWei));
      if (t.kind !== 'RECURRING' || exhausted || t.nextRunAt === null) {
        await repos.tasks.transition(task.id, ['ACTIVE', 'PAUSED'], 'COMPLETED', { statusReason: exhausted ? 'Grant bounds reached' : 'All runs completed', nextRunAt: null });
      }
    } else if (p.status === 'FAILED') {
      if (!(await chain.isIntentExecuted(p.intentId))) await repos.tasks.releaseRun(task.id, task.amountWei);
      const execution = await repos.executions.findByProposal(p.id);
      const code = execution?.errorCode || 'EXECUTION_FAILED';
      await failOrRetry(run, task, { code, message: execution?.errorMessage || p.resolutionReason || 'Execution failed', retryable: TRANSIENT_EXECUTION.has(code) });
    } else if (['REJECTED', 'EXPIRED', 'POLICY_REJECTED'].includes(p.status) && run.status === 'ESCALATED') {
      await repos.tasks.releaseRun(task.id, task.amountWei);
      await repos.runs.transition(run.id, ['ESCALATED'], 'SKIPPED', { errorCode: `ESCALATION_${p.status}`, errorMessage: p.resolutionReason || `Owner did not approve (${p.status})` });
    } else if (['APPROVED', 'SUBMITTED'].includes(p.status) && run.status === 'ESCALATED') {
      await repos.runs.transition(run.id, ['ESCALATED'], 'EXECUTING', {});
    }
  }

  async function sampleGasIfDue() {
    const last = await repos.market.lastGasSampleAt(config.chainId);
    if (last && nowSeconds() - last < config.scheduler.gasSampleSeconds) return false;
    const [block, fee] = await Promise.all([chain.provider.getBlock('latest'), chain.provider.getFeeData()]);
    const price = fee.gasPrice ?? fee.maxFeePerGas;
    if (!block || price === null || price === undefined) return false;
    await repos.market.addGasSample({ chainId: config.chainId, blockNumber: block.number, gasPriceWei: price.toString(), baseFeeWei: block.baseFeePerGas?.toString() ?? null });
    return true;
  }

  /** One scheduler pass. Re-entrant calls are ignored; concurrent instances coordinate through leases. */
  async function tick() {
    if (ticking) return status;
    ticking = true;
    try {
      if (!chain.status.ready) return status;
      await sampleGasIfDue().catch((e) => logger.warn('Gas sampling failed', { error: e.message }));
      await recoverStaleClaims().catch((e) => logger.warn('Claim recovery failed', { error: e.message }));
      for (const run of await repos.runs.listOpen()) await processRun(run).catch((e) => logger.error('Run processing failed', { runId: run.id, error: e.message }));
      const agentPaused = await agentControl.isPaused();
      const automation = await policySettings.automationState();
      if (!agentPaused && !automation.paused) {
        for (const task of await repos.tasks.leaseDue(instanceId, config.scheduler.leaseSeconds)) {
          await processDueTask(task).catch(async (e) => {
            logger.error('Task processing failed', { taskId: task.id, error: e.message });
            await repos.tasks.release(task.id, instanceId, { lastError: e.message.slice(0, 500) });
          });
        }
        for (const run of (await repos.runs.listOpen()).filter((r) => r.status === 'PENDING')) {
          await processRun(run).catch((e) => logger.error('Run processing failed', { runId: run.id, error: e.message }));
        }
      }
      status.ticks += 1;
      status.lastError = null;
    } catch (err) {
      status.lastError = err.message;
      logger.warn('Scheduler tick failed', { error: err.message });
    } finally {
      status.lastTickAt = Date.now();
      ticking = false;
    }
    return status;
  }

  /** EIP-712 digest of the signed grant; on contract v2 this is the key for grantRuns/grantSpent/revokeGrant. */
  function grantDigestOf(task) {
    if (!task.grantSignature || !task.grantTypedData) return null;
    const { domain, types, message } = task.grantTypedData;
    return ethers.TypedDataEncoder.hash(domain, types, message);
  }

  async function get(id) {
    const task = await repos.tasks.findById(id);
    if (!task) throw notFound('Task not found');
    const grantDigest = grantDigestOf(task);
    let onChainGrant = null;
    if (grantDigest && chain.contractVersion() >= 2) {
      const [runs, spent, revoked] = await Promise.all([chain.contract.grantRuns(grantDigest), chain.contract.grantSpent(grantDigest), chain.contract.grantRevoked(grantDigest)]);
      onChainGrant = { runs: Number(runs), spentWei: spent.toString(), revoked: Boolean(revoked) };
    }
    return { ...task, grantDigest, onChainGrant, scheduleDescription: describeSchedule(task.schedule), amountFormatted: formatAmount(task.amountWei, task.token.decimals), runs: await repos.runs.listForTask(id) };
  }

  /** On v2, whether the signed grant was revoked on-chain (null when unknown or not applicable). */
  async function grantRevokedOnChain(task, grantDigest) {
    if (!grantDigest || chain.contractVersion() < 2 || !['ACTIVE', 'PAUSED', 'CANCELLED'].includes(task.status)) return null;
    try {
      return Boolean(await chain.contract.grantRevoked(grantDigest));
    } catch {
      return null;
    }
  }

  async function list(filter) {
    const tasks = await repos.tasks.list(filter);
    return Promise.all(tasks.map(async (t) => {
      const grantDigest = grantDigestOf(t);
      return { ...t, grantDigest, grantRevokedOnChain: await grantRevokedOnChain(t, grantDigest), scheduleDescription: describeSchedule(t.schedule), amountFormatted: formatAmount(t.amountWei, t.token.decimals) };
    }));
  }

  return {
    create,
    authorize,
    pause: (id, s, r) => setStatus(id, 'pause', s, r),
    resume: (id, s) => setStatus(id, 'resume', s),
    cancel: (id, s, r) => setStatus(id, 'cancel', s, r),
    get,
    list,
    tick,
    recoverStaleClaims,
    status,
    instanceId,
    start() {
      if (timer) return;
      timer = setInterval(() => tick(), config.scheduler.tickMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
