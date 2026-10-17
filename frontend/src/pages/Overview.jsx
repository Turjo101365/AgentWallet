import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatUnits } from 'ethers';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button, LinkButton } from '../components/ui/Button.jsx';
import { ProposalCard } from '../components/proposals/ProposalCard.jsx';
import { StatusBadge } from '../components/proposals/StatusBadge.jsx';
import { useApp } from '../app/providers.jsx';
import {
  useWalletState, useProposals, useRecipients, useAgentStatus, useTransactions, useAuditLog, useAuditVerify, useTasks, usePolicy, labelFor,
} from '../hooks/useData.js';
import { usePolling } from '../hooks/usePolling.js';
import { get, describeError } from '../lib/api.js';
import { explorerAddress } from '../lib/networks.js';
import { describeEvent, EVENT_ICON, auditIcon } from '../lib/events.js';
import { useNetworkMode } from '../components/layout/NetworkMode.jsx';
import { formatAmount, formatTimeAgo, formatDateTime, truncateAddress, percentOf, humanizeAction } from '../utils/formatters.js';

const EXAMPLES = ['Send 0.0001 ETH to my approved recipient.', 'Show my recent payments.', 'Help me set up an automatic payment.'];

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function Dot({ ok }) {
  return <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-mint-deep' : 'bg-blush-deep'}`} />;
}



// ---------------------------------------------------------------------------------------- treasury

function TreasuryCard({ state, config }) {
  const { isDemo, isOwner } = useApp();
  const { isPublic } = useNetworkMode();
  if (!state) return <Card tone="mint" aria-busy="true" className="min-h-[300px] p-7 animate-pulse"><h3 className="text-2xl">Available balance</h3><p className="mt-4 text-mint-deep">Loading your live balance…</p></Card>;
  const [main, ...rest] = state.tokens;
  const contractLink = explorerAddress(config, config.contractAddress);
  return (
    <Card tone="mint" className="relative overflow-hidden flex flex-col">
      <CardHeader
        eyebrow={isDemo ? 'Shared demo wallet' : 'Wallet balance'}
        title="Available balance"
        badge={state.paused ? <Badge variant="error">Payments paused</Badge> : <Badge variant="success">{isPublic ? 'Test ETH' : 'Local simulation'}</Badge>}
      />
      <CardContent className="pt-3 flex-1 flex flex-col justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="numeral text-[56px] sm:text-[72px] text-ink">{formatAmount(main.formatted.balance, 6)}</span>
            <span className="font-display text-2xl text-mint-deep">{main.symbol}</span>
          </div>
          <div className="mt-2 text-[13px] text-mint-deep/90">
            {isPublic ? 'Sepolia test ETH — no real money.' : 'Local simulation funds — no real money.'} {isDemo ? 'Shared demo funds managed by the team, not your personal wallet.' : 'Read directly from your wallet contract.'}
          </div>
        </div>
        {rest.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-2">
            {rest.map((t) => (
              <div key={t.address} className="rounded-2xl bg-white/55 px-4 py-3">
                <div className="eyebrow text-mint-deep/80">{t.symbol}{t.testOnly ? ' · test token' : ''}</div>
                <div className="font-mono text-lg text-ink mt-0.5">{formatAmount(t.formatted.balance, 4)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="font-mono text-mint-deep" title={config.contractAddress}>
            {contractLink ? (
              <a className="underline hover:text-ink" href={contractLink} target="_blank" rel="noreferrer">
                View wallet on explorer ↗
              </a>
            ) : (
              <>{truncateAddress(config.contractAddress, 8, 6)} · local, no explorer</>
            )}
          </span>
          <Link to="/treasury" className="font-semibold text-ink inline-flex items-center gap-1 hover:gap-2 transition-all">
            {isDemo ? 'Wallet details' : isOwner ? 'Manage funds' : 'View balance'} <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ tone, icon, label, value, hint, to, action }) {
  const inner = (
    <Card tone={tone} className="h-full p-5 flex flex-col justify-between gap-5 group hover:-translate-y-0.5 transition-transform">
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-full bg-white/60 flex items-center justify-center"><Icon name={icon} className="text-[19px]" /></span>
        <Icon name="arrow_outward" className="text-[18px] opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
      <div>
        <div className="numeral text-[40px] text-ink">{value}</div>
        <div className="text-[13px] font-bold mt-1.5">{label}</div>
        {hint && <div className="text-sm text-slate-700 mt-1 leading-snug">{hint}</div>}
        {action && <div className="mt-4 text-sm font-semibold underline underline-offset-4">{action} →</div>}
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block rounded-4xl">{inner}</Link> : inner;
}

// ---------------------------------------------------------------------------------------- AI command center

function CommandCenter({ status }) {
  const { isOwner, isDemo } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const conversations = usePolling(() => get('/agent/conversations'), 20000, [], { enabled: isOwner || isDemo });
  const llm = status?.llm;

  function open(e) {
    e.preventDefault();
    // Router state, not the URL: the instruction never lands in history or server logs.
    navigate('/agent', { state: { draft: draft.trim() } });
  }

  return (
    <Card tone="ink" className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-[#9fdcb8]/10 blur-2xl" />
      <CardHeader
        eyebrow="Your AI assistant"
        title="What would you like your AI to do?"
        badge={
          llm ? (
            llm.available ? <Badge variant="dark" pulse>AI connected</Badge> : <Badge variant="error">Model unavailable</Badge>
          ) : null
        }
      />
      <CardContent className="pt-4 space-y-5 relative">
        <form onSubmit={open} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-3xl bg-white/10 ring-1 ring-white/20 focus-within:ring-white/60 p-3 transition">
          <Icon name="auto_awesome" className="text-[20px] text-[#9fdcb8]" />
          <input
            aria-label="Ask your AI assistant"
            className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/45 text-[15px] focus:outline-none py-2"
            placeholder="Tell me what you need…"
            value={draft}
            maxLength={1200}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="h-11 px-4 rounded-full bg-mint text-ink text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white transition-colors shrink-0">
            Ask AI <Icon name="arrow_forward" className="text-[18px]" />
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setDraft(ex)} className="text-[12.5px] rounded-full px-3.5 py-1.5 bg-white/[0.06] text-white/80 hover:bg-white/15 hover:text-white transition-colors">
              {ex}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-2 text-[12px]">
          {[
            ['edit_note', '1. Ask & review', 'Your assistant prepares a payment and checks its risk.'],
            ['draw', '2. Confirm', isDemo ? 'You confirm; the demo wallet signs within its limits.' : 'You approve the exact payment in your wallet.'],
            ['receipt_long', '3. See the receipt', 'Only a verified receipt means the payment was sent.'],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-2xl bg-white/[0.05] p-3.5">
              <Icon name={icon} className="text-[19px] text-[#9fdcb8]" />
              <div className="font-bold text-white mt-1.5">{title}</div>
              <div className="text-white/60 leading-snug">{body}</div>
            </div>
          ))}
        </div>
        {llm && !llm.available && <div className="text-[12.5px] text-[#f5c9bb]">No language model configured: {llm.reason}. Every other control works without it.</div>}
        {conversations.data?.length > 0 && (
          <div>
            <div className="eyebrow text-white/50 mb-2">Recent conversations</div>
            <div className="flex flex-wrap gap-2">
              {conversations.data.slice(0, 4).map((c) => (
                <Link key={c.id} to="/agent" state={{ conversationId: c.id }} className="text-[12.5px] rounded-full px-3 py-1.5 ring-1 ring-white/15 text-white/80 hover:ring-white/50 hover:text-white truncate max-w-[260px]">
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------- risk engine

function Meter({ pct, tone = 'ink' }) {
  const color = pct >= 90 ? 'bg-blush-deep' : pct >= 60 ? 'bg-butter-deep' : tone === 'ink' ? 'bg-ink' : 'bg-mint-deep';
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="presentation">
      <div className={`h-full rounded-full ${color} transition-[width] duration-700`} style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }} />
    </div>
  );
}

function RiskEngine({ state, policy, demoStatus }) {
  const { isOwner, isDemo } = useApp();
  if (!state) return <Card className="p-7 min-h-[240px] animate-pulse" aria-busy="true"><p>Loading spending rules…</p></Card>;
  return <Card>
    <CardHeader title="Your AI's spending rules" subtitle="Your AI cannot exceed these contract-enforced limits." action={<LinkButton to="/controls" size="sm">{isOwner ? 'Manage rules' : 'View rules'}</LinkButton>} />
    <CardContent className="space-y-5 pt-5">
      {state.tokens.filter(t => t.enabled).map(t => {
        const remaining = BigInt(t.dailyLimit) > BigInt(t.spentToday) ? BigInt(t.dailyLimit) - BigInt(t.spentToday) : 0n;
        return <div key={t.address} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[["Per payment", t.formatted.perTxLimit], ["Per day", t.formatted.dailyLimit], ["Spent today", t.formatted.spentToday], ["Daily allowance left", formatUnits(remaining, t.decimals)]].map(([label,value]) => <div key={label} className="rounded-2xl bg-slate-50 p-3.5"><div className="text-sm text-slate-600">{label}</div><div className="font-semibold text-lg mt-1 tabular-nums">{formatAmount(value,6)} <span className="text-sm text-slate-600">{t.symbol}</span></div></div>)}
          </div>
          <Meter pct={percentOf(t.formatted.spentToday,t.formatted.dailyLimit)} />
        </div>;
      })}
      <p className="text-xs text-slate-600">Daily limits reset at 00:00 UTC. Available funds and other safety checks may limit a payment further.</p>
      {isDemo && <div className="rounded-2xl bg-butter-soft p-4 text-sm text-butter-deep"><strong>Demo access budget — separate from the contract</strong>{demoStatus ? <p className="mt-1">Up to {demoStatus.limits.maxTxPerSession} payments per session and {demoStatus.limits.dailyTxLimit} per day across all judges. {Math.max(0,demoStatus.limits.dailyTxLimit-demoStatus.today.txCount)} payments left in today's shared budget. The server also protects a {demoStatus.limits.minTreasuryEth} ETH treasury reserve and a transaction-fee budget.</p> : <p className="mt-1">Live payments also need an invite and must fit the shared session, daily and fee budgets. Loading current budgets…</p>}</div>}
      <details className="technical-details"><summary>How these rules are enforced</summary><p className="text-slate-600">Payment and daily caps are verified by the smart contract. Approved recipients, reserves, authorization and failure protections are checked again before execution.</p><p className="text-xs text-slate-500 mt-2">Latest chain block: {state.blockNumber}. {policy?.circuitBreaker?.maxConsecutiveFailures ? 'Failure protection stops a task after '+policy.circuitBreaker.maxConsecutiveFailures+' consecutive failures.' : ''}</p></details>
    </CardContent>
  </Card>;
}

// ---------------------------------------------------------------------------------------- autonomy

const TASK_TONE = { ACTIVE: 'success', PENDING_AUTHORIZATION: 'warning', PAUSED: 'warning', FAILED: 'error' };

function AutonomousOps({ status, tasks, recipients }) {
  const { judgeSite } = useApp();
  const automationPaused = status?.automation?.paused;
  const list = (tasks || []).filter((t) => ['ACTIVE', 'PENDING_AUTHORIZATION', 'PAUSED'].includes(t.status));
  const done = (tasks || []).filter((t) => !['ACTIVE', 'PENDING_AUTHORIZATION', 'PAUSED'].includes(t.status));
  const lastTick = status?.scheduler?.lastTickAt;
  return (
    <Card tone="lilac" className="flex flex-col">
      <CardHeader
        eyebrow="Approved permissions"
        title="Automatic payments"
        badge={status ? automationPaused ? <Badge variant="error">Automation paused</Badge> : <Badge variant="neutral">{judgeSite ? 'Requires open page' : 'Available'}</Badge> : null}
      />
      <CardContent className="pt-4 space-y-4 flex-1 flex flex-col">
        <p className="text-sm text-lilac-deep">Let your AI complete approved payments within the limits you set.</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Active', list.filter((t) => t.status === 'ACTIVE').length],
            ['Needs approval', list.filter((t) => t.status === 'PENDING_AUTHORIZATION').length],
            ['Finished / expired', done.length],
          ].map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-white/55 px-3 py-2.5">
              <div className="numeral text-[30px]">{tasks ? n : '—'}</div>
              <div className="text-[11.5px] font-semibold text-lilac-deep mt-1">{label}</div>
            </div>
          ))}
        </div>
        <ul className="space-y-2 flex-1">
          {[...list, ...done].slice(0, 4).map((t) => (
            <li key={t.id} className="rounded-2xl bg-white/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[13.5px] truncate">{t.title}</span>
                <Badge variant={TASK_TONE[t.status] || 'neutral'}>{t.status === 'PENDING_AUTHORIZATION' ? 'needs approval' : t.status.toLowerCase()}</Badge>
              </div>
              <div className="text-[12px] text-slate-600 font-mono mt-1 truncate">
                {t.amountFormatted} {t.token.symbol} → {labelFor(recipients, t.recipient) || truncateAddress(t.recipient)} · {t.scheduleDescription}
              </div>
              <div className="text-[11.5px] text-slate-500 mt-0.5">
                Runs {t.runsCount}{t.maxRuns ? `/${t.maxRuns}` : ''} · next {t.nextRunAt ? formatDateTime(t.nextRunAt) : '—'}
              </div>
            </li>
          ))}
          {!tasks && <li className="text-sm text-lilac-deep">Loading automatic payments…</li>}
          {tasks && list.length + done.length === 0 && (
            <li className="rounded-2xl bg-white/50 px-4 py-4 text-[13px] text-lilac-deep">
              No automatic payments yet. Set a limit and authorize your first payment schedule on the Automations page.
            </li>
          )}
        </ul>
        <div className="flex items-center justify-between text-[12px] text-lilac-deep">
          <span>{judgeSite ? 'Process due payments on the Automations page.' : lastTick ? 'Last checked '+formatTimeAgo(Math.floor(lastTick / 1000)) : 'No schedules processed yet.'}</span>
          <Link to="/automation" className="font-semibold text-ink inline-flex items-center gap-1 hover:gap-2 transition-all">Manage automations <Icon name="arrow_forward" className="text-[16px]" /></Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------- transactions

function RecentTransactions({ txs, config }) {
  const { isPublic } = useNetworkMode();
  return (
    <Card>
      <CardHeader
        eyebrow="Verified payment history"
        title="Recent activity"
        subtitle="Payments and wallet updates, backed by real receipts."
        action={<LinkButton to="/transactions" size="sm">View history</LinkButton>}
      />
      <CardContent className="pt-3">
        {!txs && <div className="text-[13px] text-slate-500">Loading…</div>}
        {txs?.length === 0 && <div className="text-[13px] text-slate-500">No payments sent yet. Your first confirmed payment will appear here.</div>}
        <ul className="divide-y divide-slate-100">
          {txs?.slice(0, 6).map((t) => {
            const ev = t.events.find(e => e.name === 'TransferExecuted') || t.events[0];
            return (
              <li key={t.txHash} className="flex items-center gap-3.5 py-3">
                <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${t.status === 'FAILED' ? 'bg-blush text-blush-deep' : ev?.name === 'TransferExecuted' ? 'bg-sky text-sky-deep' : 'bg-slate-100 text-slate-700'}`}>
                  <Icon name={t.status === 'FAILED' ? 'error' : EVENT_ICON[ev?.name] || 'receipt_long'} className="text-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold break-words">{ev ? describeEvent(ev, config.tokens) : t.status === 'FAILED' ? 'Payment failed' : 'Payment in progress'}</div>
                  <div className="text-[11.5px] text-slate-500 font-mono truncate">
                    {t.status === 'CONFIRMED' ? 'Confirmed' : t.status === 'FAILED' ? 'Failed' : 'Pending'} · {t.blockTimestamp ? formatTimeAgo(t.blockTimestamp) : 'Time unavailable'}
                    {t.events.length > 1 ? ` · +${t.events.length - 1} event${t.events.length > 2 ? 's' : ''}` : ''}
                  </div>
                </div>
                {t.explorerUrl ? (
                  <a href={t.explorerUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky px-2.5 py-1 text-[11px] font-mono font-semibold text-sky-deep hover:bg-[#c5daee]" title={t.txHash}>
                    View receipt <Icon name="open_in_new" className="text-[13px]" />
                  </a>
                ) : (
                  <span className="shrink-0 rounded-full bg-butter sim-hatch px-2.5 py-1 text-[11px] font-mono font-semibold text-butter-deep" title={`${t.txHash} (local chain, no public explorer)`}>
                    {t.txHash.slice(0, 8)}… {isPublic ? '' : 'local'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------- rail

function KillSwitch({ state, status, demoStatus }) {
  const { isDemo, isOwner, judgeSite } = useApp();
  if (!state) return null;
  const rows = [
    ...(isDemo && demoStatus ? [['Demo payment access', demoStatus.executionEnabled, demoStatus.executionEnabled ? demoStatus.session?.executionAllowed ? 'Enabled for this session' : 'Invite required' : 'Paused by admin']] : []),
    ['Wallet payments', !state.paused, state.paused ? 'Paused' : 'Enabled'],
    ['Payment submitter', state.executorIsOnChainAgent, state.executorIsOnChainAgent ? 'Authorized' : 'Not authorized'],
    ['AI assistant', !state.agentPaused?.paused, state.agentPaused?.paused ? 'Paused' : 'Available'],
    ['Automatic payments', !status?.automation?.paused, status?.automation?.paused ? 'Paused' : judgeSite ? 'Page must stay open' : 'Available'],
  ];
  return (
    <Card tone="blush">
      <CardHeader eyebrow="Emergency" title="Emergency controls" />
      <CardContent className="pt-4 space-y-4">
        <ul className="space-y-2">
          {rows.map(([label, ok, text]) => (
            <li key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-2.5 text-[13px]">
              <span className="font-semibold">{label}</span>
              <span className="inline-flex items-center gap-2 font-mono text-[11.5px]"><Dot ok={ok} />{text}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-blush-deep leading-snug">
          Pause blocks new payments. Emergency stop also removes the AI's permission to submit payments. {isDemo ? 'Only the team admin can stop this shared demo wallet.' : 'Only the wallet owner can change these controls.'}
        </p>
        <LinkButton to="/controls" variant="primary" icon="emergency_home" className="w-full">{isOwner ? 'Manage emergency controls' : 'View safety controls'}</LinkButton>
      </CardContent>
    </Card>
  );
}

function ActivityRail({ log, verify }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        eyebrow="Audit trail"
        title="Activity record integrity"
        badge={verify ? verify.valid ? <Badge variant="success">Verified</Badge> : <Badge variant="error">Broken at #{verify.brokenAt}</Badge> : null}
      />
      <CardContent className="pt-4">
        {!log && <div className="text-[13px] text-slate-500">Loading…</div>}
        <ol className="relative space-y-0.5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
          {log?.slice(0, 9).map((e) => (
            <li key={e.id} className="relative flex gap-3 py-2">
              <span className="relative z-10 w-[31px] h-[31px] shrink-0 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-700">
                <Icon name={auditIcon(e.action)} className="text-[16px]" />
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] font-semibold leading-snug">{humanizeAction(e.action)}</div>
                <div className="text-[11px] text-slate-500 font-mono truncate">
                  {formatTimeAgo(Math.floor(new Date(e.occurredAt).getTime() / 1000))} · {e.actor.startsWith('0x') ? truncateAddress(e.actor) : e.actor} · #{e.hash.slice(0, 8)}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <Link to="/audit" className="mt-3 text-[12.5px] font-semibold inline-flex items-center gap-1 hover:gap-2 transition-all">
          {verify ? `${verify.entries} hash-chained entries` : 'Audit log'} <Icon name="arrow_forward" className="text-[16px]" />
        </Link>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------- page

export function Overview() {
  const { config, isDemo, isOwner } = useApp();
  const wallet = useWalletState(), status = useAgentStatus(), recipients = useRecipients();
  const active = useProposals('AWAITING_APPROVAL,APPROVED,SUBMITTED');
  const txs = useTransactions(), log = useAuditLog(), verify = useAuditVerify(), tasks = useTasks(), policy = usePolicy();
  const demoStatus = usePolling(() => get('/sandbox-status'),15000,[],{enabled:isDemo});
  const state = wallet.data;
  const pending = active.data?.filter(p => p.status==='AWAITING_APPROVAL');
  const completed = txs.data?.filter(t => t.status==='CONFIRMED' && t.events.some(e => e.name==='TransferExecuted'));
  return <div className="space-y-6 sm:space-y-8">
    <PageHeader eyebrow={isDemo ? 'Your demo wallet' : 'Your wallet'} title={<>Your money,<br/><span className="text-tertiary">under your control.</span></>} actions={<LinkButton to="/controls" variant="secondary" icon="shield_lock">Safety controls</LinkButton>}>
      Tell your AI what you need. Review payments, set spending rules, and track everything in one place.
    </PageHeader>
    {wallet.error && <LoadNotice message="We couldn't load your balance." error={wallet.error} retry={wallet.refresh} />}
    <div className="grid xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 items-stretch">
      <TreasuryCard state={state} config={config} />
      <CommandCenter status={status.data} />
    </div>
    <section aria-label="Important payment activity" className="grid sm:grid-cols-2 gap-5">
      <StatTile tone="butter" icon="pending_actions" label="Payments to review" value={pending?.length ?? '—'} hint={pending ? pending.length ? 'Review the details before you approve a payment.' : "You're all caught up. No payments need your approval." : 'Loading payments…'} to="/proposals" action="View payments" />
      <StatTile tone="sky" icon="check_circle" label="Payments completed" value={completed?.length ?? '—'} hint={completed ? 'Confirmed transfers from this wallet. Historical evidence is separate.' : 'Loading confirmed payments…'} to="/transactions" action="View history" />
    </section>
    {(active.error || txs.error) && <LoadNotice message="We couldn't load your recent payments." error={active.error || txs.error} retry={() => {active.refresh();txs.refresh();}} />}
    {pending?.length > 0 && <section aria-labelledby="approvals-heading" className="space-y-4"><h2 id="approvals-heading" className="text-3xl">Ready for your review</h2>{pending.slice(0,2).map(p => <ProposalCard key={p.id} proposal={p} recipientLabel={labelFor(recipients.data,p.recipient)} onChanged={() => {active.refresh();wallet.refresh();}} />)}{pending.length>2 && <LinkButton to="/proposals">View all payments</LinkButton>}</section>}
    <div className="grid lg:grid-cols-2 gap-5">
      <RiskEngine state={state} policy={policy.data} demoStatus={demoStatus.data} />
      <AutonomousOps status={status.data} tasks={tasks.data} recipients={recipients.data} />
    </div>
    <RecentTransactions txs={txs.data} config={config} />
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
      <KillSwitch state={state} status={status.data} demoStatus={demoStatus.data} />
      <details className="technical-details sm:p-6"><summary>Technical details & activity integrity</summary><div className="space-y-4">
        <dl className="text-sm space-y-3"><div><dt className="text-slate-600">Transaction fee balance</dt><dd className="font-semibold">{state?.executorBalanceEth != null ? formatAmount(state.executorBalanceEth,8)+' ETH' : 'Unavailable'}</dd><dd className="text-xs text-slate-600">Pays network fees; separate from the available wallet balance.</dd></div><div><dt className="text-slate-600">Network</dt><dd>{config?.networkName} · {config?.chainId}</dd></div></dl>
        <ActivityRail log={log.data} verify={verify.data} />
        <div className="flex flex-wrap gap-3"><Link to="/portfolio" className="underline font-semibold text-sm">Portfolio</Link><Link to="/audit" className="underline font-semibold text-sm">Activity log</Link><Link to="/security" className="underline font-semibold text-sm">Wallet settings</Link></div>
      </div></details>
    </div>
  </div>;
}

function LoadNotice({ message, error, retry }) {
  return <Alert variant="warning" title={message}><div className="flex flex-wrap gap-3 items-center"><span>The service may be waking up. Try again in a moment.</span><Button size="sm" variant="secondary" onClick={retry}>Try again</Button></div><details className="mt-3 text-xs"><summary className="cursor-pointer">Technical details</summary>{describeError(error)}</details></Alert>;
}
