import { blockchainService } from '../services/blockchainService.js';

export async function getWalletState(req, res, next) {
  try {
    const address = req.query.address || null;
    const state = await blockchainService.getWalletState(address);
    res.json({
      success: true,
      data: state,
    });
  } catch (err) {
    next(err);
  }
}
