import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Alert } from '../ui/Alert.jsx';
import { useApp } from '../../app/providers.jsx';
import { post, describeError } from '../../lib/api.js';

const input = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary';

/** Creates a transfer intent. The backend evaluates it against live on-chain limits and allowlist. */
export function NewProposalForm({ recipients = [], onCreated }) {
  const { config, isOwner } = useApp();
  const [token, setToken] = useState(config.tokens[0]?.address || '');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const tokenInfo = config.tokens.find((t) => t.address === token);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await post('/proposals', { token, recipient: recipient.trim(), amount: amount.trim(), ...(memo ? { memo } : {}) });
      setAmount('');
      setMemo('');
      onCreated?.(created);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New transfer intent" subtitle="Checked against on-chain caps, allowlist, balance and gas, then simulated, before it can be approved." />
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500 space-y-1">
              <span>Asset</span>
              <select className={input} value={token} onChange={(e) => setToken(e.target.value)}>
                {config.tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}{t.testOnly ? ' (test token)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500 space-y-1 sm:col-span-2">
              <span>Recipient (must be on the on-chain allowlist)</span>
              <input className={input} list="aw-recipients" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" required />
              <datalist id="aw-recipients">
                {recipients.map((r) => (
                  <option key={r.address} value={r.address}>{r.label || r.address}</option>
                ))}
              </datalist>
            </label>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500 space-y-1">
              <span>Amount ({tokenInfo?.symbol})</span>
              <input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.005" inputMode="decimal" required />
            </label>
            <label className="text-xs text-slate-500 space-y-1 sm:col-span-2">
              <span>Memo (optional)</span>
              <input className={input} value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} placeholder="Invoice #42" />
            </label>
          </div>
          {error && <Alert variant="error">{describeError(error)}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !isOwner} icon="add_task">
              {busy ? 'Evaluating…' : isOwner ? 'Create proposal' : 'Owner only'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
