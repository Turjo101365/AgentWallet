import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DecisionCard } from '../components/agent/DecisionCard.jsx';
import { ApprovalPanel } from '../components/agent/ApprovalPanel.jsx';
import { TransactionTable } from '../components/transactions/TransactionTable.jsx';
import { Card, CardContent } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { useAgent } from '../hooks/useAgent.js';
import { contractService } from '../services/contractService.js';

export function AgentActivity() {
  const { walletAddress } = useOutletContext();
  const {
    pendingProposal,
    approveProposal,
    rejectProposal,
    isPaused,
    togglePause,
  } = useAgent();
  const [activeTab, setActiveTab] = useState('All');
  const [isProcessing, setIsProcessing] = useState(false);

  const hasPending = Boolean(pendingProposal);

  const tabs = [
    { label: 'All' },
    { label: 'Awaiting Approval', count: hasPending ? 1 : 0 },
    { label: 'Executing' },
    { label: 'Idle' },
    { label: 'Error' },
  ];

  const handleApprove = async (decisionId) => {
    setIsProcessing(true);
    try {
      if (!window.ethereum) throw new Error('MetaMask not connected');
      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const approval = await approveProposal(decisionId, await signer.getAddress());
      const tx = await contractService.executePayment(
        signer,
        approval.proposedParameters?.recipient || '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        approval.proposedParameters?.amountEth || 0.01
      );

      alert(`Transaction executed! Hash: ${tx.hash}`);
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
      alert('Proposal rejected.');
    } catch (err) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTogglePause = async () => {
    setIsProcessing(true);
    try {
      const res = await togglePause();
      const newStatus = res?.data?.isPaused;
      alert(
        newStatus
          ? 'EMERGENCY PAUSE: Agent execution halted.'
          : 'Agent execution resumed successfully.'
      );
    } catch (e) {
      alert(`Toggle pause error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-500 uppercase">
            <span className="text-emerald-700">Reinforcement Learning Node #04</span>
            <span>•</span>
            <span className={isPaused ? 'text-rose-600 font-bold' : ''}>
              {isPaused ? 'EMERGENCY HALTED' : 'Deterministic Proof Layer'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface mt-1">
            Autonomous Agent Activity & Decision Engine
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Explainable autonomous decision-making logs, pending transaction authorizations, and RL policy validation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Tabs Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-mono">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.label
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px]">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <Button
            variant={isPaused ? 'primary' : 'danger'}
            size="sm"
            icon={isPaused ? 'play_arrow' : 'pause_circle'}
            onClick={handleTogglePause}
            disabled={isProcessing}
          >
            {isPaused ? 'Resume Agent Execution' : 'Pause Agent Execution'}
          </Button>
        </div>
      </div>

      {/* 4 Agent Stat Modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-[11px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">smart_toy</span>
            Current Agent State
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-rose-500 animate-ping' : (hasPending ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500')}`} />
            <span className={`font-bold text-sm ${isPaused ? 'text-rose-700' : (hasPending ? 'text-amber-900' : 'text-slate-800')}`}>
              {isPaused ? 'EMERGENCY PAUSED' : (hasPending ? 'Awaiting Approval' : 'IDLE / MONITORING')}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-1">
            {isPaused ? 'Agent execution is locked by emergency halt' : (hasPending ? 'Proposal awaiting client signature' : 'Awaiting state changes or evaluation')}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">tune</span>
            Engine Mode
          </div>
          <div className="font-bold text-sm text-slate-800 mt-2">HITL Autonomous</div>
          <div className="text-[11px] font-mono text-slate-500 mt-1">Human-in-the-Loop Safeguard</div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">memory</span>
            Model Runtime
          </div>
          <div className="font-bold text-sm text-slate-800 mt-2">
            {pendingProposal ? `${pendingProposal.agentName} Policy` : 'PPO / DQN Dual Engine'}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-1">FastAPI RL Engine (Port 8001)</div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">history</span>
            Target Network
          </div>
          <div className="font-bold text-sm text-slate-800 mt-2">Base Sepolia</div>
          <div className="text-[11px] font-mono text-emerald-700 mt-1">Chain ID: 84532</div>
        </Card>
      </div>

      {/* Main Execution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DecisionCard
            proposal={pendingProposal}
            onApprove={handleApprove}
            onReject={handleReject}
            isProcessing={isProcessing}
          />
        </div>

        <div>
          <ApprovalPanel />
        </div>
      </div>

      {/* Bottom Transactions Stream */}
      <TransactionTable />
    </div>
  );
}
