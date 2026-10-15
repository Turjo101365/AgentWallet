import { transactionService } from '../services/transactionService.js';

export async function listTransactions(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const txs = await transactionService.getRecentTransactions(limit);
    res.json({
      success: true,
      data: txs,
    });
  } catch (err) {
    next(err);
  }
}

export async function trackTransaction(req, res, next) {
  try {
    const txData = req.body;
    const tracked = await transactionService.trackSubmittedTransaction(txData);
    res.json({
      success: true,
      data: tracked,
    });
  } catch (err) {
    next(err);
  }
}
