import { ethers } from 'ethers';
import { loadConfig, FROZEN_EVIDENCE_CONTRACTS } from '../config/env.js';
import { createContainer } from '../container.js';

/**
 * The judge demo sandbox: a full operator container (proposals, risk engine, executor, agent, audit) bound to a
 * SEPARATE v2 contract and its own database schema. It is never the public evidence contract.
 *
 *  - The demo agent key executes; the demo owner key signs EIP-712 approvals, but only via demoService after a judge
 *    confirms one specific proposal. Neither key ever leaves this process or reaches a response.
 *  - No background jobs: no scheduler, indexer or autonomous spending runs here.
 *
 * `demo` is config.demo (non-enumerable ownerKey/agentKey). `base` carries the main process settings to inherit.
 */
export async function createDemoSandbox(demo, base, { logger, llm, provider } = {}) {
  if (FROZEN_EVIDENCE_CONTRACTS.has(demo.contractAddress)) throw new Error('Refusing to run a sandbox on a frozen evidence contract');
  const env = {
    NODE_ENV: base.nodeEnv,
    APP_MODE: 'operator',
    LOG_LEVEL: base.logLevel,
    APP_ORIGIN: base.appOrigin,
    CORS_ORIGINS: base.corsOrigins.join(','),
    CHAIN_ID: String(base.chainId),
    RPC_URL: base.rpcUrl,
    DEPLOYMENT_FILE: demo.deploymentFile,
    AGENT_PRIVATE_KEY: demo.agentKey,
    ALLOW_PUBLIC_TESTNET_EXECUTION: 'true',
    BACKGROUND_JOBS: 'false',
    ...(base.databaseUrl ? { DATABASE_URL: base.databaseUrl } : {}),
    PGLITE_DIR: base.pgliteDir,
    DB_SCHEMA: 'sandbox_demo',
    MIGRATIONS_DIR: base.migrationsDir,
    LLM_PROVIDER: 'none', // the shared provider instance is injected below
    LLM_MAX_MODEL_CALLS: '4',
    PROPOSAL_TTL_SECONDS: '600',
    NATIVE_RESERVE_FLOOR_ETH: demo.minTreasuryEth,
    MIN_EXECUTOR_GAS_BALANCE_ETH: demo.minAgentGasEth,
    MAX_FEE_PER_GAS_GWEI: demo.maxFeePerGasGwei,
    OWNER_CACHE_MS: '0',
    ...(base.extraEnv || {}),
  };
  const config = loadConfig(env);
  if (config.contractAddress !== demo.contractAddress) throw new Error('Demo sandbox deployment does not match its configured contract');
  const container = await createContainer(config, { logger, llmProvider: llm, provider });

  // Fail closed unless the chain agrees with the server-held keys: v2, owner = demo owner, agent = demo agent.
  const version = container.chain.contractVersion();
  const [owner, agent] = await Promise.all([container.chain.getOwner(), container.chain.contract.agent()]);
  const problems = [];
  if (version !== 2) problems.push(`contract version ${version}, expected 2`);
  if (ethers.getAddress(owner) !== demo.ownerAddress) problems.push('on-chain owner is not the demo owner key');
  if (ethers.getAddress(agent) !== demo.agentAddress) problems.push('on-chain agent is not the demo agent key');
  if (problems.length) {
    await container.close();
    throw new Error(`Demo sandbox refused: ${problems.join('; ')}`);
  }
  const ownerSigner = new ethers.Wallet(demo.ownerKey, container.chain.provider);
  return { container, ownerSigner };
}
