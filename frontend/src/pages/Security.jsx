import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
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
  const { config, session, isOwner, signOut } = useApp();
  const health = usePolling(fetchHealth, 10000);
  const h = health.data;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Security</h1>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Session" />
          <CardContent>
            <Row label="Signed in as">{session?.address}</Row>
            <Row label="Role">{isOwner ? 'owner (contract owner)' : 'viewer'}</Row>
            <Row label="Expires">{formatDateTime(session?.expiresAt)}</Row>
            <div className="pt-3">
              <Button variant="secondary" onClick={signOut} icon="logout">Sign out and revoke session</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Backend health" badge={h ? <Badge variant={h.status === 'ok' ? 'success' : 'error'}>{h.status}</Badge> : null} />
          <CardContent>
            <Row label="Database">{h?.checks?.database?.status} ({h?.checks?.database?.engine})</Row>
            <Row label="Chain">{h?.checks?.chain?.status} {h?.checks?.chain?.error || ''}</Row>
            <Row label="Executor">{h?.checks?.executor?.status}</Row>
            <Row label="RL engine">{h?.checks?.rlEngine?.status}</Row>
            <Row label="Indexed to block">{h?.checks?.indexer?.lastSyncedBlock ?? '—'}</Row>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader title="How authority is split" />
        <CardContent className="text-xs text-slate-600 space-y-2">
          <Row label="Network">{config.networkName} ({config.chainId})</Row>
          <Row label="Contract">{config.contractAddress}</Row>
          <Row label="Agent executor key (backend)">{config.executorAddress || 'not configured'}</Row>
          <ul className="list-disc pl-5 space-y-1 pt-2">
            <li>Your owner key never leaves your wallet. The backend never sees it.</li>
            <li>The backend holds only the agent key, which the contract limits to executeTransfer: allowlisted recipients, enabled assets, per-transaction and daily caps, once per intent.</li>
            <li>Each transfer needs your EIP-712 signature over its exact recipient, amount, token and deadline.</li>
            <li>Pause the contract or use Emergency stop on the Risk controls page to stop the agent on-chain immediately.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
