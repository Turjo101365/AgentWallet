import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Alert } from '../ui/Alert.jsx';
import { StatusBadge } from './StatusBadge.jsx';
import { PolicyChecks } from './PolicyChecks.jsx';
import { useApp } from '../../app/providers.jsx';
import { post, describeError } from '../../lib/api.js';
import { approvalKey } from '../../lib/idempotency.js';
import { explorerTx } from '../../lib/networks.js';
import { formatAmount, truncateAddress, formatDateTime } from '../../utils/formatters.js';

function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, (expiresAt || 0) - now);
}

function Tag({ kind }) {
  const style = { LIVE: 'bg-mint text-mint-deep', SIMULATED: 'bg-butter text-butter-deep', HISTORICAL: 'bg-slate-200 text-slate-700' }[kind];
  return <span className={`inline-block text-[10px] font-mono font-bold tracking-wider rounded-full px-2 py-0.5 ${style}`}>{kind}</span>;
}

/** Verified receipt as read back from the chain after a demo confirmation. */
function Receipt({ receipt }) {
  return (
    <div className="rounded-2xl bg-mint-soft text-mint-deep p-3.5 text-xs font-mono space-y-0.5" data-testid="demo-receipt">
      <div className="font-bold font-sans text-base flex items-center gap-2"><Tag kind="LIVE" /> {receipt.status === 1 ? 'Payment confirmed' : 'Payment failed'}</div>
      <p className="font-sans text-sm">{receipt.status === 1 ? 'Verified on Ethereum Sepolia. This payment uses test ETH.' : 'The transaction reverted. Do not treat it as a completed payment.'}</p>
      <a className="inline-block font-sans font-semibold underline py-1" href={receipt.explorerUrl} target="_blank" rel="noreferrer">View verified Sepolia receipt ↗</a>
      <details><summary className="cursor-pointer py-1">Receipt details</summary><div>Status {receipt.status} · block {receipt.blockNumber} · gas used {receipt.gasUsed}</div><div className="break-all">{receipt.txHash}</div><div className="break-all">From {receipt.from} → contract {receipt.to}</div></details>
    </div>
  );
}

/**
 * Demo wallet: the judge confirms this exact payment; the server's sandbox demo owner key then signs the EIP-712
 * approval. The wording never suggests the judge's own wallet signed.
 */
function DemoConfirm({ proposal, onDone }) {
  const { demo } = useApp();
  const [checked, setChecked] = useState(false);
  const [reviewing, setReviewing] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const mine = proposal.demo?.mine;
  const allowed = demo?.executionAllowed;

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      onDone(await post(`/proposals/${proposal.id}/confirm`, { confirm: true, recipient: proposal.recipient, amountWei: proposal.amountWei }));
    } catch (err) {
      setError(err);
      onDone(null);
    } finally {
      setWorking(false);
    }
  }

  if (!mine) return <div className="text-xs text-slate-500">Drafted by another demo session; only that session can confirm it.</div>;
  if (!allowed) return <Alert variant="warning" title="You're exploring — no payment will be sent">Ask the team for a live-demo invite. Choose “Switch role or wallet” and enter it to start an authorized session, then ask AI to prepare your payment there. This payment stays in its original session.</Alert>;
  if (!reviewing) return <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Payment still pending. You can review it later.</span><Button variant="secondary" onClick={() => setReviewing(true)}>Review payment</Button></div>;
  return (
    <div className="rounded-3xl bg-slate-50 p-4 space-y-3">
      <label className="flex items-start gap-3 text-[13.5px] text-ink cursor-pointer">
        <input type="checkbox" className="mt-1 w-4 h-4" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="demo-confirm-checkbox" />
        <span>
          I confirm this <strong>{proposal.amountFormatted} {proposal.token.symbol}</strong> payment on Sepolia using shared demo funds. The backend-controlled demo wallet signs after my confirmation; my personal wallet does not sign.
        </span>
      </label>
      {error && <Alert variant="error">{describeError(error)}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={working} onClick={() => { setChecked(false); setReviewing(false); }}>Cancel</Button>
        <Button onClick={confirm} disabled={!checked || working} icon="verified_user">{working ? 'Sending — waiting for a receipt…' : 'Confirm demo payment'}</Button>
      </div>
    </div>
  );
}

/**
 * One transfer proposal. Approval = an EIP-712 signature over exactly this proposal (id, intent,
 * token, recipient, amount, deadline) sent with a stable Idempotency-Key. Status shown is always
 * the backend's, which only becomes CONFIRMED after a verified receipt.
 */
export function ProposalCard({ proposal: initial, recipientLabel, onChanged, compact = false }) {
  const { config, isOwner, getSigner, isDemo } = useApp();
  const [demoResult, setDemoResult] = useState(null);
  const proposal = demoResult && demoResult.id === initial.id && initial.status === 'AWAITING_APPROVAL' ? demoResult : initial;
  const [working, setWorking] = useState(null);
  const [error, setError] = useState(null);
  const remaining = useCountdown(proposal.expiresAt);
  const awaiting = proposal.status === 'AWAITING_APPROVAL';
  const expired = awaiting && remaining === 0;
  const exec = proposal.execution;
  const txLink = explorerTx(config, exec?.txHash);

  async function approve() {
    setWorking('approve');
    setError(null);
    try {
      const signer = await getSigner();
      const { domain, types, message } = proposal.approvalTypedData;
      const signature = await signer.signTypedData(domain, types, message);
      await post(`/proposals/${proposal.id}/approve`, { signature }, { headers: { 'Idempotency-Key': approvalKey(proposal.id) } });
      onChanged?.();
    } catch (err) {
      setError(err);
      onChanged?.();
    } finally {
      setWorking(null);
    }
  }

  async function reject() {
    setWorking('reject');
    setError(null);
    try {
      await post(`/proposals/${proposal.id}/reject`, { reason: 'Rejected by operator in console' });
      onChanged?.();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(null);
    }
  }

  const sim = proposal.simulation;
  return (
    <Card highlight={awaiting && !expired}>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={expired ? 'EXPIRED' : proposal.status} />
              <span className="text-xs text-slate-500">{isDemo ? 'Demo wallet' : 'Personal wallet'}</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="numeral text-[40px] text-ink">{formatAmount(proposal.amountFormatted, proposal.token.decimals)}</span>
              <span className="font-display text-xl text-slate-600">{proposal.token.symbol}</span>
            </div>
            <div className="text-[13px] text-slate-500 mt-1">
              to <span className="font-mono text-slate-700" title={proposal.recipient}>{truncateAddress(proposal.recipient, 10, 6)}</span>
              {recipientLabel ? <span className="ml-1">({recipientLabel})</span> : null}
            </div>
            {proposal.memo && <div className="text-[13px] text-slate-600 mt-1 italic">“{proposal.memo}”</div>}
          </div>
          {awaiting && (
            <div className={`text-right text-xs font-mono rounded-full px-3 py-1.5 ${expired ? 'bg-slate-100 text-slate-600' : 'bg-butter text-butter-deep'}`}>
              <div>{expired ? 'Signed deadline passed' : `Deadline in ${Math.floor(remaining / 60)}m ${String(remaining % 60).padStart(2, '0')}s`}</div>
            </div>
          )}
        </div>

        {awaiting && !expired && <section aria-label="Payment review" className="rounded-3xl bg-slate-50 p-4 sm:p-5 space-y-4">
          <h3 className="text-xl">Review your payment</h3>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-slate-600">Amount</dt><dd className="font-semibold text-lg">{proposal.amountFormatted} {proposal.token.symbol}</dd></div>
            <div><dt className="text-slate-600">Network</dt><dd className="font-semibold">{config.networkName}{config.isPublicNetwork ? ' · test funds only' : ' · local simulation'}</dd></div>
            <div className="sm:col-span-2 min-w-0"><dt className="text-slate-600">Recipient{recipientLabel ? ` · ${recipientLabel}` : ''}</dt><dd className="font-mono text-xs sm:text-sm break-all mt-1 select-all">{proposal.recipient}</dd></div>
            <div><dt className="text-slate-600">Estimated maximum network fee</dt><dd className="font-semibold">{sim?.maxNetworkFeeEth != null ? Number(sim.maxNetworkFeeEth)>0 && Number(sim.maxNetworkFeeEth)<0.00000001 ? '<0.00000001 ETH' : `${formatAmount(sim.maxNetworkFeeEth,8)} ETH` : 'Unavailable — checked again before sending'}</dd><dd className="text-xs text-slate-600">Paid from the separate {isDemo ? 'demo' : 'relay'} fee balance. Final fees may differ.</dd></div>
            <div><dt className="text-slate-600">Security check</dt><dd className="font-semibold">{proposal.policyResult?.passed === true && sim?.success ? 'Passed · ready for your approval' : 'Review the check results below'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-600">How this is authorized</dt><dd>{isDemo ? 'Shared demo funds. After you confirm, the backend-controlled demo wallet signs this exact payment. Your personal wallet does not sign.' : 'Your wallet asks you to sign approval for this exact payment. Your private key stays in your wallet.'}</dd></div>
          </dl>
          <p className="text-sm text-slate-600">After confirmation, follow the payment status. It is complete only when a verified receipt appears.</p>
        </section>}

        {!compact && (
          <details className="technical-details">
          <summary>Technical details · security checks & authorization</summary>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="eyebrow text-slate-500 mb-2.5">Security checks (block {proposal.policyResult?.blockNumber ?? '—'})</div>
              <PolicyChecks result={proposal.policyResult} />
            </div>
            <div className="space-y-2 text-xs rounded-3xl bg-slate-50 p-4">
              <div className="eyebrow text-slate-500 flex items-center gap-2">Pre-flight simulation <Tag kind="SIMULATED" /></div>
              {sim?.success ? (
                <div className="font-mono text-slate-700 space-y-0.5">
                  <div>{sim.gasBasis === 'pre-signature' ? 'Full dry run before signing (simulateTransfer): succeeded' : `Static call${sim.method ? ` (${sim.method})` : ''}: succeeded`}</div>
                  <div>Gas estimate: {sim.gasEstimate}{sim.gasBasis === 'pre-signature' ? ' (before signing; re-estimated exactly at execution)' : ''}</div>
                  <div>Max network fee: {formatAmount(sim.maxNetworkFeeEth, 8)} ETH (paid by the agent key)</div>
                </div>
              ) : sim ? (
                <div className="text-rose-700 font-mono">Reverted: {sim.error?.name} {sim.error?.args?.join(', ')}</div>
              ) : (
                <div className="text-slate-500">Not simulated (policy failed first)</div>
              )}
              <div className="eyebrow text-slate-500 pt-2">On-chain intent id</div>
              <div className="font-mono break-all text-slate-600">{proposal.intentId}</div>
            </div>
          </div>
          <p className="text-xs font-mono text-slate-500 mt-3">Payment #{proposal.id} · source {proposal.source} · {proposal.approvalKind === 'TASK_GRANT' ? 'Bounded task grant' : 'EIP-712 authorization'}</p>
          </details>
        )}

        {exec && (
          <div className={`text-xs rounded-2xl p-3.5 space-y-1 font-mono ${exec.status === 'CONFIRMED' ? 'bg-mint-soft text-mint-deep' : exec.status === 'FAILED' ? 'bg-blush-soft text-blush-deep' : 'bg-slate-50 text-slate-700'}`}>
            <div className="font-sans text-sm font-semibold">{config?.isPublicNetwork && <><Tag kind="LIVE" />{' '}</>}{exec.status === 'CONFIRMED' ? 'Payment confirmed — receipt verified' : exec.status === 'FAILED' ? 'Payment failed — no confirmed payment' : 'Payment in progress — waiting for confirmation'}</div>
            {exec.txHash && (
              <div className="break-all">
                {txLink ? <a className="underline font-sans font-semibold" title={exec.txHash} href={txLink} target="_blank" rel="noreferrer">{exec.status === 'CONFIRMED' ? 'View verified receipt ↗' : 'Track transaction ↗'}</a> : exec.txHash}
              </div>
            )}
            <details><summary className="cursor-pointer mt-2">Transaction details</summary><div className="break-all">{exec.txHash}</div>{exec.blockNumber && <div>Block {exec.blockNumber} · gas used {exec.gasUsed}</div>}{exec.errorCode && <div>{exec.errorCode}: {exec.errorMessage}</div>}</details>
          </div>
        )}

        {proposal.status === 'POLICY_REJECTED' && proposal.policyResult?.violations?.length > 0 && (
          <Alert variant="error" title="Payment blocked by a safety rule">{proposal.policyResult.violations.map((v) => v.message).join(' · ')}</Alert>
        )}
        {proposal.resolutionReason && !['POLICY_REJECTED'].includes(proposal.status) && (
          <div className="text-xs text-slate-500">Reason: {proposal.resolutionReason}</div>
        )}
        {proposal.explanation?.headline && proposal.status !== 'POLICY_REJECTED' && <div className="text-xs text-slate-600">{proposal.explanation.headline}</div>}
        {proposal.approvedBy && (
          <div className="text-xs text-slate-500">
            {proposal.approvalKind === 'TASK_GRANT' ? `Approved by signed task grant (${proposal.approvedBy})` : `Approved by ${truncateAddress(proposal.approvedBy)}`} at {formatDateTime(proposal.approvedAt)}
          </div>
        )}
        {isDemo && proposal.demo?.authorization && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Demo signature details</summary><div data-testid="demo-authorization-label">{proposal.demo.authorization.label}</div></details>}
        {demoResult?.receipt && demoResult.id === proposal.id && <Receipt receipt={demoResult.receipt} />}
        {demoResult?.pending && demoResult.id === proposal.id && <Alert>Submitted; still waiting for the Sepolia receipt. This page refreshes the status.</Alert>}

        {error && <Alert variant="error">{describeError(error)}</Alert>}

        {awaiting && !expired && (
          <div className="text-xs text-slate-600" data-testid="signed-deadline">
            Approval expires <span className="font-mono">{formatDateTime(proposal.expiresAt)}</span>. This payment cannot execute after that deadline.
            <details className="mt-1"><summary className="cursor-pointer">Signed deadline details</summary>Execution deadline (signed): {formatDateTime(proposal.expiresAt)}. The signed deadline is never extended.</details>
          </div>
        )}

        {isDemo && awaiting && !expired && <DemoConfirm proposal={proposal} onDone={(r) => { if (r) setDemoResult(r); onChanged?.(); }} />}

        {!isDemo && awaiting && !expired && (
          <div className="flex flex-wrap gap-2 justify-end items-center pt-1">
            {!isOwner && <span className="text-xs text-slate-500 self-center">Only the contract owner can approve.</span>}
            <Button variant="secondary" onClick={reject} disabled={!isOwner || Boolean(working)}>
              {working === 'reject' ? 'Declining…' : 'Decline payment'}
            </Button>
            <Button onClick={approve} disabled={!isOwner || Boolean(working) || !proposal.approvalTypedData} icon="draw">
              {working === 'approve' ? 'Confirm in your wallet…' : 'Confirm in wallet'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
