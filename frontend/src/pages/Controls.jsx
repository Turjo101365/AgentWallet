import React, { useState } from 'react';
import { parseUnits, isAddress } from 'ethers';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { TxStatus } from '../components/wallet/TxStatus.jsx';
import { PolicySettingsCard } from '../components/wallet/PolicySettingsCard.jsx';
import { useApp } from '../app/providers.jsx';
import { useWalletState, useRecipients } from '../hooks/useData.js';
import { useOwnerTx } from '../hooks/useOwnerTx.js';
import { post, put, describeError } from '../lib/api.js';
import { truncateAddress, formatAmount } from '../utils/formatters.js';

const input = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary';
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

function LimitRow({ token, onSave, disabled }) {
  const [perTx, setPerTx] = useState(token.formatted.perTxLimit);
  const [daily, setDaily] = useState(token.formatted.dailyLimit);
  const [enabled, setEnabled] = useState(token.enabled);
  return (
    <div className="grid grid-cols-12 gap-2 items-end text-xs py-2 border-b border-slate-50 last:border-0">
      <div className="col-span-12 sm:col-span-2 font-semibold font-mono">{token.symbol}</div>
      <label className="col-span-5 sm:col-span-3 space-y-1 text-slate-500"><span>Per-tx cap</span><input className={input} value={perTx} onChange={(e) => setPerTx(e.target.value)} /></label>
      <label className="col-span-5 sm:col-span-3 space-y-1 text-slate-500"><span>Daily cap</span><input className={input} value={daily} onChange={(e) => setDaily(e.target.value)} /></label>
      <label className="col-span-2 sm:col-span-2 flex items-center gap-1.5 text-slate-600 pb-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> on</label>
      <div className="col-span-12 sm:col-span-2"><Button size="sm" disabled={disabled} onClick={() => onSave(token, perTx, daily, enabled)}>Save</Button></div>
    </div>
  );
}

export function Controls() {
  const { config, isOwner } = useApp();
  const wallet = useWalletState();
  const recipients = useRecipients();
  const tx = useOwnerTx();
  const [error, setError] = useState(null);
  const [newRecipient, setNewRecipient] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newAgent, setNewAgent] = useState('');
  const [offChainBusy, setOffChainBusy] = useState(false);
  const busy = !isOwner || ['signing', 'pending'].includes(tx.status);
  const s = wallet.data;

  const done = () => {
    wallet.refresh();
    recipients.refresh();
  };

  async function saveLimits(token, perTx, daily, enabled) {
    setError(null);
    try {
      if (enabled && (!DECIMAL.test(perTx) || !DECIMAL.test(daily))) throw new Error('Caps must be decimal amounts');
      const p = enabled ? parseUnits(perTx, token.decimals) : 0n;
      const d = enabled ? parseUnits(daily, token.decimals) : 0n;
      if (enabled && (p === 0n || d < p)) throw new Error('Per-tx cap must be > 0 and the daily cap must be >= per-tx cap');
      if (await tx.send(`Set ${token.symbol} limits`, ({ wallet: w }) => w.setTokenPolicy(token.address, enabled, p, d))) done();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addRecipient(e) {
    e.preventDefault();
    setError(null);
    try {
      if (!isAddress(newRecipient)) throw new Error('Recipient must be a valid address');
      const receipt = await tx.send(`Allowlist ${truncateAddress(newRecipient)}`, ({ wallet: w }) => w.setRecipient(newRecipient, true));
      if (receipt && newLabel) await put(`/recipients/${newRecipient}/label`, { label: newLabel });
      if (receipt) {
        setNewRecipient('');
        setNewLabel('');
        done();
      }
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function offChain(path) {
    setOffChainBusy(true);
    setError(null);
    try {
      await post(path, { reason: 'Operator console' });
      wallet.refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setOffChainBusy(false);
    }
  }

  if (!s) return <div className="text-sm text-slate-500">Loading on-chain state…</div>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Risk controls</h1>
        <p className="text-sm text-slate-500 mt-1">On-chain controls are owner transactions signed in your wallet and enforced by the contract.</p>
      </div>
      {!isOwner && <Alert variant="warning">You are signed in as a viewer. Only the contract owner ({truncateAddress(s.owner)}) can change controls.</Alert>}
      <TxStatus tx={tx} />
      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <CardHeader title="Emergency controls" />
        <CardContent className="flex flex-wrap gap-3 items-center text-xs">
          <span>Contract: {s.paused ? <Badge variant="error">Paused</Badge> : <Badge variant="success">Active</Badge>}</span>
          <Button variant="secondary" disabled={busy} onClick={() => tx.send(s.paused ? 'Unpause contract' : 'Pause contract', ({ wallet: w }) => (s.paused ? w.unpause() : w.pause())).then(done)}>
            {s.paused ? 'Unpause contract' : 'Pause contract'}
          </Button>
          <Button variant="danger" disabled={busy} icon="emergency" onClick={() => tx.send('Emergency stop', ({ wallet: w }) => w.emergencyStop()).then(done)}>
            Emergency stop (pause + revoke agent)
          </Button>
          <span className="ml-auto">Off-chain agent: {s.agentPaused?.paused ? <Badge variant="error">Paused</Badge> : <Badge variant="success">Active</Badge>}</span>
          <Button variant="secondary" disabled={!isOwner || offChainBusy} onClick={() => offChain(s.agentPaused?.paused ? '/agent/resume' : '/agent/pause')}>
            {s.agentPaused?.paused ? 'Resume agent' : 'Pause agent'}
          </Button>
        </CardContent>
      </Card>

      <PolicySettingsCard />

      <Card>
        <CardHeader title="Spending limits" subtitle="Per asset, enforced on-chain by executeTransfer" />
        <CardContent>
          {s.tokens.map((t) => (
            <LimitRow key={`${t.address}-${t.perTxLimit}-${t.dailyLimit}-${t.enabled}`} token={t} disabled={busy} onSave={saveLimits} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Recipient allowlist" subtitle="The agent can only pay these addresses (checked on-chain)" />
        <CardContent className="space-y-3">
          {recipients.data?.map((r) => (
            <div key={r.address} className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-50 pb-2">
              <span className="font-mono">{r.address}</span>
              <span className="text-slate-500">{r.label || 'no label'}</span>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => tx.send(`Remove ${truncateAddress(r.address)}`, ({ wallet: w }) => w.setRecipient(r.address, false)).then(done)}>
                Remove
              </Button>
            </div>
          ))}
          {recipients.data?.length === 0 && <div className="text-xs text-slate-500">No allowlisted recipients.</div>}
          <form onSubmit={addRecipient} className="grid sm:grid-cols-5 gap-2">
            <input className={`${input} sm:col-span-3`} placeholder="0x… recipient" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} />
            <input className={input} placeholder="Label" maxLength={80} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Button type="submit" disabled={busy}>Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Agent key" subtitle="The only key allowed to call executeTransfer. Must differ from the owner." />
        <CardContent className="space-y-3 text-xs">
          <div>
            Current agent: <span className="font-mono">{s.agent}</span>{' '}
            {s.executorIsOnChainAgent ? <Badge variant="success">matches backend executor</Badge> : <Badge variant="error">not the backend executor</Badge>}
          </div>
          <div>Backend executor: <span className="font-mono">{config.executorAddress || 'not configured'}</span></div>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} max-w-md`} placeholder="New agent 0x…" value={newAgent} onChange={(e) => setNewAgent(e.target.value)} />
            <Button disabled={busy || !isAddress(newAgent)} onClick={() => tx.send('Set agent', ({ wallet: w }) => w.setAgent(newAgent)).then(done)}>Set agent</Button>
            <Button variant="danger" disabled={busy} onClick={() => tx.send('Revoke agent', ({ wallet: w }) => w.revokeAgent()).then(done)}>Revoke agent</Button>
          </div>
          <p className="text-slate-400">Executor gas balance: {s.executorBalanceEth === null ? '—' : `${formatAmount(s.executorBalanceEth, 6)} ETH`}</p>
        </CardContent>
      </Card>
    </div>
  );
}
