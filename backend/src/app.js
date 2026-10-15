import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createApiRouter } from './routes/api.js';
import { createRateLimits } from './middleware/rateLimits.js';
import { requestId, createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(container, { disableRateLimits = false } = {}) {
  const { config, logger, db, chain, rl, executor, indexer } = container;
  const app = express();
  const limits = createRateLimits({ disabled: disableRateLimits });

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet());
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

  app.get('/health', async (_req, res) => {
    const database = await db.ping().then(() => 'ok', (e) => `error: ${e.message}`);
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

  app.use('/api', createApiRouter({ ...container, limits }));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
