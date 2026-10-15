import { config } from '../config/env.js';
import { AGENT_WALLET_ABI } from '../config/blockchain.js';

export async function getContractConfig(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        contractAddress: config.contractAddress || null,
        isConfigured: Boolean(config.contractAddress),
        status: config.contractAddress ? 'Configured' : 'Contract configuration missing',
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        abi: AGENT_WALLET_ABI,
      },
    });
  } catch (err) {
    next(err);
  }
}
