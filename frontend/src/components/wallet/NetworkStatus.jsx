import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';

import { CONTRACT_ADDRESS } from '../../config/contracts.js';
import { truncateAddress } from '../../utils/formatters.js';

export function NetworkStatus({ chainId = 84532, networkName = 'Base Sepolia Testnet', isConnected = false, contractAddress }) {
  const activeContract = contractAddress || CONTRACT_ADDRESS;

  return (
    <Card>
      <CardHeader
        title="DELEGATION & VERIFICATION"
        badge={
          <Badge variant={isConnected ? 'success' : 'neutral'}>
            Base Sepolia #84532
          </Badge>
        }
      />
      <CardContent className="space-y-3 font-mono text-xs">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <span className="text-slate-500">AgentContract:</span>
          <span className="font-semibold text-slate-800">
            {activeContract ? truncateAddress(activeContract, 8, 4) : 'Not configured'}
          </span>
        </div>
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <span className="text-slate-500">Security Framework:</span>
          <span className="text-emerald-700 font-medium flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">verified_user</span>
            OpenZeppelin v5.0
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Proxy Impl:</span>
          <span className="text-slate-700">ERC-1967 Transparent</span>
        </div>
      </CardContent>
    </Card>
  );
}
