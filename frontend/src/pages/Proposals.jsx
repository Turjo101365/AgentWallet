import React, { useState } from 'react';
import { Button, LinkButton } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
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
      <PageHeader eyebrow="Review & approve" title="Payments" actions={<LinkButton to="/transactions" variant="secondary">View history</LinkButton>}>
        See what needs your approval, review the recipient and amount, and track confirmed payments. Nothing is sent without the required authorization.
      </PageHeader>
      {isDemo
        ? <p className="text-sm text-slate-600">Ask your AI Assistant to prepare a demo payment. Review and confirm payments created in this session here.</p>
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
        {proposals.error && <Alert variant="warning" title="We couldn’t load your payments"><Button variant="secondary" size="sm" onClick={proposals.refresh}>Try again</Button></Alert>}
        {!proposals.data && !proposals.error && <p role="status" className="text-sm text-slate-600">Loading your payments…</p>}
        {proposals.data?.map((p) => (
          <ProposalCard key={p.id} proposal={p} recipientLabel={labelFor(recipients.data, p.recipient)} onChanged={proposals.refresh} />
        ))}
        {proposals.data && proposals.data.length === 0 && <div className="text-sm text-slate-500">You’re all caught up. No payments match this view.</div>}
      </div>
    </div>
  );
}
