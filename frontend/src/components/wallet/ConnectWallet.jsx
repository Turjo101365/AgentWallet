import React from 'react';
import { Button } from '../ui/Button.jsx';
import { truncateAddress } from '../../utils/formatters.js';

export function ConnectWallet({ isConnected, address, onConnect, onDisconnect, isConnecting }) {
  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container rounded-lg border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-xs font-semibold text-slate-800">
            {truncateAddress(address, 6, 4)}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={onConnect}
      disabled={isConnecting}
      icon="link"
    >
      {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
    </Button>
  );
}
