import React from 'react';
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
  const { config, session, isOwner, signOut } = useApp();
  const health = usePolling(fetchHealth, 10000);
  const h = health.data;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Authority & sessions" title="Security">
        Who holds which key, what this session may do, and whether every backend dependency is healthy.
      </PageHeader>
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
          <Row label="Contract version">{config.contractVersion === 2 ? 'v2: owner signatures verified on-chain' : config.contractVersion === 1 ? 'v1: owner approvals verified by the backend only' : 'unknown'}</Row>
          <ul className="list-disc pl-5 space-y-1 pt-2">
            <li>Your owner key never leaves your wallet. The backend never sees it.</li>
            {config.contractVersion === 2 ? (
              <li>The backend holds only the agent key. The contract accepts a transfer from it only with your EIP-712 signature for that exact transfer (or a bounded task grant you signed), verified on-chain, and only to allowlisted recipients, in enabled assets, within per-transaction and daily caps, once per intent.</li>
            ) : (
              <li>The backend holds only the agent key, which the v1 contract limits to executeTransfer: allowlisted recipients, enabled assets, per-transaction and daily caps, once per intent. On v1 your signature is checked by the backend, not the contract.</li>
            )}
            <li>Each transfer needs your EIP-712 signature over its exact recipient, amount, token and execution deadline; it is never executed after that deadline.</li>
            <li>Pause the contract or use Emergency stop on the Risk controls page to stop the agent on-chain immediately.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
