import crypto from 'node:crypto';
import { Router } from 'express';
import { ethers } from 'ethers';
import * as s from './schemas.js';
import { validate } from '../middleware/validate.js';
import { requireSession, requireOwner } from '../middleware/auth.js';
import { AppError, badRequest, conflict, unprocessable } from '../lib/errors.js';
import { normalizeAddress } from '../lib/address.js';
import { formatAmount } from '../lib/units.js';
import { AGENT_WALLET_ABI, serializeSnapshot } from '../services/chainService.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export function createApiRouter(deps) {
  const { config, repos, chain, auth, proposals, agentControl, history, rl, executor, indexer, scheduler, policySettings, portfolio, agentChat, timing, prices, limits } = deps;
  const router = Router();
  const session = requireSession(auth);
  const owner = requireOwner(auth);

  // ---------------------------------------------------------------- public
  router.get('/config', wrap(async (_req, res) => {
    ok(res, {
      chainId: config.chainId,
      networkName: config.network.name,
      isPublicNetwork: config.network.isPublic,
      explorerBaseUrl: config.network.explorerBaseUrl,
      // Never echo the configured RPC URL for public networks: it may embed a provider API key.
      walletRpcUrl: config.network.isPublic ? config.network.defaultRpcUrl : config.rpcUrl,
      contractAddress: config.contractAddress,
      contractConfigured: Boolean(config.contractAddress),
      executorAddress: config.executor.address,
      executorEnabled: config.executor.enabled,
      tokens: config.tokens,
      proposalTtlSeconds: config.proposalTtlSeconds,
      chainReady: chain.status.ready,
      chainError: chain.status.error,
      abi: AGENT_WALLET_ABI,
    });
  }));

  // ---------------------------------------------------------------- auth
  router.post('/auth/nonce', limits.auth, validate(s.nonceRequest), wrap(async (req, res) => {
    ok(res, await auth.issueNonce(req.valid.body.address));
  }));

  router.post('/auth/verify', limits.auth, validate(s.verifyRequest), wrap(async (req, res) => {
    ok(res, await auth.verifySignIn(req.valid.body));
  }));

  router.get('/auth/session', session, wrap(async (req, res) => {
    ok(res, { ...req.session, role: await auth.roleFor(req.session.address) });
  }));

  router.post('/auth/logout', session, wrap(async (req, res) => {
    await auth.signOut(req.session);
    ok(res, { signedOut: true });
  }));

  // ---------------------------------------------------------------- wallet
  router.get('/wallet/state', session, wrap(async (_req, res) => {
    const snapshot = await chain.getSnapshot();
    const pause = await agentControl.getPauseState();
    const data = serializeSnapshot(snapshot);
    data.tokens = snapshot.tokens.map((t) => ({
      ...serializeSnapshot(t),
      formatted: {
        balance: formatAmount(t.balance, t.decimals),
        perTxLimit: formatAmount(t.perTxLimit, t.decimals),
        dailyLimit: formatAmount(t.dailyLimit, t.decimals),
        spentToday: formatAmount(t.spentToday, t.decimals),
        remainingToday: formatAmount(t.remainingToday, t.decimals),
      },
    }));
    data.executorBalanceEth = snapshot.executorBalance === null ? null : ethers.formatEther(snapshot.executorBalance);
    data.gasPriceGwei = snapshot.gasPrice === null ? null : ethers.formatUnits(snapshot.gasPrice, 'gwei');
    data.agentPaused = pause;
    data.executorIsOnChainAgent = Boolean(config.executor.address) && snapshot.agent.toLowerCase() === config.executor.address.toLowerCase();
    data.contractExplorerUrl = chain.addressUrl(config.contractAddress);
    ok(res, data);
  }));

  router.get('/recipients', session, wrap(async (_req, res) => ok(res, await history.recipients())));

  router.put('/recipients/:address/label', limits.mutation, owner, validate(s.addressParam, 'params'), validate(s.labelRequest), wrap(async (req, res) => {
    const address = normalizeAddress(req.valid.params.address, 'address');
    await repos.recipientLabels.upsert(address, req.valid.body.label, req.session.address, req.valid.body.category || null);
    await repos.audit.append({ actor: req.session.address, action: 'RECIPIENT_LABEL_SET', entityType: 'recipient', entityId: address, details: { label: req.valid.body.label, category: req.valid.body.category || null } });
    ok(res, { address, label: req.valid.body.label, category: req.valid.body.category || null });
  }));

  // ---------------------------------------------------------------- proposals
  router.get('/proposals', session, validate(s.listQuery, 'query'), wrap(async (req, res) => {
    const { status, limit } = req.valid.query;
    ok(res, await proposals.list({ status: status ? status.split(',') : null, limit }));
  }));

  router.get('/proposals/:id', session, validate(s.idParam, 'params'), wrap(async (req, res) => {
    ok(res, await proposals.get(req.valid.params.id));
  }));

  router.post('/proposals', limits.mutation, owner, validate(s.createProposalRequest), wrap(async (req, res) => {
    const { token, recipient, amount, memo } = req.valid.body;
    const created = await proposals.create({ tokenAddress: token, recipient, amount, memo, source: 'MANUAL' }, req.session.address);
    ok(res, await proposals.get(created.id), 201);
  }));

  router.post('/proposals/:id/approve', limits.mutation, owner, validate(s.idParam, 'params'), validate(s.approveRequest), wrap(async (req, res) => {
    const key = s.idempotencyKey.safeParse(req.get('idempotency-key'));
    if (!key.success) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', key.error.issues[0].message);
    const { id } = req.valid.params;
    const requestHash = crypto.createHash('sha256').update(`${id}:${req.valid.body.signature}`).digest('hex');
    const claim = await repos.idempotency.begin(key.data, `approve:${req.session.address.toLowerCase()}`, requestHash);
    if (claim.state === 'replay') {
      res.set('Idempotent-Replayed', 'true');
      return res.status(claim.statusCode).json(claim.response);
    }
    if (claim.state === 'mismatch') throw unprocessable('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used for a different request');
    if (claim.state === 'in_progress') throw conflict('REQUEST_IN_PROGRESS', 'An identical approval request is still being processed');
    try {
      const result = await proposals.approve(id, req.valid.body, req.session);
      const body = { success: true, data: result };
      await repos.idempotency.complete(key.data, 200, body);
      res.json(body);
    } catch (err) {
      if (err instanceof AppError && err.status < 500) {
        await repos.idempotency.complete(key.data, err.status, { success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
      } else {
        await repos.idempotency.release(key.data);
      }
      throw err;
    }
  }));

  router.post('/proposals/:id/reject', limits.mutation, owner, validate(s.idParam, 'params'), validate(s.rejectRequest), wrap(async (req, res) => {
    ok(res, await proposals.reject(req.valid.params.id, req.valid.body.reason, req.session));
  }));

  // ---------------------------------------------------------------- agent
  router.get('/agent/status', session, wrap(async (_req, res) => {
    const [pause, automation, pending, rlHealth] = await Promise.all([
      agentControl.getPauseState(),
      policySettings.automationState(),
      repos.proposals.list({ status: ['AWAITING_APPROVAL'], limit: 200 }),
      rl.health(),
    ]);
    ok(res, {
      paused: Boolean(pause.paused),
      pause,
      automation,
      pendingApprovals: pending.length,
      executor: { enabled: executor.enabled, address: executor.address, credentialSource: config.executor.source.kind },
      llm: agentChat.status(),
      rlEngine: rlHealth,
      scheduler: scheduler.status,
      indexer: indexer.status,
    });
  }));

  router.post('/agent/pause', limits.mutation, owner, validate(s.pauseRequest), wrap(async (req, res) => {
    ok(res, await agentControl.setPaused(true, req.session.address, req.valid.body.reason || null));
  }));

  router.post('/agent/resume', limits.mutation, owner, validate(s.pauseRequest), wrap(async (req, res) => {
    ok(res, await agentControl.setPaused(false, req.session.address, req.valid.body.reason || null));
  }));

  router.post('/agent/chat', limits.mutation, owner, validate(s.chatRequest), wrap(async (req, res) => {
    ok(res, await agentChat.chat(req.valid.body, req.session));
  }));
  router.get('/agent/conversations', owner, wrap(async (req, res) => ok(res, await agentChat.conversations(req.session))));
  router.get('/agent/conversations/:id', owner, validate(s.idParam, 'params'), wrap(async (req, res) => ok(res, await agentChat.conversation(req.valid.params.id, req.session))));

  // ---------------------------------------------------------------- autonomous tasks
  router.get('/tasks', session, wrap(async (_req, res) => ok(res, await scheduler.list({ limit: 200 }))));
  router.get('/tasks/:id', session, validate(s.idParam, 'params'), wrap(async (req, res) => ok(res, await scheduler.get(req.valid.params.id))));
  router.post('/tasks', limits.mutation, owner, validate(s.createTaskRequest), wrap(async (req, res) => {
    const task = await scheduler.create(req.valid.body, req.session.address, { source: 'MANUAL' });
    ok(res, await scheduler.get(task.id), 201);
  }));
  router.post('/tasks/:id/authorize', limits.mutation, owner, validate(s.idParam, 'params'), validate(s.approveRequest), wrap(async (req, res) => {
    ok(res, await scheduler.authorize(req.valid.params.id, req.valid.body.signature, req.session));
  }));
  for (const action of ['pause', 'resume', 'cancel']) {
    router.post(`/tasks/:id/${action}`, limits.mutation, owner, validate(s.idParam, 'params'), validate(s.pauseRequest), wrap(async (req, res) => {
      ok(res, await scheduler[action](req.valid.params.id, req.session, req.valid.body.reason || null));
    }));
  }
  router.get('/automation', session, wrap(async (_req, res) => ok(res, { ...(await policySettings.automationState()), scheduler: scheduler.status })));
  router.post('/automation/pause', limits.mutation, owner, validate(s.pauseRequest), wrap(async (req, res) => {
    ok(res, await policySettings.setAutomationPaused(true, req.session.address, req.valid.body.reason || 'Paused by owner'));
  }));
  router.post('/automation/resume', limits.mutation, owner, validate(s.pauseRequest), wrap(async (req, res) => {
    ok(res, await policySettings.setAutomationPaused(false, req.session.address, req.valid.body.reason || null));
  }));

  // ---------------------------------------------------------------- risk policy
  router.get('/policy', session, wrap(async (_req, res) => ok(res, await policySettings.get())));
  router.put('/policy', limits.mutation, owner, validate(s.policyUpdateRequest), wrap(async (req, res) => {
    const { confirmLoosening, ...patch } = req.valid.body;
    ok(res, await policySettings.update(patch, req.session.address, { allowLoosening: confirmLoosening === true, via: 'console' }));
  }));

  // ---------------------------------------------------------------- portfolio
  router.get('/portfolio', session, wrap(async (_req, res) => ok(res, await portfolio.overview())));
  router.get('/portfolio/spending', session, validate(s.spendingQuery, 'query'), wrap(async (req, res) => ok(res, await portfolio.spending({ days: req.valid.query.days }))));
  router.get('/portfolio/history', session, wrap(async (_req, res) => ok(res, await portfolio.history())));
  router.get('/portfolio/prices', session, wrap(async (_req, res) => ok(res, await prices.prices())));
  router.put('/portfolio/targets', limits.mutation, owner, validate(s.targetsRequest), wrap(async (req, res) => ok(res, await portfolio.setTargets(req.valid.body.targets, req.session.address))));

  // ---------------------------------------------------------------- transactions & audit
  router.get('/transactions', session, wrap(async (_req, res) => ok(res, await history.list(100))));

  router.post('/transactions/track', limits.mutation, session, validate(s.trackRequest), wrap(async (req, res) => {
    ok(res, await history.track(req.valid.body.txHash));
  }));

  router.get('/audit', session, wrap(async (_req, res) => ok(res, await repos.audit.list({ limit: 200 }))));
  router.get('/audit/verify', session, wrap(async (_req, res) => ok(res, await repos.audit.verify())));

  // ---------------------------------------------------------------- RL execution-timing advisor
  router.get('/rl/models', session, wrap(async (_req, res) => ok(res, await rl.models())));
  router.post('/rl/models/reload', limits.mutation, owner, wrap(async (_req, res) => ok(res, await rl.reload())));
  router.post('/rl/models/select', limits.mutation, owner, validate(s.rlSelectRequest), wrap(async (req, res) => ok(res, await rl.select(req.valid.body.agentType))));
  router.post('/rl/evaluate', limits.mutation, owner, validate(s.rlEvaluateRequest), wrap(async (req, res) => ok(res, await rl.evaluate(req.valid.body.episodes))));
  router.post('/rl/timing-preview', limits.mutation, session, validate(s.timingPreviewRequest), wrap(async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    ok(res, await timing.advise({ deadlineAt: now + req.valid.body.windowSeconds, windowSeconds: req.valid.body.windowSeconds, now, agentType: req.valid.body.agentType }));
  }));

  return router;
}
