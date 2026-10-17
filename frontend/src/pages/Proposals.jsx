import React, { useState } from 'react';
import { PageHeader } from '../components/ui/Card.jsx';
import { NewProposalForm } from '../components/proposals/NewProposalForm.jsx';
import { ProposalCard } from '../components/proposals/ProposalCard.jsx';
import { useProposals, useRecipients, labelFor } from '../hooks/useData.js';
import { useApp } from '../app/providers.jsx';

const FILTERS = [
  ['All', null],
  ['Awaiting', 'AWAITING_APPROVAL'],
  ['In flight', 'APPROVED,SUBMITTED'],
  ['Confirmed', 'CONFIRMED'],
  ['Failed / blocked', 'FAILED,POLICY_REJECTED'],
  ['Closed', 'REJECTED,EXPIRED'],
];

export function Proposals() {
  const { isDemo } = useApp();
  const [filter, setFilter] = useState(null);
  const proposals = useProposals(filter);
  const recipients = useRecipients();

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Owner authorization" title="Proposals">
        Every transfer intent with its policy checks and pre-flight simulation. Approving signs exactly this transfer (EIP-712); nothing moves without that signature or a signed task grant.
      </PageHeader>
      {isDemo
        ? <p className="text-sm text-slate-600">In the demo wallet, payments are drafted by the AI agent; open AI agent to ask for one. Payments drafted in this session can be confirmed here.</p>
        : <NewProposalForm recipients={recipients.data || []} onCreated={() => proposals.refresh()} />}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter proposals">
        {FILTERS.map(([label, value]) => (
          <button
            key={label}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`h-9 px-4 rounded-full text-[13px] font-semibold transition-colors ${
              filter === value ? 'bg-ink text-white' : 'bg-white text-slate-700 hover:bg-slate-100 shadow-card'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {proposals.data?.map((p) => (
          <ProposalCard key={p.id} proposal={p} recipientLabel={labelFor(recipients.data, p.recipient)} onChanged={proposals.refresh} />
        ))}
        {proposals.data && proposals.data.length === 0 && <div className="text-sm text-slate-500">No proposals in this view.</div>}
      </div>
    </div>
  );
}
