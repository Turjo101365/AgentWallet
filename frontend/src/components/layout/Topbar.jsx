import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/providers.jsx';
import { Button } from '../ui/Button.jsx';
import { truncateAddress } from '../../utils/formatters.js';
import { PrimaryNav } from './Sidebar.jsx';
import { NetworkModePill } from './NetworkMode.jsx';

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 shrink-0 text-white" aria-label="AgentWallet home">
      <span className="w-9 h-9 rounded-full bg-mint text-ink flex items-center justify-center">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
      </span>
      <span className="font-display text-[22px] leading-none tracking-tight hidden sm:inline">AgentWallet</span>
    </Link>
  );
}

export function Topbar() {
  const { config, account, walletChainId, networkOk, session, isOwner, isDemo, connect, switchNetwork, signOut } = useApp();
  return (
    <header className="sticky top-0 z-40 bg-ink text-white">
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-4 px-4 sm:px-6 lg:h-16">
        <div className="h-16 flex items-center"><Brand /></div>
        <PrimaryNav className="order-last lg:order-none w-full lg:w-auto lg:mx-auto pb-3 lg:pb-0 lg:px-1" />
        <div className="flex items-center gap-2 shrink-0">
          {account && !networkOk && config && (
            <Button variant="danger" size="sm" onClick={() => switchNetwork().catch(() => {})} icon="warning">
              Wrong network ({walletChainId}) · switch to {config.chainId}
            </Button>
          )}
          <NetworkModePill />
          {account && networkOk && (
            <span title={config?.networkName} className="hidden xl:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 text-white/85 text-[11px] font-mono">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#7fd6a4]" />
              <span className="hidden 2xl:inline">{config?.networkName} </span>#{walletChainId}
            </span>
          )}
          {session && (
            <span className={`inline-flex items-center h-8 px-3 rounded-full text-[11px] font-mono font-bold ${isOwner || isDemo ? 'bg-mint text-mint-deep' : 'bg-white/10 text-white/80'}`}>
              {isDemo ? 'demo wallet' : isOwner ? 'owner' : 'viewer'}
            </span>
          )}
          {isDemo ? null : account ? (
            <span className="hidden md:inline-flex items-center h-8 px-3 rounded-full bg-white/10 text-[11px] font-mono text-white/85" title={account}>
              {truncateAddress(account)}
            </span>
          ) : (
            <Button size="sm" variant="light" onClick={() => connect().catch(() => {})} icon="account_balance_wallet">Connect</Button>
          )}
          {session && (
            <button
              onClick={signOut}
              aria-label={isDemo ? 'Leave demo' : 'Sign out'}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-[12px] font-semibold text-white/75 hover:text-white hover:bg-white/10 transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">logout</span>
              <span>{isDemo ? 'Leave demo' : 'Sign out'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
