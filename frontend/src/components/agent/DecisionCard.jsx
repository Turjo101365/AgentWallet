import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { truncateAddress, formatEth } from '../../utils/formatters.js';

export function DecisionCard({
  proposal,
  onApprove,
  onReject,
  isProcessing = false,
}) {
  const [timeLeft, setTimeLeft] = useState(180);

  useEffect(() => {
    if (!proposal?.authorization?.expiresAt) return;
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, proposal.authorization.expiresAt - now);
      setTimeLeft(remaining);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [proposal]);

  const formatCountdown = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  if (!proposal) {
    return (
      <Card className="p-8 text-center bg-slate-50/50">
        <span className="material-symbols-outlined text-4xl text-slate-300">task_alt</span>
        <h4 className="text-sm font-semibold text-slate-700 mt-2">No Pending Proposals</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          The autonomous agent has not identified any required liquidity rebalance or payment operations.
        </p>
      </Card>
    );
  }

  const { proposedParameters, agentType, confidenceScore, rationale, reasoning, decisionId, proposedAction } = proposal;
  const targetAddress = proposedParameters?.recipient || '0x0000000000000000000000000000000000000000';
  const amountEth = proposedParameters?.amountEth || 0.0;
  const actionName = proposedAction || 'PROPOSED_TRANSACTION';

  return (
    <Card className="border-emerald-300 shadow-md ring-1 ring-emerald-100 overflow-hidden">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white p-4 sm:p-5 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-2xl">call_merge</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200">
                Policy Gate Triggered
              </span>
              <span className="text-xs font-mono text-slate-400">ID: {decisionId ? decisionId.slice(0, 8) : 'Awaiting'}</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mt-1">
              Pending Authorization: {actionName}
            </h3>
          </div>
        </div>

        {/* TTL Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-mono font-medium shadow-sm">
          <span className="material-symbols-outlined text-sm text-amber-600">hourglass_top</span>
          <span>TTL: {formatCountdown(timeLeft)}</span>
        </div>
      </div>

      <CardContent className="space-y-5">
        {/* Intent & Target Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 bg-slate-50/80 rounded-lg border border-slate-200/60">
            <div className="text-[11px] font-mono uppercase text-slate-400 font-semibold">Autonomous Intent</div>
            <div className="text-sm font-semibold text-slate-800 mt-1">
              {actionName === 'HOLD'
                ? 'Hold Treasury Assets (No on-chain transfer)'
                : `Execute payment of ${formatEth(amountEth, 4)} ETH on Base Sepolia`}
            </div>
            <div className="text-[11px] font-mono text-emerald-700 mt-1 flex items-center gap-1">
              <span>Agent: {agentType || 'RL Agent'}</span>
              <span className="text-slate-400">• Chain ID: 84532</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50/80 rounded-lg border border-slate-200/60">
            <div className="text-[11px] font-mono uppercase text-slate-400 font-semibold">Target Recipient Address</div>
            <div className="text-xs font-mono font-semibold text-slate-800 mt-1.5 flex items-center justify-between">
              <span>{truncateAddress(targetAddress, 14, 8)}</span>
              {targetAddress !== '0x0000000000000000000000000000000000000000' && (
                <button
                  onClick={() => navigator.clipboard.writeText(targetAddress)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                  title="Copy Target Address"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              )}
            </div>
            <div className="text-[11px] font-mono text-emerald-700 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">verified</span>
              Destination Target (EVM Validated)
            </div>
          </div>
        </div>

        {/* Financial Execution Parameters */}
        <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200/60">
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pb-2 border-b border-emerald-200/40">
            <span className="font-bold text-slate-700">EXECUTION PARAMETERS</span>
            <span className="text-emerald-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">toll</span>
              Network: Base Sepolia (Chain ID 84532)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-3 font-mono">
            <div>
              <div className="text-[11px] text-slate-400 uppercase">Allocated Amount</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">{formatEth(amountEth, 4)} ETH</div>
              <div className="text-[10px] text-slate-500">Testnet Native Gas</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase">Per-Tx Policy Limit</div>
              <div className="text-sm font-bold text-emerald-700 mt-0.5">&le; 0.0100 ETH</div>
              <div className="text-[10px] text-slate-500">Strict Safety Invariant</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase">Gas Reserve Floor</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">0.0050 ETH</div>
              <div className="text-[10px] text-slate-500">Always preserved for fees</div>
            </div>
          </div>
        </div>

        {/* Explainable AI Reasoning */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="material-symbols-outlined text-sm text-primary">psychology</span>
              <span>Explainable AI Reasoning (Policy Invariant Verification)</span>
            </div>
            {confidenceScore !== undefined && (
              <Badge variant="active">
                {agentType} Confidence: {(confidenceScore * 100).toFixed(1)}%
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            {rationale || reasoning || 'The RL policy evaluated the current wallet state and proposed this action within safety thresholds.'}
          </p>

          <div className="mt-3 p-2.5 bg-slate-900 rounded-lg text-emerald-400 font-mono text-xs flex items-center justify-between">
            <span className="truncate">Solidity Function: executePayment(recipient, {amountEth} ether)</span>
            <span className="text-slate-400 text-[11px] shrink-0 ml-2">AgentWallet.sol</span>
          </div>
        </div>

        {/* Cryptographic Safety & Risk Guarantees */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
              Spending Cap Check
            </div>
            <div className="font-mono text-slate-500 mt-1">{formatEth(amountEth, 4)} / 0.05 ETH daily limit</div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
              Network Guard
            </div>
            <div className="font-mono text-slate-500 mt-1">Base Sepolia (84532) Locked</div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
              Non-Custodial Signer
            </div>
            <div className="font-mono text-slate-500 mt-1">Requires MetaMask Signature</div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">vpn_key</span>
            Requires Hardware / Signer Authorization
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="danger"
              size="md"
              onClick={() => onReject(decisionId, 'Operator rejected')}
              disabled={isProcessing}
              icon="block"
              className="flex-1 sm:flex-none"
            >
              Reject & Freeze Agent
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => onApprove(decisionId)}
              disabled={isProcessing || timeLeft === 0}
              icon="approval"
              className="flex-1 sm:flex-none"
            >
              {isProcessing ? 'Authorizing...' : 'Approve & Sign via MetaMask'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
