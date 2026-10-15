import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { loadConfig } from '../../src/config/env.js';
import { createContainer } from '../../src/container.js';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import { devWallet } from './chain.js';

export function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function testConfig({ rpcUrl, deployment, env = {} }) {
  const dir = tempDir('aw-test-');
  const deploymentFile = path.join(dir, 'deployment.json');
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment));
  return loadConfig({
    NODE_ENV: 'test',
    CHAIN_ID: '31337',
    RPC_URL: rpcUrl,
    DEPLOYMENT_FILE: deploymentFile,
    PGLITE_DIR: 'memory://',
    AGENT_PRIVATE_KEY: devWallet(1).privateKey,
    RL_SERVICE_URL: 'http://127.0.0.1:9',
    RL_TIMEOUT_MS: '500',
    BACKGROUND_JOBS: 'false',
    LOG_LEVEL: 'silent',
    RECEIPT_TIMEOUT_MS: '20000',
    OWNER_CACHE_MS: '0',
    ...env,
  });
}

/** Real container + app against a real local chain. Only the RL URL may point at a stub. */
export async function buildTestApp({ rpcUrl, deployment, env = {}, rateLimits = false, llmProvider, schedulerInstanceId }) {
  const config = testConfig({ rpcUrl, deployment, env });
  const container = await createContainer(config, { logger: createLogger('silent'), llmProvider, schedulerInstanceId });
  const app = createApp(container, { disableRateLimits: !rateLimits });
  return { app, container, config };
}

export async function signIn(app, wallet) {
  const nonce = await request(app).post('/api/auth/nonce').send({ address: wallet.address }).expect(200);
  const message = nonce.body.data.message;
  const signature = await wallet.signMessage(message);
  const res = await request(app).post('/api/auth/verify').send({ message, signature }).expect(200);
  return res.body.data.token;
}

export function signApproval(wallet, proposal) {
  const { domain, types, message } = proposal.approvalTypedData;
  return wallet.signTypedData(domain, types, message);
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let keyCounter = 0;
export const idemKey = () => `test-key-${Date.now()}-${++keyCounter}-abcdef`;

export async function waitFor(fn, { timeoutMs = 20000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
