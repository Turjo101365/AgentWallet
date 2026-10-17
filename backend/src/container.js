import { openDatabase } from './db/index.js';
import { migrate } from './db/migrate.js';
import { createRepositories } from './repositories/index.js';
import { createLogger } from './lib/logger.js';
import { createChainService } from './services/chainService.js';
import { createAuthService } from './services/authService.js';
import { createAgentControlService } from './services/agentControlService.js';
import { createProposalService } from './services/proposalService.js';
import { createExecutorService } from './services/executorService.js';
import { createIndexerService } from './services/indexerService.js';
import { createRlClient } from './services/rlClient.js';
import { createHistoryService } from './services/historyService.js';
import { createSignerProvider } from './services/signerProvider.js';
import { createPolicySettings } from './services/policySettings.js';
import { createPriceService } from './services/priceService.js';
import { createRiskEngine } from './services/riskEngine.js';
import { createTimingAdvisor } from './services/timingAdvisor.js';
import { createSchedulerService } from './services/schedulerService.js';
import { createPortfolioService } from './services/portfolioService.js';
import { createAgentChatService } from './services/agentChatService.js';
import { createLlmProvider } from './llm/providers.js';
import { createJudgeService } from './services/judgeService.js';

/** Composition root shared by the server and the tests. `overrides` lets tests inject an LLM provider. */
export async function createContainer(config, { logger = createLogger(config.logLevel), provider, llmProvider, schedulerInstanceId } = {}) {
  const db = await openDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
  const migrations = await migrate(db, config.migrationsDir);
  const repos = createRepositories(db);
  const chain = createChainService(config, { provider });
  await chain.verify();

  const signerProvider = await createSignerProvider(config);
  const auth = createAuthService({ config, repos, chain });
  const agentControl = createAgentControlService({ repos });
  const policySettings = createPolicySettings({ config, repos });
  const prices = createPriceService({ config, chain });
  const risk = createRiskEngine({ chain, repos, agentControl, policySettings, prices });
  const proposals = createProposalService({ config, repos, chain, auth, risk, logger });
  const executor = createExecutorService({ config, repos, chain, risk, signerProvider, logger });
  proposals.setExecutor(executor);
  const indexer = createIndexerService({ config, repos, chain, executor, logger });
  const rl = createRlClient(config);
  const timing = createTimingAdvisor({ config, repos, rl });
  const history = createHistoryService({ config, repos, chain, indexer });
  const scheduler = createSchedulerService({ config, repos, chain, auth, proposals, policySettings, timing, agentControl, logger, instanceId: schedulerInstanceId });
  const portfolio = createPortfolioService({ config, repos, chain, prices });
  const llm = llmProvider || createLlmProvider(config);
  const agentChat = createAgentChatService({ config, repos, auth, llm, logger, deps: { chain, repos, proposals, scheduler, portfolio, policySettings, history } });
  const judge = config.appMode === 'judge' ? createJudgeService({ config, chain, risk, db, llm, logger }) : null;

  const timers = [];
  function startBackgroundJobs() {
    if (config.appMode === 'judge') return;
    indexer.start();
    scheduler.start();
    const every = (ms, fn, label) => {
      const t = setInterval(() => fn().catch((e) => logger.warn(`${label} failed`, { error: e.message })), ms);
      t.unref?.();
      timers.push(t);
    };
    every(5000, () => proposals.expireStale(), 'Expiry sweep');
    every(10000, async () => {
      if (!chain.status.ready) {
        const s = await chain.verify();
        if (s.ready) logger.info('Blockchain connection verified');
      }
    }, 'Chain re-verify');
    every(Math.min(config.scheduler.snapshotSeconds * 1000, 60000), () => (chain.status.ready ? portfolio.takeSnapshotIfDue() : Promise.resolve()), 'Balance snapshot');
  }

  async function close() {
    indexer.stop();
    scheduler.stop();
    timers.forEach(clearInterval);
    await executor.whenIdle().catch(() => {});
    chain.provider.destroy?.();
    await db.close();
  }

  return {
    config, logger, db, migrations, repos, chain, auth, agentControl, policySettings, prices, risk, proposals, executor,
    indexer, rl, timing, history, scheduler, portfolio, llm, agentChat, judge, signerProvider, startBackgroundJobs, close,
  };
}
