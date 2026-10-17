import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { z } from 'zod';
import { getNetwork } from './networks.js';
import { JUDGE_CHAIN_ID, JUDGE_CONTRACT } from './judge.js';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_DIR = path.resolve(BACKEND_DIR, '..');

// Hardhat's well-known development mnemonic. Keys derived from it are public knowledge.
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';
let knownDevAddresses = null;

function hardhatDevAddresses() {
  if (!knownDevAddresses) {
    knownDevAddresses = new Set();
    for (let i = 0; i < 20; i++) {
      knownDevAddresses.add(ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).address);
    }
  }
  return knownDevAddresses;
}

/**
 * Loads backend/.env, or the file named by AGENT_WALLET_ENV_FILE instead of it (e.g. a separate
 * backend/.env.base-sepolia), so a public-testnet profile never mixes with the local demo settings.
 */
export function loadDotenv() {
  if (process.env.NODE_ENV === 'production' && !process.env.AGENT_WALLET_ENV_FILE) return;
  const file = process.env.AGENT_WALLET_ENV_FILE ? path.resolve(process.env.AGENT_WALLET_ENV_FILE) : path.join(BACKEND_DIR, '.env');
  if (process.env.AGENT_WALLET_ENV_FILE && !fs.existsSync(file)) throw new Error(`AGENT_WALLET_ENV_FILE ${file} does not exist`);
  dotenv.config({ path: file });
}

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');
const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.enum(['operator', 'judge']).default('operator'),
  PUBLIC_AI_ENABLED: boolString.default(false),
  JUDGE_REQUIRE_LIVE_AI: boolString.default(false),
  PUBLIC_AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(30),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  TRUST_PROXY: boolString.default(false),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(path.join(BACKEND_DIR, 'data', 'pglite')),
  MIGRATIONS_DIR: z.string().default(path.join(REPO_DIR, 'database', 'migrations')),
  // Optional PostgreSQL schema for this container (a sandbox gets its own; PGlite gets its own instance instead).
  DB_SCHEMA: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).optional(),

  RL_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  RL_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),

  CHAIN_ID: z.coerce.number().int().default(31337),
  RPC_URL: z.string().url().optional(),
  AGENT_WALLET_CONTRACT_ADDRESS: z.string().optional(),
  DEPLOYMENT_FILE: z.string().optional(),
  CONFIRMATIONS: z.coerce.number().int().min(1).max(64).optional(),

  AGENT_PRIVATE_KEY: z.string().optional(),
  LOCAL_DEV_AGENT_INDEX: z.coerce.number().int().min(0).max(19).optional(),
  AGENT_KEYSTORE_FILE: z.string().optional(),
  AGENT_KEYSTORE_PASSWORD: z.string().optional(),
  AGENT_KEYSTORE_PASSWORD_FILE: z.string().optional(),

  LLM_PROVIDER: z.enum(['anthropic', 'openai-compatible', 'none']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MAX_MODEL_CALLS: z.coerce.number().int().min(1).max(20).default(8),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),

  PRICE_MAX_AGE_SECONDS: z.coerce.number().int().min(60).default(86400 * 30),
  SCHEDULER_TICK_MS: z.coerce.number().int().min(200).default(5000),
  TASK_LEASE_SECONDS: z.coerce.number().int().min(5).default(60),
  CONDITION_CHECK_SECONDS: z.coerce.number().int().min(1).default(60),
  GAS_SAMPLE_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(900),
  SNAPSHOT_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(900),
  RL_TIMING_AGENT: z.enum(['PPO', 'DQN']).default('PPO'),
  ALLOW_PUBLIC_TESTNET_EXECUTION: boolString.default(false),

  PROPOSAL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(180),
  // An owner approval is refused when less than this remains before its signed execution deadline,
  // so the transfer has time to be mined before the deadline instead of failing after signing.
  APPROVAL_MIN_REMAINING_SECONDS: z.coerce.number().int().min(0).max(600).default(15),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(28800),
  NONCE_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(300),
  MAX_FEE_PER_GAS_GWEI: decimalString.default('50'),
  // Executor gas limit = estimate × (100 + margin)% , refused above the cap (never sent).
  EXECUTOR_GAS_MARGIN_PCT: z.coerce.number().int().min(5).max(100).default(20),
  EXECUTOR_GAS_LIMIT_CAP: z.coerce.number().int().min(100000).max(30000000).default(1500000),
  // The contract charges spend to spentPerDay[token][UTC day]; a transaction estimated just before 00:00 UTC and mined
  // after it writes a fresh day slot that the estimate did not cover (public v2 run, tx 7). Within this many seconds of
  // the boundary the executor waits for the new UTC day before estimating and signing. 0 disables the guard.
  DAY_BOUNDARY_GUARD_SECONDS: z.coerce.number().int().min(0).max(900).default(120),
  DAY_BOUNDARY_POLL_MS: z.coerce.number().int().min(50).max(60000).default(3000),
  NATIVE_RESERVE_FLOOR_ETH: decimalString.default('0.01'),
  MIN_EXECUTOR_GAS_BALANCE_ETH: decimalString.default('0.0005'),
  RECEIPT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),
  INDEXER_POLL_MS: z.coerce.number().int().min(250).default(3000),
  // Max blocks per eth_getLogs request. Defaults per network (2000 local, 200 Base Sepolia public RPC).
  INDEXER_BLOCK_RANGE: z.coerce.number().int().min(1).max(100000).optional(),
  OWNER_CACHE_MS: z.coerce.number().int().min(0).default(10000),
  BACKGROUND_JOBS: boolString.default(true),

  // Judge demo sandbox: a SEPARATE v2 contract whose demo owner and agent keys are held by the backend only.
  DEMO_ENABLED: boolString.default(false),
  DEMO_DEPLOYMENT_FILE: z.string().optional(),
  DEMO_OWNER_PRIVATE_KEY: z.string().optional(),
  DEMO_AGENT_PRIVATE_KEY: z.string().optional(),
  // Comma-separated SHA-256 hex digests of invite codes (never the codes themselves).
  DEMO_INVITE_CODES_SHA256: z.string().default(''),
  DEMO_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(3600),
  DEMO_MAX_TX_PER_SESSION: z.coerce.number().int().min(0).max(20).default(3),
  DEMO_MAX_AI_PER_SESSION: z.coerce.number().int().min(0).max(50).default(6),
  DEMO_MAX_AMOUNT_ETH: decimalString.default('0.0001'),
  DEMO_DAILY_TX_LIMIT: z.coerce.number().int().min(0).max(500).default(20),
  DEMO_DAILY_AMOUNT_ETH: decimalString.default('0.002'),
  DEMO_MIN_TREASURY_ETH: decimalString.default('0.0002'),
  DEMO_MIN_AGENT_GAS_ETH: decimalString.default('0.0005'),
  DEMO_MAX_FEE_PER_GAS_GWEI: decimalString.default('20'),
  DEMO_MAX_GAS_PER_TX_ETH: decimalString.default('0.0001'),
  DEMO_SESSION_GAS_ETH: decimalString.default('0.0003'),
  DEMO_DAILY_GAS_ETH: decimalString.default('0.001'),
  DEMO_EXECUTION_WAIT_MS: z.coerce.number().int().min(1000).max(170000).default(120000),
  // Comma-separated admin wallet addresses. Admin = SIWE signature by one of these; never a UI choice.
  ADMIN_ADDRESSES: z.string().default(''),
});

// Contracts whose public evidence is frozen. No sandbox may ever point at them.
export const FROZEN_EVIDENCE_CONTRACTS = new Set([
  '0x8A44716Efabb6Ce401291B91D4427149CaF956a6',
  '0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458',
  '0x3C9389E704331B8a12381F9ab5A68a7F3F59582F',
]);
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

function readDeployment(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Builds the validated, frozen runtime configuration. Throws on anything unsafe so the
 * process fails closed instead of starting with a half-valid setup.
 */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  const network = getNetwork(e.CHAIN_ID);
  if (e.APPROVAL_MIN_REMAINING_SECONDS >= e.PROPOSAL_TTL_SECONDS) {
    throw new Error('APPROVAL_MIN_REMAINING_SECONDS must be shorter than PROPOSAL_TTL_SECONDS');
  }

  const deploymentFile = e.DEPLOYMENT_FILE
    ? path.resolve(e.DEPLOYMENT_FILE)
    : path.join(REPO_DIR, 'contracts', 'deployments', e.APP_MODE === 'judge' ? 'sepolia-v2-full.json' : `${network.key}.json`);
  const deployment = readDeployment(deploymentFile);
  if (deployment && Number(deployment.chainId) !== network.chainId) {
    throw new Error(`Deployment file ${deploymentFile} is for chain ${deployment.chainId}, expected ${network.chainId}`);
  }

  const rawAddress = e.AGENT_WALLET_CONTRACT_ADDRESS || deployment?.contractAddress || '';
  let contractAddress = null;
  if (rawAddress) {
    if (!ethers.isAddress(rawAddress)) throw new Error('AGENT_WALLET_CONTRACT_ADDRESS is not a valid address');
    contractAddress = ethers.getAddress(rawAddress);
  }

  if (e.NODE_ENV === 'production') {
    if (!e.DATABASE_URL) throw new Error('Production requires DATABASE_URL; local PGlite is not hosted persistence');
    const origins = [e.APP_ORIGIN, ...e.CORS_ORIGINS.split(',').map((s) => s.trim())];
    if (origins.some((o) => {
      try {
        const u = new URL(o);
        const localCompose = network.chainId === 31337 && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
        return (!localCompose && u.protocol !== 'https:') || u.origin !== o || Boolean(u.username || u.password);
      } catch { return true; }
    })) {
      throw new Error('Production origins require exact HTTPS; only local chain 31337 permits HTTP loopback origins');
    }
    if (!origins.slice(1).includes(e.APP_ORIGIN)) throw new Error('CORS_ORIGINS must include APP_ORIGIN');
  }
  if (e.APP_MODE === 'judge') {
    if (network.chainId !== JUDGE_CHAIN_ID || contractAddress !== JUDGE_CONTRACT) throw new Error('Judge mode requires the frozen Ethereum Sepolia v2 contract');
    if ([e.AGENT_PRIVATE_KEY, e.AGENT_KEYSTORE_FILE, e.AGENT_KEYSTORE_PASSWORD, e.AGENT_KEYSTORE_PASSWORD_FILE].some(Boolean) || e.LOCAL_DEV_AGENT_INDEX !== undefined) {
      throw new Error('Judge mode must not receive executor credentials');
    }
    if (['OWNER_PRIVATE_KEY', 'DEPLOYER_PRIVATE_KEY', 'OWNER_KEYSTORE_FILE', 'DEPLOYER_KEYSTORE_FILE'].some((name) => env[name])) {
      throw new Error('Judge mode must not receive owner or deployer credentials');
    }
    if (e.ALLOW_PUBLIC_TESTNET_EXECUTION || e.BACKGROUND_JOBS) throw new Error('Judge mode requires ALLOW_PUBLIC_TESTNET_EXECUTION=false and BACKGROUND_JOBS=false');
  }
  if (e.PUBLIC_AI_ENABLED && e.APP_MODE !== 'judge') throw new Error('PUBLIC_AI_ENABLED requires judge mode');

  // Executor credential source. Exactly one may be configured. Secrets are kept on non-enumerable
  // properties and are only ever read by services/signerProvider.js.
  const sources = [e.AGENT_PRIVATE_KEY && 'env-key', e.AGENT_KEYSTORE_FILE && 'keystore', e.LOCAL_DEV_AGENT_INDEX !== undefined && 'dev-mnemonic'].filter(Boolean);
  if (sources.length > 1) throw new Error(`Configure only one executor credential source, found: ${sources.join(', ')}`);
  const signerSource = { kind: sources[0] || null };
  let agentAddress = null;
  if (signerSource.kind === 'dev-mnemonic') {
    // Local-only convenience: a Hardhat dev account as executor without writing a key anywhere.
    if (network.chainId !== 31337) throw new Error('LOCAL_DEV_AGENT_INDEX is only allowed on the local chain (31337)');
    const wallet = ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${e.LOCAL_DEV_AGENT_INDEX}`);
    Object.defineProperty(signerSource, 'secret', { value: wallet.privateKey, enumerable: false });
    agentAddress = wallet.address;
  } else if (signerSource.kind === 'env-key') {
    if (!/^0x[0-9a-fA-F]{64}$/.test(e.AGENT_PRIVATE_KEY)) throw new Error('AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
    Object.defineProperty(signerSource, 'secret', { value: e.AGENT_PRIVATE_KEY, enumerable: false });
    agentAddress = new ethers.Wallet(e.AGENT_PRIVATE_KEY).address;
  } else if (signerSource.kind === 'keystore') {
    // Encrypted JSON keystore (scrypt). The address is public metadata; the key is decrypted at start-up.
    const file = path.resolve(e.AGENT_KEYSTORE_FILE);
    if (!fs.existsSync(file)) throw new Error(`AGENT_KEYSTORE_FILE ${file} does not exist`);
    const json = fs.readFileSync(file, 'utf8');
    let password = e.AGENT_KEYSTORE_PASSWORD;
    if (e.AGENT_KEYSTORE_PASSWORD_FILE) password = fs.readFileSync(path.resolve(e.AGENT_KEYSTORE_PASSWORD_FILE), 'utf8').trim();
    if (!password) throw new Error('A keystore needs AGENT_KEYSTORE_PASSWORD_FILE (preferred) or AGENT_KEYSTORE_PASSWORD');
    const address = JSON.parse(json).address;
    if (!address) throw new Error('Keystore has no address field');
    agentAddress = ethers.getAddress(address.startsWith('0x') ? address : `0x${address}`);
    signerSource.file = file;
    Object.defineProperty(signerSource, 'secret', { value: { json, password }, enumerable: false });
  }
  if (agentAddress && network.isPublic) {
    if (hardhatDevAddresses().has(agentAddress)) throw new Error('Refusing a publicly known Hardhat development key on a public network');
    if (!e.ALLOW_PUBLIC_TESTNET_EXECUTION) {
      throw new Error('An executor key on a public network requires ALLOW_PUBLIC_TESTNET_EXECUTION=true (explicit approval)');
    }
  }

  const priceFeeds = (deployment?.priceFeeds || []).map((f) => ({ token: ethers.getAddress(f.token), feed: ethers.getAddress(f.feed), source: String(f.source || `chainlink:${f.feed}`) }));
  const llmKind = e.LLM_PROVIDER || (e.ANTHROPIC_API_KEY ? 'anthropic' : e.LLM_BASE_URL ? 'openai-compatible' : 'none');
  const llm = {
    provider: llmKind,
    model: llmKind === 'anthropic' ? e.LLM_MODEL || 'claude-opus-5-5' : e.LLM_MODEL || null,
    baseUrl: e.LLM_BASE_URL || null,
    maxModelCalls: e.LLM_MAX_MODEL_CALLS,
    timeoutMs: e.LLM_TIMEOUT_MS,
    maxRetries: e.APP_MODE === 'judge' ? 0 : 2,
  };
  if (llmKind === 'openai-compatible' && (!llm.baseUrl || !llm.model)) throw new Error('openai-compatible LLM needs LLM_BASE_URL and LLM_MODEL');
  Object.defineProperty(llm, 'apiKey', { value: llmKind === 'anthropic' ? e.ANTHROPIC_API_KEY || null : e.LLM_API_KEY || null, enumerable: false });
  if (e.JUDGE_REQUIRE_LIVE_AI) {
    if (e.APP_MODE !== 'judge' || !e.PUBLIC_AI_ENABLED || llmKind !== 'openai-compatible' ||
        llm.baseUrl !== 'https://api.openai.com/v1' || llm.model !== 'gpt-4.1-mini' || !llm.apiKey?.trim()) {
      throw new Error('JUDGE_REQUIRE_LIVE_AI requires judge mode, PUBLIC_AI_ENABLED=true and configured OpenAI GPT-4.1-mini credentials');
    }
    if (e.NODE_ENV === 'production') {
      const database = new URL(e.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.searchParams.get('sslmode') !== 'verify-full') {
        throw new Error('The live judge launch requires a PostgreSQL URL with sslmode=verify-full');
      }
    }
  }

  const tokens = (deployment?.tokens || [{ symbol: 'ETH', address: ethers.ZeroAddress, decimals: 18, native: true }]).map((t) => ({
    symbol: String(t.symbol),
    address: ethers.getAddress(t.address),
    decimals: Number(t.decimals),
    native: Boolean(t.native),
    testOnly: Boolean(t.testOnly),
  }));

  const adminAddresses = e.ADMIN_ADDRESSES.split(',').map((a) => a.trim()).filter(Boolean).map((a) => {
    if (!ethers.isAddress(a)) throw new Error('ADMIN_ADDRESSES contains an invalid address');
    return ethers.getAddress(a);
  });
  let demo = { enabled: false };
  if (e.DEMO_ENABLED) {
    if(!adminAddresses.length)throw new Error('DEMO_ENABLED requires an explicit ADMIN_ADDRESSES allowlist');
    if (e.APP_MODE !== 'judge') throw new Error('DEMO_ENABLED requires judge mode');
    if (!e.DEMO_DEPLOYMENT_FILE) throw new Error('DEMO_ENABLED requires DEMO_DEPLOYMENT_FILE');
    if (!PRIVATE_KEY.test(e.DEMO_OWNER_PRIVATE_KEY || '') || !PRIVATE_KEY.test(e.DEMO_AGENT_PRIVATE_KEY || '')) {
      throw new Error('DEMO_ENABLED requires DEMO_OWNER_PRIVATE_KEY and DEMO_AGENT_PRIVATE_KEY (0x-prefixed 32-byte hex)');
    }
    const demoDeploymentFile = path.resolve(e.DEMO_DEPLOYMENT_FILE);
    const demoDeployment = readDeployment(demoDeploymentFile);
    if (!demoDeployment?.contractAddress) throw new Error(`Demo deployment file ${demoDeploymentFile} is missing or has no contractAddress`);
    const demoContract = ethers.getAddress(demoDeployment.contractAddress);
    if (FROZEN_EVIDENCE_CONTRACTS.has(demoContract)) throw new Error('The demo sandbox must never be a frozen evidence contract');
    if (Number(demoDeployment.chainId) !== network.chainId) throw new Error('The demo sandbox must be on the judge chain');
    const demoOwner = new ethers.Wallet(e.DEMO_OWNER_PRIVATE_KEY).address;
    const demoAgent = new ethers.Wallet(e.DEMO_AGENT_PRIVATE_KEY).address;
    if (demoOwner === demoAgent) throw new Error('The demo owner and demo agent keys must differ');
    if (network.isPublic && (hardhatDevAddresses().has(demoOwner) || hardhatDevAddresses().has(demoAgent))) throw new Error('Refusing a publicly known Hardhat development key for the demo sandbox');
    const inviteHashes = e.DEMO_INVITE_CODES_SHA256.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (inviteHashes.some((h) => !/^[0-9a-f]{64}$/.test(h))) throw new Error('DEMO_INVITE_CODES_SHA256 must list SHA-256 hex digests');
    demo = {
      enabled: true,
      deploymentFile: demoDeploymentFile,
      contractAddress: demoContract,
      ownerAddress: demoOwner,
      agentAddress: demoAgent,
      inviteHashes,
      sessionTtlSeconds: e.DEMO_SESSION_TTL_SECONDS,
      maxTxPerSession: e.DEMO_MAX_TX_PER_SESSION,
      maxAiPerSession: e.DEMO_MAX_AI_PER_SESSION,
      maxAmountWei: ethers.parseEther(e.DEMO_MAX_AMOUNT_ETH),
      dailyTxLimit: e.DEMO_DAILY_TX_LIMIT,
      dailyAmountWei: ethers.parseEther(e.DEMO_DAILY_AMOUNT_ETH),
      minTreasuryEth: e.DEMO_MIN_TREASURY_ETH,
      minAgentGasEth: e.DEMO_MIN_AGENT_GAS_ETH,
      maxFeePerGasGwei: e.DEMO_MAX_FEE_PER_GAS_GWEI,
      executionWaitMs: e.DEMO_EXECUTION_WAIT_MS,
      maxGasPerTxWei: ethers.parseEther(e.DEMO_MAX_GAS_PER_TX_ETH),
      sessionGasWei: ethers.parseEther(e.DEMO_SESSION_GAS_ETH),
      dailyGasWei: ethers.parseEther(e.DEMO_DAILY_GAS_ETH),
    };
    // Secrets stay on non-enumerable properties; only sandbox/demoSandbox.js reads them.
    Object.defineProperty(demo, 'ownerKey', { value: e.DEMO_OWNER_PRIVATE_KEY, enumerable: false });
    Object.defineProperty(demo, 'agentKey', { value: e.DEMO_AGENT_PRIVATE_KEY, enumerable: false });
  }

  const config = {
    nodeEnv: e.NODE_ENV,
    appMode: e.APP_MODE,
    publicAi: { enabled: e.PUBLIC_AI_ENABLED, required: e.JUDGE_REQUIRE_LIVE_AI, dailyLimit: e.PUBLIC_AI_DAILY_LIMIT },
    host: e.HOST,
    port: e.PORT,
    appOrigin: e.APP_ORIGIN,
    corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL || null,
    pgliteDir: e.PGLITE_DIR,
    dbSchema: e.DB_SCHEMA || null,
    migrationsDir: e.MIGRATIONS_DIR,
    rlServiceUrl: e.RL_SERVICE_URL.replace(/\/$/, ''),
    rlTimeoutMs: e.RL_TIMEOUT_MS,
    network,
    chainId: network.chainId,
    rpcUrl: e.RPC_URL || network.defaultRpcUrl,
    confirmations: e.CONFIRMATIONS || network.defaultConfirmations,
    contractAddress,
    deploymentFile,
    deployBlock: Number(deployment?.deployBlock || 0),
    tokens,
    demoRecipients: deployment?.demoRecipients || [],
    executor: { source: signerSource, address: agentAddress, enabled: Boolean(signerSource.kind) },
    priceFeeds,
    priceMaxAgeSeconds: e.PRICE_MAX_AGE_SECONDS,
    llm,
    scheduler: {
      tickMs: e.SCHEDULER_TICK_MS,
      leaseSeconds: e.TASK_LEASE_SECONDS,
      conditionCheckSeconds: e.CONDITION_CHECK_SECONDS,
      gasSampleSeconds: e.GAS_SAMPLE_INTERVAL_SECONDS,
      snapshotSeconds: e.SNAPSHOT_INTERVAL_SECONDS,
      timingAgent: e.RL_TIMING_AGENT,
    },
    proposalTtlSeconds: e.PROPOSAL_TTL_SECONDS,
    approvalMinRemainingSeconds: e.APPROVAL_MIN_REMAINING_SECONDS,
    sessionTtlSeconds: e.SESSION_TTL_SECONDS,
    nonceTtlSeconds: e.NONCE_TTL_SECONDS,
    maxFeePerGasWei: ethers.parseUnits(e.MAX_FEE_PER_GAS_GWEI, 'gwei'),
    executorGasMarginPct: e.EXECUTOR_GAS_MARGIN_PCT,
    executorGasLimitCap: BigInt(e.EXECUTOR_GAS_LIMIT_CAP),
    dayBoundaryGuardSeconds: e.DAY_BOUNDARY_GUARD_SECONDS,
    dayBoundaryPollMs: e.DAY_BOUNDARY_POLL_MS,
    nativeReserveFloorWei: ethers.parseEther(e.NATIVE_RESERVE_FLOOR_ETH),
    minExecutorGasBalanceWei: ethers.parseEther(e.MIN_EXECUTOR_GAS_BALANCE_ETH),
    receiptTimeoutMs: e.RECEIPT_TIMEOUT_MS,
    indexerPollMs: e.INDEXER_POLL_MS,
    indexerBlockRange: e.INDEXER_BLOCK_RANGE || network.defaultLogBlockRange,
    ownerCacheMs: e.OWNER_CACHE_MS,
    backgroundJobs: e.BACKGROUND_JOBS,
    demo,
    adminAddresses,
  };

  return Object.freeze(config);
}

/** Startup summary that is safe to log (no secrets). */
export function describeConfig(config) {
  return {
    nodeEnv: config.nodeEnv,
    chain: `${config.network.name} (${config.chainId})`,
    rpc: `${config.network.key} RPC configured (URL withheld)`,
    appMode: config.appMode,
    contractAddress: config.contractAddress || 'NOT CONFIGURED',
    executor: config.executor.enabled ? `enabled via ${config.executor.source.kind} (${config.executor.address})` : 'disabled (no executor credential)',
    llm: config.llm.provider === 'none' ? 'not configured' : `${config.llm.provider} (${config.llm.model})`,
    database: config.databaseUrl ? 'postgres (DATABASE_URL)' : `pglite (${config.pgliteDir})`,
    rlServiceUrl: config.rlServiceUrl,
    corsOrigins: config.corsOrigins,
  };
}
