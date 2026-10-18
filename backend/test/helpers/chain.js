import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const CONTRACTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../contracts');
const HARDHAT_CLI = path.join(CONTRACTS_DIR, 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js');
const MNEMONIC = 'test test test test test test test test test test test junk';

/** Hardhat's deterministic development accounts (public test keys, local chain only). */
export function devWallet(index, provider) {
  const w = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
  return provider ? w.connect(provider) : w;
}

export function artifact(name, sub = '', file = name) {
  const p = path.join(CONTRACTS_DIR, 'artifacts', 'src', sub, `${file}.sol`, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Missing artifact ${p}; run "npm run compile" in contracts/`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Starts `hardhat node` on a random local port and resolves once JSON-RPC answers. */
export async function startTestChain() {
  const port = 18545 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [HARDHAT_CLI, 'node', '--port', String(port), '--hostname', '127.0.0.1'], {
    cwd: CONTRACTS_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const rpcUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`hardhat node exited: ${output}`);
    if (Date.now() > deadline) throw new Error(`hardhat node did not start: ${output}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  // Fixtures mine immediately and reuse funded dev accounts across deployments.
  // A cached pending nonce can therefore belong to the preceding deployment.
  const provider = new ethers.JsonRpcProvider(rpcUrl, 31337, { staticNetwork: true, cacheTimeout: -1 });
  return {
    rpcUrl,
    provider,
    async send(method, params = []) {
      return provider.send(method, params);
    },
    async stop() {
      provider.destroy();
      child.kill();
      if (child.exitCode === null) await new Promise((r) => child.once('exit', r));
    },
  };
}

/** The frozen AgentWallet v1 (byte-identical to the Ethereum Sepolia deployment), for compatibility tests. */
export function v1Artifact() {
  return JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, '..', 'shared', 'abi', 'AgentWallet.v1.json'), 'utf8'));
}

/**
 * Deploys AgentWallet + test token the same way contracts/scripts/deploy.js does for localhost.
 * `walletArtifact` defaults to the current build (v2); pass v1Artifact() to test against the deployed v1.
 */
export async function deployFixture(provider, { walletArtifact } = {}) {
  const owner = devWallet(0, provider);
  const agent = devWallet(1, provider);
  const payeeA = devWallet(2, provider);
  const payeeB = devWallet(3, provider);
  const outsider = devWallet(4, provider);
  const ownerSigner = new ethers.NonceManager(owner);

  const W = walletArtifact || artifact('AgentWallet');
  const T = artifact('MockERC20', 'mocks');
  const wallet = await new ethers.ContractFactory(W.abi, W.bytecode, ownerSigner).deploy(
    owner.address,
    agent.address,
    ethers.parseEther('0.01'),
    ethers.parseEther('0.05'),
  );
  const deployReceipt = await wallet.deploymentTransaction().wait();
  const token = await new ethers.ContractFactory(T.abi, T.bytecode, ownerSigner).deploy('Mock USD Coin (test only)', 'mUSDC', 6);
  await token.waitForDeployment();
  const walletAddress = await wallet.getAddress();
  const tokenAddress = await token.getAddress();

  await (await ownerSigner.sendTransaction({ to: walletAddress, value: ethers.parseEther('5') })).wait();
  await (await token.mint(walletAddress, ethers.parseUnits('10000', 6))).wait();
  await (await wallet.setTokenPolicy(tokenAddress, true, ethers.parseUnits('100', 6), ethers.parseUnits('250', 6))).wait();
  await (await wallet.setRecipient(payeeA.address, true)).wait();

  const F = artifact('MockPriceFeed', 'mocks');
  const ethFeed = await new ethers.ContractFactory(F.abi, F.bytecode, ownerSigner).deploy(8, 'ETH / USD (local synthetic)', 3000n * 10n ** 8n);
  await ethFeed.waitForDeployment();
  const usdFeed = await new ethers.ContractFactory(F.abi, F.bytecode, ownerSigner).deploy(8, 'mUSDC / USD (local synthetic)', 10n ** 8n);
  await usdFeed.waitForDeployment();

  return {
    wallet,
    token,
    owner,
    ownerSigner,
    agent,
    payeeA,
    payeeB,
    outsider,
    ethFeed,
    usdFeed,
    deployment: {
      network: 'localhost',
      chainId: 31337,
      contractAddress: walletAddress,
      deployBlock: deployReceipt.blockNumber,
      owner: owner.address,
      agent: agent.address,
      tokens: [
        { symbol: 'ETH', address: ethers.ZeroAddress, decimals: 18, native: true },
        { symbol: 'mUSDC', address: tokenAddress, decimals: 6, native: false, testOnly: true },
      ],
      demoRecipients: [{ label: 'Acme Components (supplier)', category: 'supplier', address: payeeA.address }],
      priceFeeds: [
        { token: ethers.ZeroAddress, feed: await ethFeed.getAddress(), source: 'local-mock-feed (synthetic)' },
        { token: tokenAddress, feed: await usdFeed.getAddress(), source: 'local-mock-feed (synthetic)' },
      ],
    },
  };
}
