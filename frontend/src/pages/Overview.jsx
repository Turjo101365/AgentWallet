import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatUnits } from 'ethers';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { LinkButton } from '../components/ui/Button.jsx';
import { ProposalCard } from '../components/proposals/ProposalCard.jsx';
import { StatusBadge } from '../components/proposals/StatusBadge.jsx';
import { useApp } from '../app/providers.jsx';
import {
  useWalletState, useProposals, useRecipients, useAgentStatus, useTransactions, useAuditLog, useAuditVerify, useTasks, usePolicy, usePortfolio, labelFor,
} from '../hooks/useData.js';
import { usePolling } from '../hooks/usePolling.js';
import { get, describeError } from '../lib/api.js';
import { explorerAddress } from '../lib/networks.js';
import { describeEvent, EVENT_ICON, auditIcon } from '../lib/events.js';
import { useNetworkMode } from '../components/layout/NetworkMode.jsx';
import { formatAmount, formatGas, formatTimeAgo, formatDateTime, truncateAddress, percentOf, humanizeAction } from '../utils/formatters.js';

const EXAMPLES = ['Send 0.0001 ETH to my approved recipient.', 'Show my portfolio and recent spending.', 'Stop all automated payments.'];

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function Dot({ ok }) {
  return <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-mint-deep' : 'bg-blush-deep'}`} />;
}

const units = (value, decimals) => (value === undefined || value === null ? null : formatUnits(value, decimals));

// ---------------------------------------------------------------------------------------- treasury

function TreasuryCard({ state, config }) {
  const { isPublic } = useNetworkMode();
  if (!state) return <Card tone="mint" className="min-h-[300px] animate-pulse" />;
  const [main, ...rest] = state.tokens;
  const contractLink = explorerAddress(config, config.contractAddress);
  return (
    <Card tone="mint" className="relative overflow-hidden flex flex-col">
      <CardHeader
        eyebrow={`Contract treasury · block ${state.blockNumber}`}
        title="Balance"
        badge={state.paused ? <Badge variant="error">Contract paused</Badge> : <Badge variant="success" pulse>Contract active</Badge>}
      />
      <CardContent className="pt-3 flex-1 flex flex-col justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="numeral text-[56px] sm:text-[72px] text-ink">{formatAmount(main.formatted.balance, 6)}</span>
            <span className="font-display text-2xl text-mint-deep">{main.symbol}</span>
          </div>
          <div className="mt-2 text-[13px] text-mint-deep/90">
            Read on-chain from the contract{isPublic ? '' : ' on the local simulation chain'}. No price feed is assumed.
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
                {truncateAddress(config.contractAddress, 8, 6)} ↗
              </a>
            ) : (
              <>{truncateAddress(config.contractAddress, 8, 6)} · local, no explorer</>
            )}
          </span>
          <Link to="/treasury" className="font-semibold text-ink inline-flex items-center gap-1 hover:gap-2 transition-all">
            Deposit or withdraw <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ tone, icon, label, value, hint, to }) {
  const inner = (
    <Card tone={tone} className="h-full p-5 flex flex-col justify-between gap-5 group hover:-translate-y-0.5 transition-transform">
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-full bg-white/60 flex items-center justify-center"><Icon name={icon} className="text-[19px]" /></span>
        <Icon name="arrow_outward" className="text-[18px] opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
      <div>
        <div className="numeral text-[40px] text-ink">{value}</div>
        <div className="text-[13px] font-bold mt-1.5">{label}</div>
        {hint && <div className="text-[12px] opacity-70 mt-0.5 leading-snug">{hint}</div>}
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block rounded-4xl">{inner}</Link> : inner;
}

// ---------------------------------------------------------------------------------------- AI command center

function CommandCenter({ status }) {
  const { isOwner } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const conversations = usePolling(() => get('/agent/conversations'), 20000, [], { enabled: isOwner });
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
        eyebrow="AI command center"
        title="Tell the agent what to do"
        badge={
          llm ? (
            llm.available ? <Badge variant="dark" pulse>{llm.provider} · {llm.model}</Badge> : <Badge variant="error">Model unavailable</Badge>
          ) : null
        }
      />
      <CardContent className="pt-4 space-y-5 relative">
        <form onSubmit={open} className="flex items-center gap-2 rounded-full bg-white/[0.07] ring-1 ring-white/10 focus-within:ring-white/40 pl-5 pr-1.5 py-1.5 transition">
          <Icon name="auto_awesome" className="text-[20px] text-[#9fdcb8]" />
          <input
            aria-label="Instruction for the agent"
            className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/45 text-[15px] focus:outline-none py-2"
            placeholder="e.g. pay my supplier 0.002 ETH every Monday"
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="h-10 px-4 rounded-full bg-white text-ink text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-mint transition-colors">
            Open in agent <Icon name="arrow_forward" className="text-[18px]" />
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
            ['edit_note', 'Plans and drafts', 'Calls typed tools; never holds a key'],
            ['draw', 'You authorize', 'EIP-712 signature or a bounded task grant'],
            ['gpp_good', 'Contract enforces', 'Allowlist, per-tx and daily caps'],
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

function RiskEngine({ state, policy, proposals, recipients }) {
  if (!state) return <Card className="min-h-[320px] animate-pulse" />;
  const decisions = (proposals || []).slice(0, 5);
  return (
    <Card className="flex flex-col">
      <CardHeader eyebrow="Risk engine" title="Limits & decisions" action={<LinkButton to="/controls" size="sm" icon="tune">Adjust</LinkButton>} />
      <CardContent className="pt-4 space-y-6 flex-1">
        {state.tokens.filter((t) => t.enabled).map((t) => {
          const used = percentOf(t.formatted.spentToday, t.formatted.dailyLimit);
          const auto = units(policy?.autoApprovalMaxPerTx?.[t.address], t.decimals);
          const floor = units(policy?.reserveFloors?.[t.address], t.decimals);
          return (
            <div key={t.address} className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-[14px]">{t.symbol} daily allowance</span>
                <span className="font-mono text-[12px] text-slate-600">
                  {formatAmount(t.formatted.spentToday)} / {formatAmount(t.formatted.dailyLimit)} used
                </span>
              </div>
              <Meter pct={used} />
              <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-slate-500">Per-tx cap</div><div className="font-mono font-semibold text-ink">{formatAmount(t.formatted.perTxLimit)}</div></div>
                <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-slate-500">Auto-approve ≤</div><div className="font-mono font-semibold text-ink">{auto ? formatAmount(auto) : 'off'}</div></div>
                <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-slate-500">Reserve floor</div><div className="font-mono font-semibold text-ink">{floor ? formatAmount(floor) : 'none'}</div></div>
              </div>
            </div>
          );
        })}
        <div className="text-[11.5px] text-slate-500 -mt-2">
          Caps are enforced by the contract; auto-approval, reserves and the circuit breaker
          {policy ? ` (${policy.circuitBreaker.maxConsecutiveFailures} consecutive failures)` : ''} by the backend policy engine. Daily caps reset 00:00 UTC.
        </div>
        <div>
          <div className="eyebrow text-slate-500 mb-2.5">Recent policy decisions</div>
          {decisions.length === 0 && <div className="text-[13px] text-slate-500">No transfer has been evaluated yet.</div>}
          <ul className="space-y-1.5">
            {decisions.map((p) => {
              const failed = p.policyResult?.violations?.map((v) => v.id || v.check).filter(Boolean) || [];
              const passed = p.policyResult?.passed;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50 transition-colors">
                  <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${passed === false ? 'bg-blush text-blush-deep' : 'bg-mint text-mint-deep'}`}>
                    <Icon name={passed === false ? 'block' : 'check'} className="text-[16px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">
                      {formatAmount(p.amountFormatted, 6)} {p.token.symbol} → {labelFor(recipients, p.recipient) || truncateAddress(p.recipient)}
                    </div>
                    <div className="text-[11.5px] text-slate-500 truncate font-mono">
                      {passed === false ? `failed: ${failed.join(', ') || 'policy'}` : `${p.policyResult?.checks?.length ?? 0} checks passed`} · {p.source}
                    </div>
                  </div>
                  <span className="hidden sm:inline"><StatusBadge status={p.status} /></span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------- autonomy

const TASK_TONE = { ACTIVE: 'success', PENDING_AUTHORIZATION: 'warning', PAUSED: 'warning', FAILED: 'error' };

function AutonomousOps({ status, tasks, recipients }) {
  const automationPaused = status?.automation?.paused;
  const list = (tasks || []).filter((t) => ['ACTIVE', 'PENDING_AUTHORIZATION', 'PAUSED'].includes(t.status));
  const done = (tasks || []).filter((t) => !['ACTIVE', 'PENDING_AUTHORIZATION', 'PAUSED'].includes(t.status));
  const lastTick = status?.scheduler?.lastTickAt;
  return (
    <Card tone="lilac" className="flex flex-col">
      <CardHeader
        eyebrow="Autonomous operations"
        title="Signed task grants"
        badge={status ? automationPaused ? <Badge variant="error">Automation paused</Badge> : <Badge variant="success" pulse>Scheduler on</Badge> : null}
      />
      <CardContent className="pt-4 space-y-4 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Live grants', list.filter((t) => t.status === 'ACTIVE').length],
            ['Awaiting grant', list.filter((t) => t.status === 'PENDING_AUTHORIZATION').length],
            ['Finished', done.length],
          ].map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-white/55 px-3 py-2.5">
              <div className="numeral text-[30px]">{n}</div>
              <div className="text-[11.5px] font-semibold text-lilac-deep mt-1">{label}</div>
            </div>
          ))}
        </div>
        <ul className="space-y-2 flex-1">
          {[...list, ...done].slice(0, 4).map((t) => (
            <li key={t.id} className="rounded-2xl bg-white/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[13.5px] truncate">{t.title}</span>
                <Badge variant={TASK_TONE[t.status] || 'neutral'}>{t.status === 'PENDING_AUTHORIZATION' ? 'needs grant' : t.status.toLowerCase()}</Badge>
              </div>
              <div className="text-[12px] text-slate-600 font-mono mt-1 truncate">
                {t.amountFormatted} {t.token.symbol} → {labelFor(recipients, t.recipient) || truncateAddress(t.recipient)} · {t.scheduleDescription}
              </div>
              <div className="text-[11.5px] text-slate-500 mt-0.5">
                Runs {t.runsCount}{t.maxRuns ? `/${t.maxRuns}` : ''} · next {t.nextRunAt ? formatDateTime(t.nextRunAt) : '—'}
              </div>
            </li>
          ))}
          {list.length + done.length === 0 && (
            <li className="rounded-2xl bg-white/50 px-4 py-4 text-[13px] text-lilac-deep">
              No grants yet. Ask the agent to schedule a payment, then sign its bounded grant; runs within your auto-approval limit execute with no further signature.
            </li>
          )}
        </ul>
        <div className="flex items-center justify-between text-[12px] text-lilac-deep">
          <span>{lastTick ? `Scheduler tick ${formatTimeAgo(Math.floor(lastTick / 1000))}` : 'Scheduler has not ticked yet'}</span>
          <Link to="/automation" className="font-semibold text-ink inline-flex items-center gap-1 hover:gap-2 transition-all">Automation <Icon name="arrow_forward" className="text-[16px]" /></Link>
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
        eyebrow="Verified history"
        title="Transactions"
        subtitle="From mined receipts and contract events only."
        action={<LinkButton to="/transactions" size="sm">All</LinkButton>}
      />
      <CardContent className="pt-3">
        {!txs && <div className="text-[13px] text-slate-500">Loading…</div>}
        {txs?.length === 0 && <div className="text-[13px] text-slate-500">No transactions yet.</div>}
        <ul className="divide-y divide-slate-100">
          {txs?.slice(0, 6).map((t) => {
            const ev = t.events[0];
            return (
              <li key={t.txHash} className="flex items-center gap-3.5 py-3">
                <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${t.status === 'FAILED' ? 'bg-blush text-blush-deep' : ev?.name === 'TransferExecuted' ? 'bg-sky text-sky-deep' : 'bg-slate-100 text-slate-700'}`}>
                  <Icon name={t.status === 'FAILED' ? 'error' : EVENT_ICON[ev?.name] || 'receipt_long'} className="text-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">{ev ? describeEvent(ev, config.tokens) : t.execution?.errorCode || 'Transaction'}</div>
                  <div className="text-[11.5px] text-slate-500 font-mono truncate">
                    block {t.blockNumber ?? 'pending'} · {t.blockTimestamp ? formatTimeAgo(t.blockTimestamp) : '—'}
                    {t.events.length > 1 ? ` · +${t.events.length - 1} event${t.events.length > 2 ? 's' : ''}` : ''}
                  </div>
                </div>
                {t.explorerUrl ? (
                  <a href={t.explorerUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky px-2.5 py-1 text-[11px] font-mono font-semibold text-sky-deep hover:bg-[#c5daee]" title={t.txHash}>
                    {t.txHash.slice(0, 8)}… <Icon name="open_in_new" className="text-[13px]" />
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

function KillSwitch({ state, status }) {
  if (!state) return null;
  const rows = [
    ['Contract', !state.paused, state.paused ? 'Paused on-chain' : 'Active'],
    ['Agent key', state.executorIsOnChainAgent, state.executorIsOnChainAgent ? 'Authorized executor' : 'Not the on-chain agent'],
    ['Off-chain agent', !state.agentPaused?.paused, state.agentPaused?.paused ? 'Paused' : 'Active'],
    ['Automation', !status?.automation?.paused, status?.automation?.paused ? 'Paused' : 'On'],
  ];
  return (
    <Card tone="blush">
      <CardHeader eyebrow="Emergency" title="Kill switches" />
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
          Pause stops every transfer at the contract. Emergency stop also revokes the agent key in the same transaction. Both are owner-signed in your wallet.
        </p>
        <LinkButton to="/controls" variant="primary" icon="emergency_home" className="w-full">Open emergency controls</LinkButton>
      </CardContent>
    </Card>
  );
}

function ActivityRail({ log, verify }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        eyebrow="Audit trail"
        title="Live activity"
        badge={verify ? verify.valid ? <Badge variant="success">Chain valid</Badge> : <Badge variant="error">Broken at #{verify.brokenAt}</Badge> : null}
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
  const { config } = useApp();
  const wallet = useWalletState();
  const status = useAgentStatus();
  const recipients = useRecipients();
  const active = useProposals('AWAITING_APPROVAL,APPROVED,SUBMITTED');
  const recent = useProposals(null, 8000);
  const txs = useTransactions();
  const log = useAuditLog();
  const verify = useAuditVerify();
  const tasks = useTasks();
  const policy = usePolicy();
  const portfolio = usePortfolio();
  const s = wallet.data;
  const transfers = txs.data?.filter((t) => t.events.some((e) => e.name === 'TransferExecuted')).length;
  const runway = portfolio.data?.exposure?.executorTxRunway;
  const runwayText = runway === undefined || runway === null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(runway);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Treasury command${s ? ` · ${config.networkName} · block ${s.blockNumber}` : ''}`}
        title={<>Treasury, <span className="text-tertiary">on policy.</span></>}
        actions={
          <>
            <LinkButton to="/agent" variant="primary" icon="smart_toy">Ask the agent</LinkButton>
            <LinkButton to="/proposals" icon="add">New proposal</LinkButton>
          </>
        }
      >
        An AI agent drafts and schedules payments. You authorize them with a signature, and the smart contract enforces the allowlist and spending caps on every transfer.
      </PageHeader>

      {wallet.error && <Alert variant="error" title="Wallet state unavailable">{describeError(wallet.error)}</Alert>}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5 min-w-0">
          <div className="grid md:grid-cols-2 gap-5">
            <TreasuryCard state={s} config={config} />
            <div className="grid grid-cols-2 gap-5">
              <StatTile tone="butter" icon="pending_actions" label="Awaiting approval" value={status.data?.pendingApprovals ?? '—'} hint="Need your EIP-712 signature" to="/proposals" />
              <StatTile tone="sky" icon="north_east" label="Agent transfers" value={transfers ?? '—'} hint="Confirmed, from receipts" to="/transactions" />
              <StatTile tone="lilac" icon="verified" label="Audit chain" value={verify.data ? (verify.data.valid ? 'Valid' : 'Broken') : '—'} hint={verify.data ? `${verify.data.entries} hash-linked entries` : 'Verifying…'} to="/audit" />
              <StatTile
                tone="white"
                icon="local_gas_station"
                label="Gas runway"
                value={runwayText}
                hint={s ? `transfers · ${s.executorBalanceEth === null ? '—' : `${formatAmount(s.executorBalanceEth, 5)} ETH`} at ${formatGas(s.gasPriceGwei)}` : ''}
                to="/portfolio"
              />
            </div>
          </div>

          <CommandCenter status={status.data} />

          <div className="grid lg:grid-cols-2 gap-5">
            <RiskEngine state={s} policy={policy.data} proposals={recent.data} recipients={recipients.data} />
            <AutonomousOps status={status.data} tasks={tasks.data} recipients={recipients.data} />
          </div>

          <section aria-labelledby="approvals-heading" className="space-y-4">
            <div className="flex items-end justify-between gap-3 pt-2">
              <div>
                <div className="eyebrow text-slate-500 mb-1.5">Owner authorization</div>
                <h2 id="approvals-heading" className="text-[34px] sm:text-[40px] leading-none">Needs attention</h2>
              </div>
              <Link to="/proposals" className="text-[13px] font-semibold inline-flex items-center gap-1 hover:gap-2 transition-all">
                All proposals <Icon name="arrow_forward" className="text-[16px]" />
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
              <Card tone="canvas" className="p-7 flex flex-wrap items-center gap-4 shadow-none ring-1 ring-inset ring-slate-200">
                <span className="w-11 h-11 rounded-full bg-mint text-mint-deep flex items-center justify-center"><Icon name="done_all" /></span>
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold">Nothing is awaiting approval or executing.</div>
                  <div className="text-[13px] text-slate-500">Create a transfer intent on the Proposals page, or ask the agent to draft one.</div>
                </div>
              </Card>
            )}
          </section>

          <RecentTransactions txs={txs.data} config={config} />
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 self-start min-w-0">
          <KillSwitch state={s} status={status.data} />
          <ActivityRail log={log.data} verify={verify.data} />
        </aside>
      </div>
    </div>
  );
}
