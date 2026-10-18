// Opt-in real GPT-4.1-mini check of the demo Treasury tool sequence (LIVE_TREASURY_LLM=1). Local chain only; the turn may
// prepare a proposal but nothing is confirmed, signed or sent. Uses the configured OpenAI key from backend/.env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, devWallet, artifact } from '../helpers/chain.js';
import { tempDir } from '../helpers/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createLlmProvider } from '../../src/llm/providers.js';
import { openDatabase } from '../../src/db/index.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/lib/logger.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { requestId, createErrorHandler } from '../../src/middleware/errorHandler.js';
import { createDemoRuntime } from '../../src/sandbox/demoRuntime.js';
import { createDemoRouter } from '../../src/routes/demo.js';

const LIVE = process.env.LIVE_TREASURY_LLM === '1';
const RUNS = Number(process.env.LIVE_RUNS || 2);
const ETH = ethers.ZeroAddress;
const W = (v) => ethers.parseEther(v);
const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', '..', 'database', 'migrations');
// The exact message sent in the stopped live attempt of 2026-10-18.
const MESSAGE = 'Review my treasury obligations, generate the payment plan, and prepare only the payment that fits the plan for my review. Do not prepare anything that would breach the protected reserve.';

test(`real GPT-4.1-mini follows the plan-first Treasury sequence in the demo path (${RUNS} runs)`, { skip: !LIVE && 'LIVE_TREASURY_LLM=1 required; uses the paid OpenAI API', timeout: 600000 }, async () => {
  const file = fileURLToPath(new URL('../../.env', import.meta.url));
  const src = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  assert.equal(src.LLM_MODEL, 'gpt-4.1-mini');
  const llm = createLlmProvider(loadConfig({ NODE_ENV: 'test', CHAIN_ID: '31337', LLM_PROVIDER: src.LLM_PROVIDER, LLM_BASE_URL: src.LLM_BASE_URL, LLM_MODEL: src.LLM_MODEL, LLM_API_KEY: src.LLM_API_KEY, LLM_TIMEOUT_MS: '60000', PGLITE_DIR: 'memory://' }));
  const report = [];
  for (let run = 1; run <= RUNS; run++) {
    const chain = await startTestChain();
    const owner = devWallet(5), agent = devWallet(6), recipient = devWallet(7);
    const signer = new ethers.NonceManager(devWallet(0, chain.provider));
    const A = artifact('AgentWallet');
    const wallet = await new ethers.ContractFactory(A.abi, A.bytecode, signer).deploy(owner.address, agent.address, W('0.0001'), W('0.0003'));
    await wallet.waitForDeployment();
    const contract = await wallet.getAddress();
    await (await signer.sendTransaction({ to: contract, value: W('0.0004') })).wait();
    await (await wallet.connect(owner.connect(chain.provider)).setRecipient(recipient.address, true)).wait();
    const deploymentFile = path.join(tempDir('aw-live-seq-'), 'sandbox.json');
    fs.writeFileSync(deploymentFile, JSON.stringify({ chainId: 31337, contractAddress: contract, contractVersion: 2, tokens: [{ symbol: 'ETH', address: ETH, decimals: 18, native: true }], demoRecipients: [{ label: 'Approved recipient', category: 'supplier', address: recipient.address }] }));
    const demo = { enabled: true, deploymentFile, contractAddress: contract, ownerAddress: owner.address, agentAddress: agent.address, inviteHashes: [], sessionTtlSeconds: 3600, maxAiPerSession: 6,
      maxAmountWei: W('0.0001'), maxTxPerSession: 1, dailyTxLimit: 1, dailyAmountWei: W('0.0001'), minTreasuryEth: '0.0002', minAgentGasEth: '0.0005', maxFeePerGasGwei: '20', executionWaitMs: 30000,
      maxGasPerTxWei: W('0.00001'), sessionGasWei: W('0.00001'), dailyGasWei: W('0.00001') };
    Object.defineProperty(demo, 'ownerKey', { value: owner.privateKey, enumerable: false });
    Object.defineProperty(demo, 'agentKey', { value: agent.privateKey, enumerable: false });
    const db = await openDatabase({ pgliteDir: 'memory://' });
    await migrate(db, MIGRATIONS);
    const runtime = await createDemoRuntime({ nodeEnv: 'test', logLevel: 'silent', appOrigin: 'http://localhost:5173', corsOrigins: ['http://localhost:5173'], chainId: 31337, rpcUrl: chain.rpcUrl,
      databaseUrl: null, pgliteDir: 'memory://', migrationsDir: MIGRATIONS, publicAi: { dailyLimit: 30 }, demo }, { db, llm, logger: createLogger('silent'), extraEnv: { DAY_BOUNDARY_GUARD_SECONDS: '0' } });
    try {
      assert.ok(runtime.service, runtime.reason);
      await runtime.sandbox.container.policySettings.update({ reserveFloors: { [ETH]: W('0.0003').toString() } }, owner.address, { via: 'live-test' });
      const app = express();
      app.use(requestId); app.use(express.json());
      app.use('/api/demo', createDemoRouter({ demoRuntime: runtime, limits: createRateLimits({ disabled: true }) }));
      app.use(createErrorHandler(createLogger('silent'), { production: false }));
      const code = (await runtime.service.createInvite({ label: 'live', maxSessions: 1 }, owner.address)).code;
      const s = (await request(app).post('/api/demo/session').send({ inviteCode: code }).expect(200)).body.data;
      const H = { Authorization: `Bearer ${s.token}` };
      const due = new Date(Date.now() + 86400000).toISOString();
      const a = (await request(app).post('/api/demo/sandbox/treasury/obligations').set(H).send({ recipientLabel: 'Payment A — supplier invoice', recipient: recipient.address, amount: '0.0001', dueAt: due, priority: 'HIGH', description: 'Urgent supplier invoice' }).expect(200)).body.data;
      await request(app).post('/api/demo/sandbox/treasury/obligations').set(H).send({ recipientLabel: 'Payment B — contractor', recipient: recipient.address, amount: '0.0001', dueAt: due, priority: 'NORMAL', description: 'Routine contractor payment' }).expect(200);
      const nonce = await chain.provider.getTransactionCount(agent.address);
      const turn = (await request(app).post('/api/demo/sandbox/agent/chat').set(H).send({ message: MESSAGE }).expect(200)).body.data;
      const detail = await runtime.sandbox.container.agentChat.conversation(turn.conversationId, { address: owner.address }, `demo:${s.sessionId}`);
      const tools = detail.turns.at(-1).toolInvocations.map((t) => `${t.tool}:${t.status}`);
      report.push({ run, status: turn.status, modelCalls: turn.modelCalls, usage: turn.usage, tools, prepared: turn.proposals.map((p) => ({ isA: p.id === a.id, status: p.status })) });
      assert.equal(turn.status, 'COMPLETED', JSON.stringify(report.at(-1)));
      assert.deepEqual(turn.proposals.map((p) => [p.id, p.status]), [[a.id, 'AWAITING_APPROVAL']], 'prepares exactly A, never B');
      assert.equal(await chain.provider.getTransactionCount(agent.address), nonce, 'nothing sent');
    } finally {
      fs.mkdirSync(path.resolve(import.meta.dirname, '..', '..', '..', 'work'), { recursive: true });
      fs.writeFileSync(path.resolve(import.meta.dirname, '..', '..', '..', 'work', 'live-treasury-sequence.json'), JSON.stringify(report, null, 2));
      await runtime.close(); await db.close(); await chain.stop();
    }
  }
});
