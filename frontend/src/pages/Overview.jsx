import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { WalletBalance } from '../components/wallet/WalletBalance.jsx';
import { AgentStatus } from '../components/agent/AgentStatus.jsx';
import { NetworkStatus } from '../components/wallet/NetworkStatus.jsx';
import { DecisionCard } from '../components/agent/DecisionCard.jsx';
import { TransactionTable } from '../components/transactions/TransactionTable.jsx';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { useAgent } from '../hooks/useAgent.js';
import { walletService } from '../services/walletService.js';
import { contractService } from '../services/contractService.js';

export function Overview() {
  const { walletAddress, chainId, isConnected } = useOutletContext();
  const {
    proposals,
    pendingProposal,
    approveProposal,
    rejectProposal,
    triggerEvaluation,
    isLoading,
    isPaused,
    togglePause,
  } = useAgent();

  const [walletState, setWalletState] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    walletService.fetchWalletState(walletAddress)
      .then(setWalletState)
      .catch((err) => console.warn('Could not fetch wallet state:', err.message));
  }, [walletAddress]);

  const handleEmergencyPause = async () => {
    setIsProcessing(true);
    try {
      const res = await togglePause();
      const newStatus = res?.data?.isPaused;

      // Also if contract is configured and MetaMask is connected, optionally trigger contract pause
      if (isConnected && window.ethereum && walletState?.isConfigured) {
        try {
          const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          await contractService.setPaused(signer, newStatus);
        } catch (contractErr) {
          console.warn('Could not update contract on-chain pause:', contractErr.message);
        }
      }

      alert(
        newStatus
          ? 'EMERGENCY PAUSE ACTIVATED: Autonomous agent decision cycle and proposal generation are halted.'
          : 'Agent execution successfully RESUMED.'
      );
    } catch (err) {
      alert(`Emergency pause toggle error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async (decisionId) => {
    setIsProcessing(true);
    try {
      if (!window.ethereum) throw new Error('MetaMask not connected');
      // Request MetaMask signature
      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Submit on-chain execution through MetaMask
      const approvalData = await approveProposal(decisionId, await signer.getAddress());
      const tx = await contractService.executePayment(
        signer,
        approvalData.proposedParameters?.recipient || '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        approvalData.proposedParameters?.amountEth || 0.01
      );

      // Track newly broadcasted tx hash
      await fetch('/api/transactions/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: tx.hash,
          decisionId,
          fromAddress: await signer.getAddress(),
          toAddress: tx.to,
          valueEth: approvalData.proposedParameters?.amountEth || 0.01,
          valueWei: '10000000000000000',
        }),
      });

      alert(`Transaction broadcasted successfully! Tx Hash: ${tx.hash}`);
    } catch (err) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (decisionId, reason) => {
    setIsProcessing(true);
    try {
      await rejectProposal(decisionId, reason);
      alert('Proposal successfully rejected and cancelled.');
    } catch (err) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const isEmergencyPaused = isPaused || Boolean(walletState?.isContractPaused);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-500">
            <span className="text-emerald-700">SYSTEM MASTER V2.4</span>
            <span>/</span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isEmergencyPaused ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
              {isEmergencyPaused ? 'Execution Halted (Paused)' : 'Decentralized Autonomous Executor'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface mt-1">
            Your wallet. Your rules.
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Real-time autonomous policy engine, verified contract execution, and explainable on-chain operations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant={isEmergencyPaused ? 'primary' : 'danger'}
            size="sm"
            icon={isEmergencyPaused ? 'play_arrow' : 'pause'}
            onClick={handleEmergencyPause}
            disabled={isProcessing}
          >
            {isEmergencyPaused ? 'Resume Agent Execution' : 'Request Emergency Pause'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerEvaluation()}
            disabled={isLoading || isEmergencyPaused}
            icon="refresh"
          >
            {isLoading ? 'Evaluating...' : 'Refresh Telemetry'}
          </Button>
        </div>
      </div>

      {/* Top 3 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <WalletBalance
          balanceEth={isConnected && walletState?.nativeBalanceEth !== undefined ? walletState.nativeBalanceEth : null}
          isConfigured={Boolean(isConnected && walletState?.isConfigured)}
        />
        <AgentStatus
          state={isEmergencyPaused ? 'EMERGENCY PAUSED' : (pendingProposal ? 'Awaiting Approval' : 'IDLE / MONITORING')}
          isPaused={isEmergencyPaused}
        />
        <NetworkStatus
          chainId={chainId || 84532}
          isConnected={isConnected}
        />
      </div>

      {/* Middle Grid: Pending Action + Right Rail Security Checks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Pending Action Card (2 columns) */}
        <div className="lg:col-span-2">
          <DecisionCard
            proposal={pendingProposal}
            onApprove={handleApprove}
            onReject={handleReject}
            isProcessing={isProcessing}
          />
        </div>

        {/* Right Rail: Security Checks & Policy Telemetry (1 column) */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="RISK ENGINE & SECURITY CHECKS"
              badge={<Badge variant="success">BASE SEPOLIA POLICY</Badge>}
            />
            <CardContent className="space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between items-center text-slate-500 mb-1">
                  <span>Daily Spending Cap Utilization:</span>
                  <span className="font-bold text-slate-800">
                    {walletState ? `${walletState.dailySpentEth || '0.00'} / ${walletState.dailyLimitEth || '0.05'} ETH` : 'Data unavailable'}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: walletState?.dailyLimitEth ? `${Math.min(100, ((walletState.dailySpentEth || 0) / walletState.dailyLimitEth) * 100)}%` : '0%'
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Contract Limit: {walletState?.perTxLimitEth || 0.01} ETH / tx</span>
                  <span>Network: Base Sepolia</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-sm text-emerald-600">lock</span>
                  Reentrancy Guard
                </span>
                <span className="text-[11px] text-emerald-700 font-bold">Contract Hardened</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-sm text-emerald-600">sensors</span>
                  Emergency Pause
                </span>
                <span className={`text-[11px] font-bold ${isEmergencyPaused ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {isEmergencyPaused ? 'PAUSED / HALTED' : 'ACTIVE / UNPAUSED'}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-sm text-emerald-600">science</span>
                  Safety Validator
                </span>
                <span className="text-[11px] text-emerald-700 font-bold">Deterministic 9-Stage</span>
              </div>
            </CardContent>
          </Card>

          {/* RL Telemetry */}
          <Card>
            <CardHeader
              title="RL POLICY ENGINE TELEMETRY"
              badge={<Badge variant={pendingProposal ? 'active' : 'neutral'}>{pendingProposal ? pendingProposal.agentName?.toUpperCase() : 'IDLE'}</Badge>}
            />
            <CardContent className="space-y-3 font-mono text-xs">
              <span className="text-[11px] text-slate-400 uppercase block font-bold">Agent Inference State</span>
              {pendingProposal ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-50 rounded border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-400">Selected Action</div>
                      <div className="font-bold text-slate-800 mt-0.5">{pendingProposal.proposedAction}</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-400">Confidence Score</div>
                      <div className="font-bold text-emerald-700 mt-0.5">
                        {pendingProposal.confidenceScore !== undefined ? pendingProposal.confidenceScore.toFixed(3) : 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-semibold">Validation Status:</span>
                      <span className={`font-bold ${pendingProposal.validationOutcome?.status === 'APPROVED' ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {pendingProposal.validationOutcome?.status || 'PENDING'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-sans">
                      {pendingProposal.reasoning || 'Awaiting manual user signature.'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-slate-400">
                  <span className="material-symbols-outlined text-2xl block mb-1">psychology</span>
                  <span>No active proposals pending.</span>
                  <p className="text-[11px] text-slate-400 mt-1">Click "Refresh Telemetry" to trigger an agent evaluation step.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Transactions Table */}
      <TransactionTable />
    </div>
  );
}
