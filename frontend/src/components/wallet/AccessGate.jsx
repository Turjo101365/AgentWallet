import React from 'react';
import { useApp } from '../../app/providers.jsx';
import { Card, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Alert } from '../ui/Alert.jsx';
import { describeError } from '../../lib/api.js';

function Step({ done, active, title, children }) {
  return (
    <div className={`flex gap-3.5 items-start rounded-2xl p-3.5 transition-colors ${active ? 'bg-slate-50' : 'opacity-60'}`}>
      <span aria-hidden="true" className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${done ? 'bg-mint text-mint-deep' : active ? 'bg-ink text-white' : 'bg-white ring-1 ring-slate-300'}`}>
        {done ? <span className="material-symbols-outlined text-[18px]">check</span> : <span className={`w-2 h-2 rounded-full ${active ? 'bg-[#9fdcb8]' : 'bg-slate-300'}`} />}
      </span>
      <div className="flex-1 pt-1">
        <div className="text-[15px] font-bold text-ink">{title}</div>
        {active && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

/**
 * Blocks the console until: backend config is loaded, a wallet is connected, the wallet is on the
 * backend's chain, and the user has signed in with that wallet (SIWE).
 */
export function AccessGate({ children }) {
  const app = useApp();
  const { config, configError, hasWallet, account, networkOk, session, busy, error } = app;

  if (configError) {
    return (
      <Alert variant="error" title="Backend unavailable">
        {configError}. Start the backend (npm run dev:backend) and reload.
      </Alert>
    );
  }
  if (!config) return <div className="text-sm text-slate-500">Loading configuration…</div>;
  if (account && networkOk && session) return children;

  const run = async (fn) => {
    try {
      await fn();
    } catch {
      /* surfaced through app.error */
    }
  };
  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5 max-w-6xl mx-auto mt-2 animate-rise">
      <Card tone="ink" className="relative overflow-hidden">
        <CardContent className="h-full flex flex-col justify-between gap-10 sm:p-10">
          <div className="eyebrow text-white/60">Policy-bounded treasury agent</div>
          <div>
            <h1 className="text-[48px] sm:text-[72px] leading-[0.92]">The AI plans.<br />You authorize.<br /><span className="text-[#9fdcb8]">The contract enforces.</span></h1>
            <p className="text-white/70 mt-6 max-w-md leading-relaxed">Sign in with the wallet that owns the AgentWallet contract. Viewers can read; only the owner can approve, sign grants or change limits.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            {[['shield_lock', 'On-chain caps'], ['draw', 'EIP-712 approvals'], ['history_edu', 'Hash-chained audit']].map(([icon, label]) => (
              <div key={label} className="rounded-2xl bg-white/[0.06] p-3">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-[#9fdcb8]">{icon}</span>
                <div className="mt-2 font-semibold text-white/85">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    <Card>
      <CardContent className="space-y-4 sm:p-9">
        <div>
          <h2 className="text-[34px] leading-tight text-on-surface">Operator sign-in</h2>
          <p className="text-[13px] text-slate-500 mt-2 font-mono break-all">
            {config.networkName} (chain {config.chainId}) · contract {config.contractAddress || 'not configured'}
          </p>
        </div>
        {!config.chainReady && (
          <Alert variant="warning" title="Backend cannot reach the chain">
            {config.chainError || 'Chain not verified'}. Money operations are disabled until this is fixed.
          </Alert>
        )}
        <Step done={Boolean(account)} active={!account} title="1. Connect wallet">
          {hasWallet ? (
            <Button onClick={() => run(app.connect)} icon="account_balance_wallet">Connect wallet</Button>
          ) : (
            <Alert variant="error">No injected wallet detected. Install MetaMask to continue.</Alert>
          )}
        </Step>
        <Step done={Boolean(account && networkOk)} active={Boolean(account && !networkOk)} title={`2. Switch to ${config.networkName}`}>
          <Button onClick={() => run(app.switchNetwork)} icon="swap_horiz">Switch network</Button>
        </Step>
        <Step done={Boolean(session)} active={Boolean(account && networkOk && !session)} title="3. Sign in with your wallet">
          <p className="text-[13px] text-slate-500 mb-3">You will sign a text message. It does not authorize any transaction or spending.</p>
          <Button onClick={() => run(app.signIn)} disabled={busy} icon="key">{busy ? 'Waiting for signature…' : 'Sign in'}</Button>
        </Step>
        {error && <Alert variant="error">{describeError(error)}</Alert>}
      </CardContent>
    </Card>
    </div>
  );
}
