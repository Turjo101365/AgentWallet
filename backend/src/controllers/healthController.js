import { checkDatabaseConnection } from '../config/database.js';
import { rlClient } from '../services/rlClient.js';
import { getProvider } from '../config/blockchain.js';

export async function getHealthStatus(req, res, next) {
  try {
    const dbStatus = await checkDatabaseConnection();
    const rlStatus = await rlClient.getHealth();

    let rpcConnected = false;
    try {
      const provider = getProvider();
      if (provider) {
        await provider.getBlockNumber();
        rpcConnected = true;
      }
    } catch (e) {
      rpcConnected = false;
    }

    res.json({
      status: 'healthy',
      service: 'AgentWallet-Backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        database: dbStatus.connected ? 'connected' : 'in-memory-fallback',
        rlEngine: rlStatus.status === 'healthy' ? 'healthy' : 'offline',
        evmRpc: rpcConnected ? 'connected' : 'unreachable',
      },
    });
  } catch (err) {
    next(err);
  }
}
