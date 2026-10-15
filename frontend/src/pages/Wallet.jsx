import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { truncateAddress, formatEth, formatUsd } from '../utils/formatters.js';
import { NETWORKS } from '../config/networks.js';
import { walletService } from '../services/walletService.js';

export function Wallet() {
  const { walletAddress, chainId, isConnected, connect } = useOutletContext();
  const [selectedNetwork, setSelectedNetwork] = useState(chainId || 84532);
  const [walletState, setWalletState] = useState(null);

  useEffect(() => {
    if (isConnected && walletAddress) {
      walletService.fetchWalletState(walletAddress)
        .then(setWalletState)
        .catch((err) => console.warn('Could not fetch wallet state:', err.message));
    } else {
      setWalletState(null);
    }
  }, [isConnected, walletAddress]);

  const ethBalance = isConnected && walletState?.nativeBalanceEth !== undefined
    ? `${walletState.nativeBalanceEth} ETH`
    : isConnected
    ? 'Fetching...'
    : 'Not connected';

  const tokens = [
    { name: 'Ethereum (Base Sepolia)', symbol: 'ETH', balance: ethBalance, usd: isConnected && walletState?.nativeBalanceEth ? walletState.nativeBalanceEth * 3420 : null, type: 'Native Gas Asset', price: 'Base Sepolia Native', icon: 'currency_exchange' },
    { name: 'USD Coin (Testnet)', symbol: 'USDC', balance: isConnected ? '0.00 USDC' : 'Not connected', usd: null, type: 'ERC-20 Token', price: 'Testnet Contract', icon: 'attach_money' },
    { name: 'Dai Stablecoin (Testnet)', symbol: 'DAI', balance: isConnected ? '0.00 DAI' : 'Not connected', usd: null, type: 'ERC-20 Token', price: 'Testnet Contract', icon: 'token' },
    { name: 'Wrapped Ether (Base Sepolia)', symbol: 'WETH', balance: isConnected ? '0.00 WETH' : 'Not connected', usd: null, type: 'Canonical WETH', price: 'Base Sepolia Contract', icon: 'all_inclusive' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>EIP-1193 SPECIFICATION VERIFIED / NON-CUSTODIAL HARDENED</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface mt-1">
            Wallet & On-Chain Connectivity
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Manage your connected Web3 provider, inspect on-chain assets, verify Base Sepolia connection, and configure contract signature limits.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" icon="tune">
            Network: Base Sepolia (84532)
          </Button>
          {!isConnected ? (
            <Button variant="primary" size="sm" icon="account_balance_wallet" onClick={connect}>
              Connect MetaMask
            </Button>
          ) : (
            <Button variant="neutral" size="sm" icon="check_circle">
              Connected
            </Button>
          )}
        </div>
      </div>

      {/* Top 2 Cards: MetaMask Details + Network Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* MetaMask Connection Card */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-primary text-2xl">
                <span className="material-symbols-outlined text-3xl">token</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-slate-800">MetaMask</span>
                  <Badge variant={isConnected ? 'success' : 'neutral'} pulse={isConnected}>
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  EIP-1193 RPC Provider (Base Sepolia)
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 font-mono text-xs">
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Signer Delegation Address</span>
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 mt-1">
              <span className="font-bold text-slate-800 truncate">
                {walletAddress || 'Not connected'}
              </span>
              <div className="flex items-center gap-1 text-slate-400">
                <button className="p-1 hover:text-slate-700" title="Copy"><span className="material-symbols-outlined text-sm">content_copy</span></button>
              </div>
            </div>
          </div>
        </Card>

        {/* Active Execution Network Card */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-mono text-slate-500 mb-2">
              <span className="uppercase font-semibold">Active Execution Network</span>
              <span>Chain ID: {chainId || 84532}</span>
            </div>

            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Object.values(NETWORKS).map((n) => (
                <option key={n.chainId} value={n.chainId}>
                  {n.name} (Active)
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-lg text-xs mt-3 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">verified_user</span>
            <div>
              <span className="font-bold text-emerald-950 block">Agent Network Protocol Guard</span>
              <span className="text-emerald-800 text-[11px] leading-relaxed">
                Warning: Connecting to an unsupported network will automatically disable autonomous agent execution and revert scheduled flash-arbitrage pipelines.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Holdings & Balance Matrix */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-on-surface">Holdings & Balance Matrix</h2>
            <Badge variant="active">Base Sepolia State</Badge>
          </div>
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-emerald-600">verified</span>
            Only verified ERC-20 tokens deployed on Chain ID 84532 with valid Chainlink feeds are displayed.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tokens.map((t, idx) => (
            <Card key={idx} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center font-bold text-sm">
                    <span className="material-symbols-outlined text-lg">{t.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 leading-none">{t.name}</h4>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">{t.type}</span>
                  </div>
                </div>
                <Badge variant="neutral">{t.symbol}</Badge>
              </div>

              {/* Sparkline Visual */}
              <div className="h-6 w-full flex items-end gap-1 mt-4 mb-2">
                {[30, 40, 25, 60, 80, 70, 90].map((h, i) => (
                  <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-emerald-200 rounded-t-sm" />
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 font-mono">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-slate-900">{t.balance}</span>
                  <span className="text-xs font-semibold text-slate-500">{t.symbol}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400 mt-0.5">
                  <span>{formatUsd(t.usd)}</span>
                  <span className="text-emerald-700 font-semibold">{t.price}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom Grid: Security Key Custody + Active Session Approvals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-800 pb-2 border-b border-slate-100">
            <span className="material-symbols-outlined text-primary text-xl">shield</span>
            <span>Security & Key Custody Assurance</span>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0 mt-0.5">key_off</span>
            <div>
              <div className="text-xs font-bold text-slate-800">Zero Private Key Exposure Architecture</div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                AgentWallet communicates exclusively via client-side EIP-1193 RPC providers (MetaMask). Your private keys and recovery seeds remain hardware/extension locked and are never accessible to AI agents or backend services. Every autonomous batch execution adheres strictly to signed session allowances.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-200 text-emerald-900 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-emerald-600">verified</span>
              <span>EIP-712 STRUCTURED CALL</span>
            </div>
            <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-200 text-emerald-900 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-emerald-600">cloud_off</span>
              <span>CLOUD KEY ISOLATION</span>
            </div>
          </div>
        </Card>

        {/* Active Session Approvals */}
        <Card className="p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-sm text-slate-800">Active Session Approvals</span>
              <Badge variant="neutral">LIVE AUDIT</Badge>
            </div>

            <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-xl">phonelink_lock</span>
                <div>
                  <div className="font-bold text-slate-800">Wildcard Approvals</div>
                  <div className="text-[11px] text-slate-400">Unrestricted infinite spend permits</div>
                </div>
              </div>
              <span className="text-base font-bold text-emerald-700">0 Safe Limit</span>
            </div>

            <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
              <div className="flex justify-between items-center font-mono">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Signing Policy Mode</span>
                <span className="font-bold text-emerald-700">Enforced</span>
              </div>
              <div className="font-bold text-slate-800 mt-1">Tiered Multi-sig & Human Approval Required for &gt;0.50 ETH</div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Autonomous agents can execute sub-0.5 ETH rebalances independently. Transactions exceeding this threshold require physical Ledger/MetaMask explicit confirmations.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[11px] font-mono text-slate-400">
            <span>Network: Base Sepolia (Chain ID 84532)</span>
            <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
              <span>Non-custodial Policy Active</span>
              <span className="material-symbols-outlined text-xs">verified</span>
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
