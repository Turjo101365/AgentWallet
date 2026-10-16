import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ethers } from 'ethers';
import { evaluatePolicy } from '../src/services/policyService.js';
import { parseAmount } from '../src/lib/units.js';
import { normalizeAddress } from '../src/lib/address.js';
import { loadConfig } from '../src/config/env.js';

// Pure unit tests of the policy function. The snapshot here is a hand-built input object;
// real-chain behaviour is covered in api.execution.test.js.
const WALLET = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const EXECUTOR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const PAYEE = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const e = ethers.parseEther;

const config = {
  executor: { enabled: true, address: EXECUTOR },
  maxFeePerGasWei: ethers.parseUnits('50', 'gwei'),
  nativeReserveFloorWei: e('0.01'),
  minExecutorGasBalanceWei: e('0.0005'),
};

function snapshot(overrides = {}, tokenOverrides = {}) {
  return {
    contractAddress: WALLET,
    blockNumber: 10,
    paused: false,
    agent: EXECUTOR,
    executorAddress: EXECUTOR,
    executorBalance: e('1'),
    maxFeePerGas: ethers.parseUnits('2', 'gwei'),
    gasPrice: ethers.parseUnits('1', 'gwei'),
    tokens: [{ symbol: 'ETH', address: ethers.ZeroAddress, decimals: 18, native: true, enabled: true, perTxLimit: e('0.01'), dailyLimit: e('0.05'), spentToday: 0n, balance: e('1'), ...tokenOverrides }],
    ...overrides,
  };
}

const intent = (amount = '0.005', recipient = PAYEE) => ({ tokenAddress: ethers.ZeroAddress, recipient, amountWei: e(amount) });
const ctx = (o = {}) => ({ agentPaused: false, recipientAllowed: true, reservedWei: 0n, config, ...o });
const failed = (r) => r.violations.map((v) => v.id).sort();

describe('policy engine', () => {
  test('passes a transfer inside every limit', () => {
    const r = evaluatePolicy(intent(), snapshot(), ctx());
    assert.equal(r.passed, true, JSON.stringify(r.violations));
  });

  test('per-transaction cap is inclusive', () => {
    assert.equal(evaluatePolicy(intent('0.01'), snapshot(), ctx()).passed, true);
    assert.deepEqual(failed(evaluatePolicy({ ...intent(), amountWei: e('0.01') + 1n }, snapshot(), ctx())), ['PER_TX_LIMIT']);
  });

  test('daily cap counts on-chain spend plus in-flight reservations', () => {
    assert.deepEqual(failed(evaluatePolicy(intent('0.01'), snapshot({}, { spentToday: e('0.045') }), ctx())), ['DAILY_LIMIT']);
    assert.deepEqual(failed(evaluatePolicy(intent('0.01'), snapshot(), ctx({ reservedWei: e('0.045') }))), ['DAILY_LIMIT']);
  });

  test('balance must cover amount, reservations and the native reserve floor', () => {
    assert.deepEqual(failed(evaluatePolicy(intent('0.01'), snapshot({}, { balance: e('0.015') }), ctx())), ['BALANCE_AND_RESERVE']);
    assert.equal(evaluatePolicy(intent('0.005'), snapshot({}, { balance: e('0.015') }), ctx()).passed, true);
  });

  test('recipient must be allowlisted and must not be the wallet, the executor or zero', () => {
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot(), ctx({ recipientAllowed: false }))), ['RECIPIENT_ALLOWLISTED']);
    for (const bad of [WALLET, EXECUTOR, ethers.ZeroAddress]) {
      assert.ok(failed(evaluatePolicy(intent('0.001', bad), snapshot(), ctx())).includes('RECIPIENT_VALID'), bad);
    }
  });

  test('pause (off-chain and on-chain), disabled token and foreign agent all fail closed', () => {
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot(), ctx({ agentPaused: true }))), ['AGENT_ACTIVE']);
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot({ paused: true }), ctx())), ['CONTRACT_ACTIVE']);
    assert.ok(failed(evaluatePolicy(intent(), snapshot({}, { enabled: false }), ctx())).includes('TOKEN_SUPPORTED'));
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot({ agent: PAYEE }), ctx())), ['EXECUTOR_AUTHORIZED']);
    assert.ok(failed(evaluatePolicy({ ...intent(), tokenAddress: PAYEE }, snapshot(), ctx())).includes('TOKEN_SUPPORTED'));
  });

  test('gas price cap, missing fee data and low executor gas balance', () => {
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot({ maxFeePerGas: ethers.parseUnits('51', 'gwei') }), ctx())), ['GAS_PRICE']);
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot({ maxFeePerGas: null, gasPrice: null }), ctx())), ['GAS_PRICE']);
    assert.deepEqual(failed(evaluatePolicy(intent(), snapshot({ executorBalance: 0n }), ctx())), ['EXECUTOR_GAS']);
  });

  test('executor disabled is a violation, not a silent pass', () => {
    const r = evaluatePolicy(intent(), snapshot(), ctx({ config: { ...config, executor: { enabled: false, address: null } } }));
    assert.ok(failed(r).includes('EXECUTOR_AUTHORIZED'));
  });
});

describe('input parsing', () => {
  test('parseAmount uses exact integer units', () => {
    assert.equal(parseAmount('0.005', 18), 5_000_000_000_000_000n);
    assert.equal(parseAmount('12.5', 6), 12_500_000n);
    assert.equal(parseAmount('1', 0), 1n);
    for (const bad of ['', '0', '0.0', '-1', '1e3', '0x1', ' 1', '1.', '.5', '1.0000001']) {
      assert.throws(() => parseAmount(bad, 6), { code: 'INVALID_AMOUNT' }, bad);
    }
  });

  test('normalizeAddress checksums and rejects zero or malformed input', () => {
    assert.equal(normalizeAddress(PAYEE.toLowerCase()), PAYEE);
    assert.throws(() => normalizeAddress(ethers.ZeroAddress), { code: 'INVALID_ADDRESS' });
    assert.throws(() => normalizeAddress('0x123'), { code: 'INVALID_ADDRESS' });
    assert.throws(() => normalizeAddress(42), { code: 'INVALID_ADDRESS' });
    assert.equal(normalizeAddress(ethers.ZeroAddress, 'token', { allowZero: true }), ethers.ZeroAddress);
  });
});

describe('configuration guards', () => {
  const base = { CHAIN_ID: '31337', DEPLOYMENT_FILE: 'nonexistent.json', LOG_LEVEL: 'silent' };
  const HARDHAT_KEY_1 = ethers.HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, "m/44'/60'/0'/0/1").privateKey;

  test('only local, Base Sepolia and Ethereum Sepolia are accepted; every mainnet is refused', () => {
    for (const chainId of ['1', '8453', '137', '10', '42161', '56', '17000']) {
      assert.throws(() => loadConfig({ ...base, CHAIN_ID: chainId }), /Unsupported chain id/);
    }
    assert.equal(loadConfig({ ...base, CHAIN_ID: '84532' }).chainId, 84532);
    assert.equal(loadConfig({ ...base, CHAIN_ID: '11155111' }).chainId, 11155111);
  });

  test('Ethereum Sepolia gets the same public-network key guards as Base Sepolia', () => {
    const key = ethers.Wallet.createRandom().privateKey;
    const sepolia = { ...base, CHAIN_ID: '11155111' };
    assert.throws(() => loadConfig({ ...sepolia, AGENT_PRIVATE_KEY: HARDHAT_KEY_1, ALLOW_PUBLIC_TESTNET_EXECUTION: 'true' }), /publicly known/);
    assert.throws(() => loadConfig({ ...sepolia, AGENT_PRIVATE_KEY: key }), /ALLOW_PUBLIC_TESTNET_EXECUTION/);
    assert.throws(() => loadConfig({ ...sepolia, LOCAL_DEV_AGENT_INDEX: '1' }), /only allowed on the local chain/);
    const c = loadConfig({ ...sepolia, AGENT_PRIVATE_KEY: key, ALLOW_PUBLIC_TESTNET_EXECUTION: 'true' });
    assert.equal(c.executor.enabled, true);
    assert.equal(c.network.explorerBaseUrl, 'https://sepolia.etherscan.io');
    const { DEPLOYMENT_FILE: _ignored, ...noFile } = sepolia;
    const own = loadConfig(noFile).deploymentFile;
    assert.ok(own.endsWith(`deployments${path.sep}sepolia.json`), own);
  });

  test('publicly known Hardhat keys are refused on public networks', () => {
    assert.throws(() => loadConfig({ ...base, CHAIN_ID: '84532', AGENT_PRIVATE_KEY: HARDHAT_KEY_1, ALLOW_PUBLIC_TESTNET_EXECUTION: 'true' }), /publicly known/);
  });

  test('a public-network executor key requires explicit opt-in', () => {
    const key = ethers.Wallet.createRandom().privateKey;
    assert.throws(() => loadConfig({ ...base, CHAIN_ID: '84532', AGENT_PRIVATE_KEY: key }), /ALLOW_PUBLIC_TESTNET_EXECUTION/);
    assert.equal(loadConfig({ ...base, CHAIN_ID: '84532', AGENT_PRIVATE_KEY: key, ALLOW_PUBLIC_TESTNET_EXECUTION: 'true' }).executor.enabled, true);
  });

  test('the executor key is not enumerable on the config object', () => {
    const c = loadConfig({ ...base, AGENT_PRIVATE_KEY: HARDHAT_KEY_1 });
    assert.equal(Object.keys(c.executor.source).includes('secret'), false);
    assert.ok(!JSON.stringify(c, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(HARDHAT_KEY_1.slice(2)));
  });

  test('LOCAL_DEV_AGENT_INDEX derives a dev executor on 31337 only', () => {
    assert.equal(loadConfig({ ...base, LOCAL_DEV_AGENT_INDEX: '1' }).executor.address, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    assert.throws(() => loadConfig({ ...base, CHAIN_ID: '84532', LOCAL_DEV_AGENT_INDEX: '1' }), /only allowed on the local chain/);
  });

  test('malformed keys and addresses fail startup', () => {
    assert.throws(() => loadConfig({ ...base, AGENT_PRIVATE_KEY: '0x1234' }), /AGENT_PRIVATE_KEY/);
    assert.throws(() => loadConfig({ ...base, AGENT_WALLET_CONTRACT_ADDRESS: '0xnope' }), /not a valid address/);
  });
});
