import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  rlServiceUrl: process.env.RL_SERVICE_URL || 'http://localhost:8000',
  chainId: parseInt(process.env.CHAIN_ID || '84532', 10),
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  contractAddress: process.env.AGENT_WALLET_CONTRACT_ADDRESS || '',
};

export function validateStartupConfig() {
  console.log('[Config] Startup Environment Status:');
  console.log(`  - Node Environment: ${config.nodeEnv}`);
  console.log(`  - Backend Port: ${config.port}`);
  console.log(`  - Chain ID: ${config.chainId}`);
  console.log(`  - EVM RPC Provider: ${config.rpcUrl}`);
  console.log(`  - Contract Address: ${config.contractAddress || 'NOT CONFIGURED'}`);
  console.log(`  - RL Engine URL: ${config.rlServiceUrl}`);
  console.log(`  - Database URL: ${config.databaseUrl ? 'Configured' : 'NOT CONFIGURED (in-memory mode active)'}`);

  if (!config.contractAddress) {
    console.warn('[Notice] AGENT_WALLET_CONTRACT_ADDRESS is not set. Contract queries will return "Contract configuration missing" status.');
  }
}
