import { loadDotenv, loadConfig, describeConfig } from './config/env.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

async function main() {
  loadDotenv();
  const config = loadConfig();
  const container = await createContainer(config);
  const { logger, chain, executor } = container;

  logger.info('AgentWallet backend starting', describeConfig(config));
  logger.info('Database migrations', container.migrations);
  if (!chain.status.ready) logger.warn('Blockchain not ready; money paths fail closed until it is', { error: chain.status.error });

  if (config.backgroundJobs) {
    container.startBackgroundJobs();
    const recovered = await executor.recover().catch((e) => ({ error: e.message }));
    logger.info('Executor recovery', recovered);
  }

  const app = createApp(container);
  const server = app.listen(config.port, config.host, () => logger.info(`Listening on http://${config.host}:${config.port}`));

  const shutdown = async (signal) => {
    logger.info('Shutting down', { signal });
    server.close();
    await container.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
