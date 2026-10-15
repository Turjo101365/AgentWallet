import React from 'react';
import { useApp } from '../../app/providers.jsx';
import { Card, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Alert } from '../ui/Alert.jsx';
import { describeError } from '../../lib/api.js';

function Step({ done, active, title, children }) {
  return (
    <div className={`flex gap-3 items-start ${active ? '' : 'opacity-60'}`}>
      <span className={`material-symbols-outlined ${done ? 'text-emerald-600' : active ? 'text-amber-600' : 'text-slate-400'}`}>
        {done ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
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
    <Card className="max-w-xl mx-auto mt-6">
      <CardContent className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-on-surface">Operator sign-in</h2>
          <p className="text-xs text-slate-500 mt-1">
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
          <p className="text-xs text-slate-500 mb-2">You will sign a text message. It does not authorize any transaction or spending.</p>
          <Button onClick={() => run(app.signIn)} disabled={busy} icon="key">{busy ? 'Waiting for signature…' : 'Sign in'}</Button>
        </Step>
        {error && <Alert variant="error">{describeError(error)}</Alert>}
      </CardContent>
    </Card>
  );
}
