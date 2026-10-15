import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { unavailable } from '../lib/errors.js';
import { explorerTxUrl, explorerAddressUrl } from '../config/networks.js';

const ABI_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../shared/abi/AgentWallet.json');
export const AGENT_WALLET_ABI = JSON.parse(fs.readFileSync(ABI_FILE, 'utf8')).abi;
export const agentWalletInterface = new ethers.Interface(AGENT_WALLET_ABI);

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

/**
 * Read-side blockchain access. All authoritative wallet state the backend uses comes from here,
 * never from the client. Snapshots read every value at one block number for consistency.
 */
export function createChainService(config, { provider: injectedProvider } = {}) {
  const network = config.network;
  const provider =
    injectedProvider ||
    new ethers.JsonRpcProvider(config.rpcUrl, { chainId: config.chainId, name: network.key }, { staticNetwork: true });
  const contract = config.contractAddress ? new ethers.Contract(config.contractAddress, AGENT_WALLET_ABI, provider) : null;

  const status = { ready: false, checkedAt: null, error: null, rpcChainId: null };
  let ownerCache = { value: null, at: 0 };

  function requireContract() {
    if (!contract) throw unavailable('CONTRACT_NOT_CONFIGURED', 'No AgentWallet contract is configured for this network');
    return contract;
  }

  async function verify() {
    status.checkedAt = Date.now();
    try {
      const rpcChainId = Number(await provider.send('eth_chainId', []));
      status.rpcChainId = rpcChainId;
      if (rpcChainId !== config.chainId) {
        throw new Error(`RPC reports chain ${rpcChainId} but backend is configured for ${config.chainId}`);
      }
      if (!contract) throw new Error('AgentWallet contract address is not configured');
      const code = await provider.getCode(config.contractAddress);
      if (!code || code === '0x') throw new Error(`No contract code at ${config.contractAddress}`);
      await contract.owner();
      for (const token of config.tokens) {
        if (token.native) continue;
        const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
        const [decimals, symbol] = await Promise.all([erc20.decimals(), erc20.symbol()]);
        if (Number(decimals) !== token.decimals) {
          throw new Error(`Token ${token.address} reports ${decimals} decimals, config says ${token.decimals}`);
        }
        token.onChainSymbol = symbol;
      }
      status.ready = true;
      status.error = null;
    } catch (err) {
      status.ready = false;
      status.error = err.shortMessage || err.message;
    }
    return { ...status };
  }

  function requireReady() {
    if (!status.ready) throw unavailable('CHAIN_UNAVAILABLE', `Blockchain not ready: ${status.error || 'not verified yet'}`);
  }

  async function getOwner() {
    requireContract();
    if (ownerCache.value && Date.now() - ownerCache.at < config.ownerCacheMs) return ownerCache.value;
    const owner = ethers.getAddress(await contract.owner());
    ownerCache = { value: owner, at: Date.now() };
    return owner;
  }

  function findToken(address) {
    return config.tokens.find((t) => t.address.toLowerCase() === String(address).toLowerCase()) || null;
  }

  async function tokenBalance(token, holder, blockTag) {
    if (token.native) return provider.getBalance(holder, blockTag);
    return new ethers.Contract(token.address, ERC20_ABI, provider).balanceOf(holder, { blockTag });
  }

  /** Consistent read of everything the policy engine needs, pinned to one block. */
  async function getSnapshot() {
    requireReady();
    const c = requireContract();
    // Resolve the head through an uncached RPC request first. ethers may cache
    // `getBlock('latest')` briefly, which can make an approval evaluate policy
    // against the block before a just-mined allowlist or limit change.
    const head = Number(await provider.send('eth_blockNumber', []));
    const block = await provider.getBlock(head);
    if (!block) throw unavailable('CHAIN_UNAVAILABLE', 'Could not read latest block');
    const blockTag = block.number;
    const overrides = { blockTag };

    const [owner, agent, paused, day, feeData, executorBalance] = await Promise.all([
      c.owner(overrides),
      c.agent(overrides),
      c.paused(overrides),
      c.currentDay(overrides),
      provider.getFeeData(),
      config.executor.address ? provider.getBalance(config.executor.address, blockTag) : Promise.resolve(null),
    ]);

    const tokens = await Promise.all(
      config.tokens.map(async (token) => {
        const [policy, spent, balance] = await Promise.all([
          c.tokenPolicy(token.address, overrides),
          c.spentPerDay(token.address, day, overrides),
          tokenBalance(token, config.contractAddress, blockTag),
        ]);
        const dailyLimit = BigInt(policy.dailyLimit);
        const spentToday = BigInt(spent);
        return {
          ...token,
          enabled: Boolean(policy.enabled),
          perTxLimit: BigInt(policy.perTxLimit),
          dailyLimit,
          spentToday,
          remainingToday: policy.enabled && dailyLimit > spentToday ? dailyLimit - spentToday : 0n,
          balance: BigInt(balance),
        };
      }),
    );

    return {
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestamp: Number(block.timestamp),
      blockUtilization: block.gasLimit > 0n ? Number((block.gasUsed * 10000n) / block.gasLimit) / 10000 : null,
      baseFeePerGas: block.baseFeePerGas ?? null,
      gasPrice: feeData.gasPrice ?? null,
      maxFeePerGas: feeData.maxFeePerGas ?? null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? null,
      owner: ethers.getAddress(owner),
      agent: ethers.getAddress(agent),
      paused: Boolean(paused),
      day: BigInt(day),
      executorAddress: config.executor.address,
      executorBalance: executorBalance === null ? null : BigInt(executorBalance),
      tokens,
    };
  }

  async function isRecipientAllowed(address, blockTag = 'latest') {
    return Boolean(await requireContract().isRecipientAllowed(address, { blockTag }));
  }

  async function isIntentExecuted(intentId) {
    return Boolean(await requireContract().executedIntents(intentId));
  }

  return {
    config,
    provider,
    contract,
    network,
    status,
    verify,
    requireReady,
    getOwner,
    getSnapshot,
    findToken,
    isRecipientAllowed,
    isIntentExecuted,
    txUrl: (hash) => explorerTxUrl(network, hash),
    addressUrl: (addr) => explorerAddressUrl(network, addr),
  };
}

/** Extracts a contract custom error (e.g. RecipientNotAllowed) from an ethers error, if present. */
export function decodeContractError(err) {
  const candidates = [err?.data, err?.info?.error?.data, err?.error?.data, err?.revert?.data];
  for (const data of candidates) {
    if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
      try {
        const parsed = agentWalletInterface.parseError(data);
        if (parsed) return { name: parsed.name, args: parsed.args.map((a) => (typeof a === 'bigint' ? a.toString() : a)) };
      } catch {
        /* not one of ours */
      }
    }
  }
  if (err?.revert?.name) return { name: err.revert.name, args: (err.revert.args || []).map(String) };
  return null;
}

export function serializeSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
