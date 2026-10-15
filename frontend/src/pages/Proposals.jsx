import React, { useState } from 'react';
import { NewProposalForm } from '../components/proposals/NewProposalForm.jsx';
import { ProposalCard } from '../components/proposals/ProposalCard.jsx';
import { useProposals, useRecipients, labelFor } from '../hooks/useData.js';

const FILTERS = [
  ['All', null],
  ['Awaiting', 'AWAITING_APPROVAL'],
  ['In flight', 'APPROVED,SUBMITTED'],
  ['Confirmed', 'CONFIRMED'],
  ['Failed / blocked', 'FAILED,POLICY_REJECTED'],
  ['Closed', 'REJECTED,EXPIRED'],
];

export function Proposals() {
  const [filter, setFilter] = useState(null);
  const proposals = useProposals(filter);
  const recipients = useRecipients();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Proposals</h1>
      <NewProposalForm recipients={recipients.data || []} onCreated={() => proposals.refresh()} />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([label, value]) => (
          <button
            key={label}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              filter === value ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
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
