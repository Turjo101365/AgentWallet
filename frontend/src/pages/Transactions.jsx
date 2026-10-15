import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useTransactions } from '../hooks/useData.js';
import { useApp } from '../app/providers.jsx';
import { formatDateTime, truncateAddress, formatAmount } from '../utils/formatters.js';
import { formatUnits } from 'ethers';

const statusVariant = { CONFIRMED: 'success', SUBMITTED: 'warning', PREPARING: 'warning', FAILED: 'error' };

function amount(tokens, token, value) {
  const t = tokens.find((x) => x.address.toLowerCase() === String(token).toLowerCase());
  return t ? `${formatAmount(formatUnits(value, t.decimals))} ${t.symbol}` : `${value} base units of ${truncateAddress(token)}`;
}

function describe(ev, tokens) {
  const a = ev.args || {};
  switch (ev.name) {
    case 'TransferExecuted':
      return `Agent transfer of ${amount(tokens, a.token, a.amount)} to ${truncateAddress(a.recipient)}`;
    case 'Deposited':
      return `Deposit of ${formatAmount(formatUnits(a.amount, 18))} ETH from ${truncateAddress(a.from)}`;
    case 'Withdrawn':
      return `Owner withdrawal of ${amount(tokens, a.token, a.amount)} to ${truncateAddress(a.to)}`;
    case 'EmergencyWithdrawal':
      return `Emergency withdrawal of ${amount(tokens, a.token, a.amount)} to ${truncateAddress(a.to)}`;
    case 'RecipientUpdated':
      return `${a.allowed ? 'Allowlisted' : 'Removed'} recipient ${truncateAddress(a.recipient)}`;
    case 'TokenPolicyUpdated':
      return `Limits set: per-tx ${amount(tokens, a.token, a.perTxLimit)}, daily ${amount(tokens, a.token, a.dailyLimit)}, ${a.enabled ? 'enabled' : 'disabled'}`;
    case 'AgentUpdated':
      return `Agent changed ${truncateAddress(a.previousAgent)} → ${truncateAddress(a.newAgent)}`;
    case 'EmergencyStop':
      return `Emergency stop: paused and revoked agent ${truncateAddress(a.revokedAgent)}`;
    default:
      return ev.name;
  }
}

export function Transactions() {
  const { config } = useApp();
  const txs = useTransactions();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Transactions</h1>
        <p className="text-sm text-slate-500 mt-1">Built only from mined receipts and contract event logs indexed by the backend.</p>
      </div>
      <Card>
        <CardHeader title="Verified history" subtitle={txs.data ? `${txs.data.length} transactions` : 'Loading…'} />
        <CardContent className="space-y-3">
          {txs.data?.map((t) => (
            <div key={t.txHash} className="border border-slate-100 rounded-lg p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono break-all">
                  {t.explorerUrl ? (
                    <a className="underline" href={t.explorerUrl} target="_blank" rel="noreferrer">
                      {t.txHash}
                    </a>
                  ) : (
                    t.txHash
                  )}
                </span>
                <Badge variant={statusVariant[t.status] || 'neutral'}>{t.status}</Badge>
              </div>
              <div className="text-slate-500 mt-1">
                Block {t.blockNumber ?? 'pending'} · {t.blockTimestamp ? formatDateTime(t.blockTimestamp) : '—'}
              </div>
              <ul className="mt-2 space-y-0.5 text-slate-700">
                {t.events.map((ev) => (
                  <li key={ev.logIndex}>• {describe(ev, config.tokens)}</li>
                ))}
                {t.execution?.errorCode && (
                  <li className="text-rose-700">
                    • {t.execution.errorCode}: {t.execution.errorMessage}
                  </li>
                )}
              </ul>
            </div>
          ))}
          {txs.data?.length === 0 && <div className="text-sm text-slate-500">No transactions yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
