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

/**
 * One transfer proposal. Approval = an EIP-712 signature over exactly this proposal (id, intent,
 * token, recipient, amount, deadline) sent with a stable Idempotency-Key. Status shown is always
 * the backend's, which only becomes CONFIRMED after a verified receipt.
 */
export function ProposalCard({ proposal, recipientLabel, onChanged, compact = false }) {
  const { config, isOwner, getSigner } = useApp();
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
              <span className="text-[11px] font-mono text-slate-500">#{proposal.id.slice(0, 8)} · {proposal.source}</span>
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

        {!compact && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="eyebrow text-slate-500 mb-2.5">Policy checks (block {proposal.policyResult?.blockNumber ?? '—'})</div>
              <PolicyChecks result={proposal.policyResult} />
            </div>
            <div className="space-y-2 text-xs rounded-3xl bg-slate-50 p-4">
              <div className="eyebrow text-slate-500">Pre-flight simulation</div>
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
        )}

        {exec && (
          <div className={`text-xs rounded-2xl p-3.5 space-y-1 font-mono ${exec.status === 'CONFIRMED' ? 'bg-mint-soft text-mint-deep' : exec.status === 'FAILED' ? 'bg-blush-soft text-blush-deep' : 'bg-slate-50 text-slate-700'}`}>
            <div>Execution: {exec.status}{exec.errorCode ? ` — ${exec.errorCode}: ${exec.errorMessage}` : ''}</div>
            {exec.txHash && (
              <div className="break-all">
                Tx: {txLink ? <a className="underline" href={txLink} target="_blank" rel="noreferrer">{exec.txHash}</a> : exec.txHash}
              </div>
            )}
            {exec.blockNumber && <div>Block {exec.blockNumber} · gas used {exec.gasUsed}</div>}
          </div>
        )}

        {proposal.status === 'POLICY_REJECTED' && proposal.policyResult?.violations?.length > 0 && (
          <Alert variant="error" title="Blocked by policy">{proposal.policyResult.violations.map((v) => v.message).join(' · ')}</Alert>
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

        {error && <Alert variant="error">{describeError(error)}</Alert>}

        {awaiting && !expired && (
          <div className="text-xs text-slate-600" data-testid="signed-deadline">
            Execution deadline (signed): <span className="font-mono">{formatDateTime(proposal.expiresAt)}</span>. Your signature authorizes this
            exact transfer only until then; if it has not executed by that time it fails and is never extended.
          </div>
        )}

        {awaiting && !expired && (
          <div className="flex flex-wrap gap-2 justify-end items-center pt-1">
            {!isOwner && <span className="text-xs text-slate-500 self-center">Only the contract owner can approve.</span>}
            <Button variant="secondary" onClick={reject} disabled={!isOwner || Boolean(working)}>
              {working === 'reject' ? 'Rejecting…' : 'Reject'}
            </Button>
            <Button onClick={approve} disabled={!isOwner || Boolean(working) || !proposal.approvalTypedData} icon="draw">
              {working === 'approve' ? 'Sign in wallet…' : 'Approve & sign'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
