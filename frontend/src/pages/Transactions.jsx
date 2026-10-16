import React from 'react';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useTransactions } from '../hooks/useData.js';
import { useApp } from '../app/providers.jsx';
import { formatDateTime } from '../utils/formatters.js';
import { describeEvent, EVENT_ICON } from '../lib/events.js';
import { useNetworkMode } from '../components/layout/NetworkMode.jsx';

const statusVariant = { CONFIRMED: 'success', SUBMITTED: 'warning', PREPARING: 'warning', FAILED: 'error' };

export function Transactions() {
  const { config } = useApp();
  const txs = useTransactions();
  const { isPublic } = useNetworkMode();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Verified history" title="Transactions">
        Built only from mined receipts and contract event logs indexed by the backend.
      </PageHeader>
      <Card>
        <CardHeader title="Verified history" subtitle={txs.data ? `${txs.data.length} transactions${isPublic ? ', each linked to the public explorer' : ' on the local simulation chain (no public explorer)'}` : 'Loading…'} />
        <CardContent className="pt-4">
          <ul className="divide-y divide-slate-100">
            {txs.data?.map((t) => (
              <li key={t.txHash} className="py-4 flex gap-4">
                <span aria-hidden="true" className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${t.status === 'FAILED' ? 'bg-blush text-blush-deep' : t.events.some((e) => e.name === 'TransferExecuted') ? 'bg-sky text-sky-deep' : 'bg-slate-100 text-slate-700'}`}>
                  <span className="material-symbols-outlined text-[19px]">{t.status === 'FAILED' ? 'error' : EVENT_ICON[t.events[0]?.name] || 'receipt_long'}</span>
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ul className="text-[14px] font-semibold text-ink space-y-0.5">
                      {t.events.map((ev) => (
                        <li key={ev.logIndex}>{describeEvent(ev, config.tokens)}</li>
                      ))}
                      {t.execution?.errorCode && (
                        <li className="text-blush-deep">
                          {t.execution.errorCode}: {t.execution.errorMessage}
                        </li>
                      )}
                    </ul>
                    <Badge variant={statusVariant[t.status] || 'neutral'}>{t.status}</Badge>
                  </div>
                  <div className="text-[12px] text-slate-500 font-mono">
                    Block {t.blockNumber ?? 'pending'} · {t.blockTimestamp ? formatDateTime(t.blockTimestamp) : '—'}
                  </div>
                  <div className="text-[12px] font-mono break-all">
                    {t.explorerUrl ? (
                      <a className="inline-flex items-center gap-1 rounded-full bg-sky px-2.5 py-1 text-sky-deep underline-offset-2 hover:underline" href={t.explorerUrl} target="_blank" rel="noreferrer">
                        <span>{t.txHash}</span>
                        <span aria-hidden="true" className="material-symbols-outlined text-[13px]">open_in_new</span>
                      </a>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-butter sim-hatch px-2.5 py-1 text-butter-deep">
                        <span>{t.txHash}</span>
                        <span className="font-sans font-bold">{isPublic ? 'no explorer link' : 'local chain · not public'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {txs.data?.length === 0 && <div className="text-sm text-slate-500">No transactions yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
