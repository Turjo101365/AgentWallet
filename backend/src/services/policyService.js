import { ethers } from 'ethers';
import { formatAmount } from '../lib/units.js';

/**
 * Deterministic risk and authorization policy. Pure: every input comes from the trusted
 * on-chain snapshot or server-side state, never from the client. The smart contract enforces
 * the same limits again on-chain; this layer adds reservations, reserves and gas checks and
 * explains failures before anything is signed.
 *
 * @param {object} intent   { tokenAddress, recipient, amountWei: bigint }
 * @param {object} snapshot chainService.getSnapshot() result
 * @param {object} ctx      { agentPaused, recipientAllowed, reservedWei, config }
 */
export function evaluatePolicy(intent, snapshot, ctx) {
  const { config } = ctx;
  const checks = [];
  const add = (id, passed, message, extra = {}) => checks.push({ id, passed: Boolean(passed), message, ...extra });

  const token = snapshot.tokens.find((t) => t.address.toLowerCase() === intent.tokenAddress.toLowerCase());
  const amount = BigInt(intent.amountWei);
  const fmt = (v) => (token ? `${formatAmount(v, token.decimals)} ${token.symbol}` : String(v));

  add('AGENT_ACTIVE', !ctx.agentPaused, ctx.agentPaused ? 'Agent execution is paused off-chain by the operator' : 'Agent is active');
  add('CONTRACT_ACTIVE', !snapshot.paused, snapshot.paused ? 'AgentWallet contract is paused on-chain' : 'Contract is not paused');

  const executorOk =
    Boolean(config.executor.enabled && snapshot.executorAddress) &&
    snapshot.agent.toLowerCase() === snapshot.executorAddress.toLowerCase();
  add(
    'EXECUTOR_AUTHORIZED',
    executorOk,
    !config.executor.enabled
      ? 'No executor key is configured on the backend'
      : executorOk
        ? `Executor ${snapshot.executorAddress} is the on-chain agent`
        : `On-chain agent is ${snapshot.agent}, not this backend's executor ${snapshot.executorAddress}`,
  );

  add('TOKEN_SUPPORTED', Boolean(token?.enabled), token ? (token.enabled ? `${token.symbol} is enabled on-chain` : `${token.symbol} is disabled on-chain`) : 'Token is not supported on this deployment');

  const recipient = intent.recipient;
  const recipientShapeOk =
    ethers.isAddress(recipient) &&
    recipient !== ethers.ZeroAddress &&
    recipient.toLowerCase() !== snapshot.contractAddress.toLowerCase() &&
    (!snapshot.executorAddress || recipient.toLowerCase() !== snapshot.executorAddress.toLowerCase());
  add('RECIPIENT_VALID', recipientShapeOk, recipientShapeOk ? 'Recipient address is valid' : 'Recipient must not be zero, the wallet contract or the executor');
  add('RECIPIENT_ALLOWLISTED', Boolean(ctx.recipientAllowed), ctx.recipientAllowed ? 'Recipient is on the on-chain allowlist' : 'Recipient is not on the on-chain allowlist');
  const settings = ctx.policySettings || {};
  if (ctx.recipientIsContract !== undefined) {
    const allowContracts = Boolean(settings.allowContractRecipients);
    add('RECIPIENT_TYPE', !ctx.recipientIsContract || allowContracts,
      ctx.recipientIsContract
        ? allowContracts ? 'Recipient is a contract (allowed by policy setting)' : 'Recipient is a contract; contract recipients are disabled in policy settings'
        : 'Recipient is an externally owned account');
  }

  add('AMOUNT_POSITIVE', amount > 0n, amount > 0n ? 'Amount is positive' : 'Amount must be greater than zero');

  if (token) {
    const reserved = BigInt(ctx.reservedWei || 0n);
    add('PER_TX_LIMIT', amount <= token.perTxLimit, `Amount ${fmt(amount)} vs per-transaction cap ${fmt(token.perTxLimit)}`, {
      observed: amount.toString(), limit: token.perTxLimit.toString(),
    });

    const committed = token.spentToday + reserved + amount;
    add('DAILY_LIMIT', committed <= token.dailyLimit,
      `Spent today ${fmt(token.spentToday)} + in-flight ${fmt(reserved)} + this ${fmt(amount)} vs daily cap ${fmt(token.dailyLimit)}`,
      { observed: committed.toString(), limit: token.dailyLimit.toString() });

    const configured = BigInt(settings.reserveFloors?.[token.address] || 0);
    const floor = token.native ? (configured > config.nativeReserveFloorWei ? configured : config.nativeReserveFloorWei) : configured;
    const required = amount + reserved + floor;
    add('BALANCE_AND_RESERVE', token.balance >= required,
      `Wallet holds ${fmt(token.balance)}; needs ${fmt(required)} (amount + in-flight + reserve floor ${fmt(floor)})`,
      { observed: token.balance.toString(), limit: required.toString() });
  }

  if (settings.dailyUsdLimit) {
    const usd = ctx.usd || {};
    if (!usd.available) {
      add('USD_DAILY_LIMIT', false, `USD daily limit is set but prices are unavailable or stale (${usd.reason || 'no price'}); failing closed`);
    } else {
      const total = Number(usd.spentTodayUsd) + Number(usd.reservedUsd || 0) + Number(usd.amountUsd);
      add('USD_DAILY_LIMIT', total <= Number(settings.dailyUsdLimit),
        `Aggregate today $${Number(usd.spentTodayUsd).toFixed(2)} + in-flight $${Number(usd.reservedUsd || 0).toFixed(2)} + this $${Number(usd.amountUsd).toFixed(2)} vs limit $${settings.dailyUsdLimit} (${usd.source})`,
        { observed: total.toFixed(2), limit: settings.dailyUsdLimit });
    }
  }

  const feeCap = snapshot.maxFeePerGas ?? snapshot.gasPrice;
  if (feeCap === null || feeCap === undefined) {
    add('GAS_PRICE', false, 'Network fee data unavailable');
  } else {
    add('GAS_PRICE', feeCap <= config.maxFeePerGasWei,
      `Max fee ${ethers.formatUnits(feeCap, 'gwei')} gwei vs cap ${ethers.formatUnits(config.maxFeePerGasWei, 'gwei')} gwei`,
      { observed: feeCap.toString(), limit: config.maxFeePerGasWei.toString() });
  }

  if (config.executor.enabled) {
    const bal = snapshot.executorBalance ?? 0n;
    add('EXECUTOR_GAS', bal >= config.minExecutorGasBalanceWei,
      `Executor holds ${ethers.formatEther(bal)} ETH for gas; minimum ${ethers.formatEther(config.minExecutorGasBalanceWei)} ETH`,
      { observed: bal.toString(), limit: config.minExecutorGasBalanceWei.toString() });
  }

  const violations = checks.filter((c) => !c.passed);
  return {
    passed: violations.length === 0,
    violations: violations.map((v) => ({ id: v.id, message: v.message })),
    checks,
    blockNumber: snapshot.blockNumber,
    evaluatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Decides whether an autonomous task run may be approved by its signed grant, or must escalate to a
 * human. Pure; inputs come from the database and the policy settings, never from the client or LLM.
 */
export function routeApproval({ task, proposal, settings, grantValid, ownerMatches, now = Math.floor(Date.now() / 1000) }) {
  const reasons = [];
  const amount = BigInt(proposal.amountWei);
  const threshold = settings.autoApprovalMaxPerTx?.[proposal.token.address];
  if (!grantValid) reasons.push('the task grant signature does not verify');
  if (!ownerMatches) reasons.push('the grant was signed by an address that is no longer the contract owner');
  if (task.validUntil <= now) reasons.push('the task grant has expired');
  if (amount !== BigInt(task.amountWei)) reasons.push('the amount differs from the authorized amount');
  if (task.maxRuns !== null && task.runsCount >= task.maxRuns) reasons.push('the authorized number of runs is used up');
  if (task.maxTotalWei !== null && BigInt(task.committedWei) + amount > BigInt(task.maxTotalWei)) reasons.push('the authorized total would be exceeded');
  if (threshold === undefined) reasons.push(`no auto-approval limit is configured for ${proposal.token.symbol}, so every run needs a human`);
  else if (amount > BigInt(threshold)) reasons.push(`the amount is above the ${proposal.token.symbol} auto-approval limit`);
  return reasons.length ? { route: 'ESCALATE', reasons } : { route: 'AUTO_GRANT', reasons: ['within the signed task grant and the auto-approval limit'] };
}

/** Human-readable explanation of a policy outcome (and, for tasks, approval routing / timing). */
export function explainDecision({ policy, route = null, timing = null, outcome = null }) {
  const failed = policy ? policy.checks.filter((c) => !c.passed) : [];
  const passed = policy ? policy.checks.filter((c) => c.passed) : [];
  let finalOutcome = outcome;
  if (!finalOutcome) {
    if (policy && !policy.passed) finalOutcome = 'REJECTED';
    else if (timing?.deferred) finalOutcome = 'DEFERRED';
    else if (route?.route === 'ESCALATE') finalOutcome = 'ESCALATED';
    else if (route?.route === 'AUTO_GRANT') finalOutcome = 'AUTO_APPROVED';
    else finalOutcome = 'ALLOWED_PENDING_APPROVAL';
  }
  const headline = {
    REJECTED: `Blocked by ${failed.length} policy check${failed.length === 1 ? '' : 's'}: ${failed.map((c) => c.id).join(', ')}`,
    DEFERRED: `Deferred by the timing advisor: ${timing?.reason || 'waiting for a cheaper fee'}`,
    ESCALATED: 'Passed policy but needs a human approval',
    AUTO_APPROVED: 'Passed policy and was approved by the signed task grant',
    ALLOWED_PENDING_APPROVAL: 'Passed policy; waiting for the owner to approve',
  }[finalOutcome] || finalOutcome;
  return {
    outcome: finalOutcome,
    headline,
    blockedBy: failed.map((c) => ({ id: c.id, message: c.message })),
    passedChecks: passed.map((c) => c.id),
    approvalRoute: route,
    timing,
  };
}
