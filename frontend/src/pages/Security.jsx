import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useApp } from '../app/providers.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { API_BASE } from '../lib/api.js';
import { formatDateTime } from '../utils/formatters.js';

async function fetchHealth() {
  const res = await fetch(`${API_BASE.replace(/\/api$/, '')}/health`);
  return res.json();
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-800 text-right break-all">{children}</span>
    </div>
  );
}

export function Security() {
  const { config, session, isOwner, isDemo, demo, judgeSite, signOut } = useApp();
  const health = usePolling(fetchHealth, 10000);
  const h = health.data;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Wallet & preferences" title="Settings">
        Your access, wallet details and service status. Find payment history and advanced tools here.
      </PageHeader>
      <nav aria-label="Wallet tools" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["/funding","Balance & funding"],["/transactions","Payment history"],["/portfolio","Portfolio"],["/audit","Activity log"],...(!judgeSite?[["/rl","Advanced timing advice"]]:[])].map(([to,label])=><Link key={to} to={to} className="rounded-2xl bg-white p-4 font-semibold shadow-card hover:bg-mint transition-colors">{label} →</Link>)}
      </nav>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Session" />
          <CardContent>
            <Row label="Access">{isDemo ? 'Guest judge · no account needed' : session?.address || 'Not signed in'}</Row>
            <Row label="Wallet">{isDemo ? 'Shared demo wallet · backend-controlled' : isOwner ? 'Personal wallet owner' : 'Read-only access'}</Row>
            <Row label="Expires">{formatDateTime(isDemo ? demo?.expiresAt : session?.expiresAt)}</Row>
            <div className="pt-3">
              <Button variant="secondary" onClick={signOut} icon="logout">{isDemo ? 'Leave demo' : 'Sign out and revoke session'}</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Service status" badge={h ? <Badge variant={h.status === 'ok' ? 'success' : 'error'}>{h.status === 'ok' ? 'Available' : 'Needs attention'}</Badge> : null} />
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">Connection checks for the hosted service. Wallet-specific permissions are shown with each payment.</p>
            <details className="technical-details"><summary>Service diagnostics</summary>
            <Row label="Database">{h?.checks?.database?.status} ({h?.checks?.database?.engine})</Row>
            <Row label="Chain">{h?.checks?.chain?.status} {h?.checks?.chain?.error || ''}</Row>
            <Row label="Executor">{h?.checks?.executor?.status}</Row>
            <Row label="RL engine">{h?.checks?.rlEngine?.status}</Row>
            <Row label="Indexed to block">{h?.checks?.indexer?.lastSyncedBlock ?? '—'}</Row>
            </details>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader title="Who can authorize payments?" />
        <CardContent className="text-xs text-slate-600 space-y-2">
          <Row label="Network">{config.networkName} ({config.chainId})</Row>
          <Row label="Contract">{config.contractAddress}</Row>
          <Row label="Agent executor key (backend)">{config.executorAddress || 'not configured'}</Row>
          <Row label="Contract version">{config.contractVersion === 2 ? 'v2: owner signatures verified on-chain' : config.contractVersion === 1 ? 'v1: owner approvals verified by the backend only' : 'unknown'}</Row>
          <ul className="list-disc pl-5 space-y-1 pt-2">
            <li>{isDemo ? 'The team holds separate demo owner and agent keys in backend secrets. These are shared test funds, not funds in your personal custody.' : 'Your owner key never leaves your wallet. The backend never sees it.'}</li>
            {isDemo ? <li>You review and confirm each demo payment. The backend-controlled demo owner key signs it; the separate agent submits it. An invite and strict server and contract limits are required.</li> : config.contractVersion === 2 ? (
              <li>The backend holds only the agent key. The contract accepts a transfer from it only with your EIP-712 signature for that exact transfer (or a bounded task grant you signed), verified on-chain, and only to allowlisted recipients, in enabled assets, within per-transaction and daily caps, once per intent.</li>
            ) : (
              <li>The backend holds only the agent key, which the v1 contract limits to executeTransfer: allowlisted recipients, enabled assets, per-transaction and daily caps, once per intent. On v1 your signature is checked by the backend, not the contract.</li>
            )}
            <li>Every approval is bound to the recipient, amount, asset and deadline. A payment cannot execute after its deadline.</li>
            <li>{isDemo ? 'Only the team admin can stop this shared sandbox or change its access rules. You can revoke your own automatic payment permission.' : 'Use the Security page to pause payments or activate the emergency stop as the wallet owner.'}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
