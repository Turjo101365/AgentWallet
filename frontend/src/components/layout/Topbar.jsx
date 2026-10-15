import React from 'react';
import { truncateAddress } from '../../utils/formatters.js';

export function Topbar({
  walletAddress,
  chainId,
  blockNumber,
  isConnected,
  onConnect,
  onDisconnect,
}) {
  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      alert('Address copied to clipboard!');
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <span className="font-semibold text-slate-700">AgentWallet</span>
        <span>/</span>
        <span className="text-slate-600">Autonomous Treasury Execution</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Network Tag */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-mono font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Base Sepolia #{chainId || 84532}</span>
        </div>

        {/* Synced Block */}
        <div className="hidden md:flex items-center gap-1 px-3 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-mono">
          <span className="material-symbols-outlined text-sm text-slate-400">cloud_done</span>
          <span>{blockNumber ? `Block #${Number(blockNumber).toLocaleString()}` : 'RPC Active'}</span>
        </div>

        {/* Connected Wallet Pill / Connect Button */}
        {isConnected && walletAddress ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container border border-emerald-300 text-on-surface rounded-lg text-xs font-mono">
            <span className="material-symbols-outlined text-sm text-primary">account_balance_wallet</span>
            <span className="font-semibold">{truncateAddress(walletAddress, 6, 4)}</span>
            <button
              onClick={copyAddress}
              title="Copy Address"
              className="text-slate-400 hover:text-slate-700 ml-0.5 p-0.5"
            >
              <span className="material-symbols-outlined text-xs">content_copy</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-secondary transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">link</span>
            <span>Connect MetaMask</span>
          </button>
        )}

        {/* Notification Bell */}
        <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
          <span className="material-symbols-outlined text-xl">notifications</span>
        </button>

        {/* User / Signer Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-emerald-400 flex items-center justify-center font-mono text-xs font-bold">
            A
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-tight leading-none">Security Admin</div>
            <div className="text-[10px] font-mono text-slate-400 leading-none mt-1">Key #01</div>
          </div>
        </div>
      </div>
    </header>
  );
}
