import React from 'react';
import { useApp } from '../../app/providers.jsx';
import { Button } from '../ui/Button.jsx';
import { truncateAddress } from '../../utils/formatters.js';

export function Topbar() {
  const { config, account, walletChainId, networkOk, session, isOwner, connect, switchNetwork, signOut } = useApp();
  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 gap-3">
      <div className="text-xs text-slate-500 font-medium truncate">
        <span className="font-semibold text-slate-700">AgentWallet</span> <span className="hidden sm:inline">/ policy-bounded treasury agent</span>
      </div>
      <div className="flex items-center gap-2">
        {account && !networkOk && config && (
          <Button variant="danger" size="sm" onClick={() => switchNetwork().catch(() => {})} icon="warning">
            Wrong network ({walletChainId}) · switch to {config.chainId}
          </Button>
        )}
        {account && networkOk && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {config?.networkName} #{walletChainId}
          </span>
        )}
        {session && (
          <span className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${isOwner ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
            {isOwner ? 'owner' : 'viewer'}
          </span>
        )}
        {account ? (
          <span className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700" title={account}>
            {truncateAddress(account)}
          </span>
        ) : (
          <Button size="sm" onClick={() => connect().catch(() => {})} icon="account_balance_wallet">Connect</Button>
        )}
        {session && (
          <Button variant="secondary" size="sm" onClick={signOut} icon="logout">Sign out</Button>
        )}
      </div>
    </header>
  );
}
