import { v4 as uuidv4 } from 'uuid';
import { transactionRepository } from '../repositories/transactionRepository.js';
import { blockchainService } from './blockchainService.js';
import { config } from '../config/env.js';

class TransactionService {
  async trackSubmittedTransaction({
    txHash,
    decisionId = null,
    fromAddress,
    toAddress,
    valueEth,
    valueWei,
    calldata = null,
  }) {
    const id = uuidv4();
    const record = {
      id,
      txHash,
      decisionId,
      chainId: config.chainId,
      fromAddress,
      toAddress,
      valueWei: valueWei || '0',
      valueEth: parseFloat(valueEth || '0'),
      calldata,
      status: txHash ? 'BROADCASTED' : 'AWAITING_USER_SIGNATURE',
      blockNumber: null,
      confirmations: 0,
      gasUsed: null,
      effectiveGasPriceGwei: null,
      submittedAt: Math.floor(Date.now() / 1000),
      confirmedAt: null,
    };

    await transactionRepository.save(record);

    // If txHash is provided, start background verification
    if (txHash) {
      this.monitorReceipt(txHash).catch((err) => {
        console.warn(`[TxMonitor Warning for ${txHash}]:`, err.message);
      });
    }

    return record;
  }

  async monitorReceipt(txHash) {
    try {
      const receipt = await blockchainService.waitForReceipt(txHash, 1);
      if (receipt) {
        const isSuccess = receipt.status === 1;
        const record = await transactionRepository.findByHash(txHash);
        if (record) {
          record.status = isSuccess ? 'CONFIRMED' : 'REVERTED';
          record.blockNumber = receipt.blockNumber;
          record.gasUsed = Number(receipt.gasUsed);
          record.confirmations = 1;
          record.confirmedAt = Math.floor(Date.now() / 1000);
          await transactionRepository.save(record);
        }
      }
    } catch (e) {
      console.warn(`[Receipt Monitor Failed for ${txHash}]:`, e.message);
    }
  }

  async getRecentTransactions(limit = 20) {
    return await transactionRepository.listRecent(limit);
  }
}

export const transactionService = new TransactionService();
