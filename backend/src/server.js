import app from './app.js';
import { config, validateStartupConfig } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';

async function startServer() {
  validateStartupConfig();
  await checkDatabaseConnection();

  const server = app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`AgentWallet Backend Server running on port ${config.port}`);
    console.log(`REST Health: http://localhost:${config.port}/health`);
    console.log(`Wallet State: http://localhost:${config.port}/api/wallet/state`);
    console.log(`Agent Status: http://localhost:${config.port}/api/agent/status`);
    console.log(`====================================================`);
  });

  const shutdown = () => {
    console.log('Shutting down AgentWallet backend gracefully...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
