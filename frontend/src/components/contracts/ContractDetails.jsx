import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { truncateAddress } from '../../utils/formatters.js';

export function ContractDetails({
  contractAddress,
  isPaused = false,
  ownerAddress,
  agentAddress,
  onTogglePause,
  isUpdating = false,
}) {
  return (
    <Card>
      <CardHeader
        title="DEPLOYED SMART CONTRACT INTERFACE"
        subtitle="AgentWallet.sol state on active EVM chain"
        badge={
          contractAddress ? (
            <Badge variant={isPaused ? 'error' : 'success'}>
              {isPaused ? 'PAUSED' : 'ACTIVE'}
            </Badge>
          ) : (
            <Badge variant="warning">Contract configuration missing</Badge>
          )
        }
      />
      <CardContent className="space-y-4 font-mono text-xs">
        <div>
          <span className="text-slate-400 block text-[11px] uppercase">Contract Address</span>
          <div className="flex items-center justify-between font-bold text-slate-800 mt-1 p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
            <span>{contractAddress || 'Not configured in environment'}</span>
            {contractAddress && (
              <button
                onClick={() => navigator.clipboard.writeText(contractAddress)}
                className="text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-slate-400 block text-[11px] uppercase">Owner / Multisig</span>
            <span className="font-semibold text-slate-800 mt-1 block truncate">
              {ownerAddress || 'Connect wallet to query'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-slate-400 block text-[11px] uppercase">Authorized Agent</span>
            <span className="font-semibold text-slate-800 mt-1 block truncate">
              {agentAddress || 'Connect wallet to query'}
            </span>
          </div>
        </div>

        <div className="pt-2 flex justify-between items-center border-t border-slate-100">
          <span className="text-slate-500 font-sans text-xs">Emergency Kill Switch:</span>
          <Button
            variant={isPaused ? 'primary' : 'danger'}
            size="sm"
            onClick={onTogglePause}
            disabled={!contractAddress || isUpdating}
            icon={isPaused ? 'play_arrow' : 'pause'}
          >
            {isPaused ? 'Unpause Wallet' : 'Emergency Pause'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
