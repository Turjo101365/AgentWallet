import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createApiRouter } from './routes/api.js';
import { createRateLimits } from './middleware/rateLimits.js';
import { requestId, createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createPublicRouter } from './routes/public.js';
import { createPersonalRouter } from './routes/personal.js';
import { createDemoRouter } from './routes/demo.js';
import { createAdminRouter } from './routes/admin.js';

export function createApp(container, { disableRateLimits = false } = {}) {
  const { config, logger, db, chain, rl, executor, indexer } = container;
  const app = express();
  const limits = createRateLimits({ disabled: disableRateLimits });

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet());
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (config.nodeEnv === 'production') {
    app.use((req, res, next) => {
      if (req.get('origin') && !config.corsOrigins.includes(req.get('origin'))) return res.status(403).json({ success: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed', requestId: req.id } });
      next();
    });
  }
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients send no Origin; browsers must be on the allowlist.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PUT'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(limits.global);

  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    const database = await db.ping().then(() => true, () => false);
    const live = container.judge ? (await container.judge.overview()).live : null;
    const aiConfigured = Boolean(config.publicAi?.enabled && container.llm?.available);
    const ready = database && (live ? live.status === 'ok' && live.safeStopped : chain.status.ready) && (!config.publicAi?.required || aiConfigured);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', database: database ? 'ok' : 'unavailable', chain: live?.status || (chain.status.ready ? 'ok' : 'unavailable'), safeStopped: live?.safeStopped ?? null,
      ai: { required: Boolean(config.publicAi?.required), configured: aiConfigured, providerVerified: false } });
  });
  app.get('/health', async (_req, res) => {
    if (container.judge) {
      const database = await db.ping().then(() => true, () => false);
      const { live } = await container.judge.overview();
      return res.status(database && live.status === 'ok' && live.safeStopped ? 200 : 503).json({ status: database && live.status === 'ok' && live.safeStopped ? 'ok' : 'degraded', mode: 'judge', executionEnabled: false, database: database ? 'ok' : 'unavailable', chain: live.status, safeStopped: live.safeStopped });
    }
    const database = await db.ping().then(() => 'ok', () => 'unavailable');
    const rlHealth = await rl.health();
    const checks = {
      database: { status: database, engine: db.kind },
      chain: { status: chain.status.ready ? 'ok' : 'error', error: chain.status.error, chainId: config.chainId, rpcChainId: chain.status.rpcChainId },
      contract: { address: config.contractAddress },
      executor: { status: executor.enabled ? 'enabled' : 'disabled', address: executor.address },
      rlEngine: { status: rlHealth.status === 'healthy' ? 'ok' : 'unavailable', task: rlHealth.task || null, policies: rlHealth.policies || null },
      llm: container.agentChat.status(),
      scheduler: container.scheduler.status,
      indexer: indexer.status,
    };
    const healthy = database === 'ok' && chain.status.ready;
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks, time: new Date().toISOString() });
  });

  if (config.appMode === 'judge') {
    app.use('/api/public', createPublicRouter({ ...container, limits }));
    app.use('/api/demo', createDemoRouter({ demoRuntime: container.demoRuntime, limits }));
    app.use('/api/admin', createAdminRouter({ ...container, limits }));
    app.use('/api/personal', createPersonalRouter(container, limits));
    app.use('/api', (req, res, next) => {
      const allowed = (req.method === 'GET' && ['/config', '/auth/session'].includes(req.path)) ||
        (req.method === 'POST' && ['/auth/nonce', '/auth/verify', '/auth/logout'].includes(req.path));
      if (allowed) return next();
      res.status(403).json({ success: false, error: { code: 'JUDGE_READ_ONLY', message: 'The public demonstration does not allow operator actions', requestId: req.id } });
    });
  }
  app.use('/api', createApiRouter({ ...container, limits }));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, { production: config.nodeEnv === 'production' }));
  return app;
}
