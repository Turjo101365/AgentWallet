import { ethers } from 'ethers';
import { badRequest, unavailable } from '../lib/errors.js';

export const SWAP_ABI = [
  'function isSwapRouterAllowed(address) view returns (bool)',
  'function executeSwap(bytes32,(address router,address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 amountOutMinimum,uint256 deadline)) returns (uint256)',
];
const QUOTER_ABI = ['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'];
const iface = new ethers.Interface(SWAP_ABI);

// Prepares owner transactions only. Never holds an owner signer or broadcasts.
export function createAssetManagementService({ config, chain }) {
  const settings = config.assetManagement || {};
  const enabled = Boolean(settings.router && settings.quoter);
  function status() {
    return { enabled, requiresOwnerTransaction: true, router: settings.router || null, quoter: settings.quoter || null,
      maxSlippageBps: settings.maxSlippageBps ?? 100, reason: enabled ? null : 'Trusted SwapRouter02 and QuoterV2 are not configured' };
  }
  async function prepareSwap(input) {
    if (!enabled) throw unavailable('SWAPS_NOT_CONFIGURED', status().reason);
    chain.requireReady();
    const tokenIn = chain.findToken(input.tokenIn), tokenOut = chain.findToken(input.tokenOut);
    if (!tokenIn || !tokenOut || tokenIn.native || tokenOut.native || tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase())
      throw badRequest('INVALID_SWAP_ASSETS', 'Choose two different configured ERC-20 assets');
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(String(input.amount))) throw badRequest('INVALID_AMOUNT', 'Amount must be a positive decimal string');
    let amountIn;
    try { amountIn = ethers.parseUnits(String(input.amount), tokenIn.decimals); } catch { throw badRequest('INVALID_AMOUNT', 'Invalid token precision'); }
    if (amountIn <= 0n) throw badRequest('INVALID_AMOUNT', 'Amount must be positive');
    const fee = Number(input.fee ?? 3000), slippageBps = Number(input.slippageBps ?? 50);
    const maxSlippageBps = Number(settings.maxSlippageBps ?? 100);
    if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 1000 || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > maxSlippageBps)
      throw badRequest('INVALID_SLIPPAGE', 'Slippage exceeds configured bound');
    if (![100, 500, 3000, 10000].includes(fee)) throw badRequest('INVALID_POOL_FEE', 'Unsupported V3 pool fee');
    const snapshot = await chain.getSnapshot();
    if (snapshot.paused) throw badRequest('WALLET_PAUSED', 'Wallet is paused');
    const source = snapshot.tokens.find(t => t.address.toLowerCase() === tokenIn.address.toLowerCase());
    const destination = snapshot.tokens.find(t => t.address.toLowerCase() === tokenOut.address.toLowerCase());
    if (!source?.enabled || !destination?.enabled || amountIn > source.balance || amountIn > source.perTxLimit || amountIn > source.remainingToday)
      throw badRequest('SWAP_POLICY_DENIED', 'Swap exceeds enabled asset, balance, or spending policy');
    const router = ethers.getAddress(settings.router), quoter = ethers.getAddress(settings.quoter);
    const wallet = new ethers.Contract(config.contractAddress, SWAP_ABI, chain.provider);
    try {
      if (!await wallet.isSwapRouterAllowed(router, { blockTag: snapshot.blockNumber })) throw new Error('Router disabled');
      if (await chain.provider.getCode(quoter, snapshot.blockNumber) === '0x') throw new Error('Quoter missing');
    } catch { throw unavailable('SWAP_CAPABILITY_UNAVAILABLE', 'Wallet swap capability or trusted router/quoter is unavailable'); }
    const quoteContract = new ethers.Contract(quoter, QUOTER_ABI, chain.provider);
    let quoted;
    try {
      quoted = await quoteContract.quoteExactInputSingle.staticCall({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0 }, { blockTag: snapshot.blockNumber });
    } catch { throw unavailable('SWAP_QUOTE_FAILED', 'Configured pool could not provide a quote'); }
    const amountOut = BigInt(quoted.amountOut);
    const amountOutMinimum = amountOut * BigInt(10000 - slippageBps) / 10000n;
    if (amountOutMinimum <= 0n) throw badRequest('INVALID_SWAP_QUOTE', 'Quote produces zero minimum output');
    const intentId = ethers.hexlify(ethers.randomBytes(32));
    const deadline = snapshot.blockTimestamp + 300;
    const params = { router, tokenIn: tokenIn.address, tokenOut: tokenOut.address, fee, amountIn, amountOutMinimum, deadline };
    const tx = { from: snapshot.owner, to: config.contractAddress, data: iface.encodeFunctionData('executeSwap', [intentId, params]), value: '0x0' };
    let estimated;
    try { await chain.provider.call(tx); estimated = await chain.provider.estimateGas(tx); }
    catch { throw badRequest('SWAP_SIMULATION_FAILED', 'Owner swap simulation reverted; refresh policy, balances, and quote'); }
    const gasLimit = estimated * 120n / 100n;
    const maxGasLimit = BigInt(settings.maxGasLimit ?? 500000);
    const maxFeePerGas = snapshot.maxFeePerGas ?? snapshot.gasPrice;
    const gasCap = ethers.parseUnits(String(settings.maxGasPriceGwei ?? '5'), 'gwei');
    if (gasLimit > maxGasLimit || maxFeePerGas === null || maxFeePerGas <= 0n || maxFeePerGas > gasCap)
      throw badRequest('SWAP_GAS_POLICY_DENIED', 'Estimated gas exceeds configured cap');
    return { kind: 'OWNER_SWAP', intentId, requiresOwnerTransaction: true, params: { ...params, amountIn: amountIn.toString(), amountOutMinimum: amountOutMinimum.toString() },
      quote: { tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amountIn.toString(), amountOut: amountOut.toString(), amountOutMinimum: amountOutMinimum.toString(), slippageBps, blockNumber: snapshot.blockNumber, deadline },
      transaction: { ...tx, chainId: config.chainId, gasLimit: gasLimit.toString(), maxFeePerGas: maxFeePerGas.toString(), maxPriorityFeePerGas: (snapshot.maxPriorityFeePerGas ?? 0n).toString() } };
  }
  async function prepareRebalance({ trades }) {
    if (!Array.isArray(trades) || trades.length < 1 || trades.length > 8) throw badRequest('INVALID_REBALANCE', 'Provide between one and eight independent swap legs');
    const swaps = [];
    for (const trade of trades) swaps.push(await prepareSwap(trade));
    const snapshot = await chain.getSnapshot();
    const totals = new Map();
    for (const swap of swaps) totals.set(swap.quote.tokenIn.toLowerCase(), (totals.get(swap.quote.tokenIn.toLowerCase()) || 0n) + BigInt(swap.quote.amountIn));
    for (const [token, amount] of totals) {
      const policy = snapshot.tokens.find(t => t.address.toLowerCase() === token);
      if (!policy?.enabled || amount > policy.remainingToday || amount > policy.balance) throw badRequest('REBALANCE_POLICY_DENIED', 'Aggregate swap input exceeds balance or daily policy');
    }
    return { kind: 'OWNER_REBALANCE', swaps, atomic: false, requiresOwnerTransaction: true,
      warning: 'Each leg needs a separate owner transaction. Refresh the next quote after each receipt; later legs may fail and earlier legs remain completed.' };
  }
  return { status, prepareSwap, prepareRebalance };
}
