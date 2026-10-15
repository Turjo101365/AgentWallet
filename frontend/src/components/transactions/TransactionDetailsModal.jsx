import React from 'react';
import { Modal } from '../ui/Modal.jsx';
import { Badge } from '../ui/Badge.jsx';
import { formatEth, formatGwei } from '../../utils/formatters.js';

export function TransactionDetailsModal({ isOpen, onClose, transaction }) {
  if (!transaction) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transaction Execution Telemetry">
      <div className="space-y-4 font-mono text-xs">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <span className="text-slate-500">Status:</span>
          <Badge variant={transaction.status === 'CONFIRMED' ? 'success' : 'warning'}>
            {transaction.status}
          </Badge>
        </div>

        <div className="space-y-2.5">
          <div>
            <span className="text-slate-400 block text-[11px] uppercase">Transaction Hash</span>
            <span className="font-bold text-slate-800 break-all">{transaction.txHash || 'Pending'}</span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase">Signer (From)</span>
            <span className="font-semibold text-slate-700 break-all">{transaction.fromAddress}</span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase">Target (To)</span>
            <span className="font-semibold text-slate-700 break-all">{transaction.toAddress}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <span className="text-slate-400 block text-[11px] uppercase">Amount</span>
              <span className="font-bold text-slate-800 text-sm">{formatEth(transaction.valueEth, 4)} ETH</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] uppercase">Block Number</span>
              <span className="font-bold text-slate-800 text-sm">{transaction.blockNumber || 'Awaiting Mining'}</span>
            </div>
          </div>

          {transaction.calldata && (
            <div className="pt-2">
              <span className="text-slate-400 block text-[11px] uppercase">Encoded Calldata</span>
              <div className="p-2.5 bg-slate-900 rounded-lg text-emerald-400 text-[11px] break-all max-h-24 overflow-y-auto">
                {transaction.calldata}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
