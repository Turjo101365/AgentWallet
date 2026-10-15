import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useWallet } from '../../hooks/useWallet.js';

export function AppLayout() {
  const { address, chainId, isConnected, connect, disconnect } = useWallet();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          walletAddress={address}
          chainId={chainId}
          isConnected={isConnected}
          onConnect={connect}
          onDisconnect={disconnect}
        />
        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
          <Outlet context={{ walletAddress: address, chainId, isConnected, connect }} />
        </main>
      </div>
    </div>
  );
}
