import React from 'react';
import { Link } from 'react-router-dom';
import { BalancesCard } from '../components/wallet/BalancesCard.jsx';
import { AgentHealthCard } from '../components/wallet/AgentHealthCard.jsx';
import { ProposalCard } from '../components/proposals/ProposalCard.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { useWalletState, useProposals, useRecipients, useAgentStatus, labelFor } from '../hooks/useData.js';
import { describeError } from '../lib/api.js';

export function Overview() {
  const wallet = useWalletState();
  const status = useAgentStatus();
  const recipients = useRecipients();
  const active = useProposals('AWAITING_APPROVAL,APPROVED,SUBMITTED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          The agent key can only pay allowlisted recipients within the contract caps. Every transfer needs your signed approval.
        </p>
      </div>
      {wallet.error && <Alert variant="error" title="Wallet state unavailable">{describeError(wallet.error)}</Alert>}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <BalancesCard state={wallet.data} />
        </div>
        <AgentHealthCard state={wallet.data} status={status.data} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Needs attention</h2>
          <Link to="/proposals" className="text-xs text-primary font-semibold">
            All proposals →
          </Link>
        </div>
        {active.data?.length ? (
          <div className="space-y-4">
            {active.data.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                recipientLabel={labelFor(recipients.data, p.recipient)}
                onChanged={() => {
                  active.refresh();
                  wallet.refresh();
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
            Nothing is awaiting approval or executing. Create a transfer intent on the Proposals page.
          </div>
        )}
      </div>
    </div>
  );
}
