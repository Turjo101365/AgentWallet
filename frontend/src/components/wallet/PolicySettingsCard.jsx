import React, { useEffect, useState } from 'react';
import { parseUnits, formatUnits } from 'ethers';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Alert } from '../ui/Alert.jsx';
import { useApp } from '../../app/providers.jsx';
import { get, put, describeError } from '../../lib/api.js';

const input = 'w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:bg-white focus:border-ink';
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

function toForm(settings, tokens) {
  const per = (map) => Object.fromEntries(tokens.map((t) => [t.address, map[t.address] !== undefined ? formatUnits(map[t.address], t.decimals) : '']));
  return {
    reserveFloors: per(settings.reserveFloors),
    autoApprovalMaxPerTx: per(settings.autoApprovalMaxPerTx),
    hourly: per(settings.circuitBreaker.hourlyAutonomousOutflow),
    maxConsecutiveFailures: String(settings.circuitBreaker.maxConsecutiveFailures),
    allowContractRecipients: settings.allowContractRecipients,
    dailyUsdLimit: settings.dailyUsdLimit ?? '',
  };
}

/**
 * Owner risk settings enforced by the backend policy engine (the contract caps are separate, on-chain).
 * Loosening changes are refused by the backend unless the owner explicitly confirms them here.
 */
export function PolicySettingsCard() {
  const { config, isOwner } = useApp();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [loosening, setLoosening] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = async () => setForm(toForm(await get('/policy'), config.tokens));
  useEffect(() => {
    load().catch((e) => setError(describeError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!form) return null;

  function payload() {
    const units = (map) => {
      const out = {};
      for (const t of config.tokens) {
        const v = map[t.address];
        if (v === '' || v === undefined) continue;
        if (!DECIMAL.test(v)) throw new Error(`${t.symbol}: "${v}" is not a decimal amount`);
        out[t.address] = parseUnits(v, t.decimals).toString();
      }
      return out;
    };
    return {
      reserveFloors: units(form.reserveFloors),
      autoApprovalMaxPerTx: units(form.autoApprovalMaxPerTx),
      allowContractRecipients: form.allowContractRecipients,
      dailyUsdLimit: form.dailyUsdLimit === '' ? null : form.dailyUsdLimit,
      circuitBreaker: { maxConsecutiveFailures: Number(form.maxConsecutiveFailures), hourlyAutonomousOutflow: units(form.hourly) },
    };
  }

  async function save(confirmLoosening = false) {
    setError(null);
    setSaved(false);
    try {
      await put('/policy', { ...payload(), ...(confirmLoosening ? { confirmLoosening: true } : {}) });
      setLoosening(null);
      setSaved(true);
      await load();
    } catch (err) {
      if (err.code === 'LOOSENING_REQUIRES_OWNER_CONSOLE') setLoosening(err.details?.loosening || [err.message]);
      else setError(describeError(err));
    }
  }

  const tokenField = (group, t) => (
    <input className={input} disabled={!isOwner} value={form[group][t.address]} placeholder="not set" onChange={(e) => setForm({ ...form, [group]: { ...form[group], [t.address]: e.target.value } })} />
  );

  return (
    <Card>
      <CardHeader title="Policy settings" subtitle="Enforced by the backend risk engine before anything is signed. The AI agent can only tighten these." />
      <CardContent className="space-y-4 text-xs">
        <table className="w-full">
          <thead><tr className="text-left text-[10px] uppercase text-slate-400"><th className="py-1">Asset</th><th>Reserve floor</th><th>Auto-approve task runs up to</th><th>Hourly autonomous outflow cap</th></tr></thead>
          <tbody>
            {config.tokens.map((t) => (
              <tr key={t.address}>
                <td className="py-1 font-mono font-semibold pr-2">{t.symbol}</td>
                <td className="pr-2">{tokenField('reserveFloors', t)}</td>
                <td className="pr-2">{tokenField('autoApprovalMaxPerTx', t)}</td>
                <td>{tokenField('hourly', t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-slate-400">Empty auto-approval means every task run needs your approval. Empty hourly cap means no breaker for that asset.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="space-y-1 text-slate-500"><span>Daily USD limit across assets (needs price feeds)</span><input className={input} disabled={!isOwner} value={form.dailyUsdLimit} placeholder="none" onChange={(e) => setForm({ ...form, dailyUsdLimit: e.target.value })} /></label>
          <label className="space-y-1 text-slate-500"><span>Pause a task after N consecutive failed runs</span><input className={input} disabled={!isOwner} value={form.maxConsecutiveFailures} onChange={(e) => setForm({ ...form, maxConsecutiveFailures: e.target.value })} /></label>
          <label className="flex items-center gap-2 pt-5 text-slate-700"><input type="checkbox" disabled={!isOwner} checked={form.allowContractRecipients} onChange={(e) => setForm({ ...form, allowContractRecipients: e.target.checked })} /> Allow contract recipients</label>
        </div>
        {loosening && (
          <Alert variant="warning" title="This change loosens your risk policy">
            {loosening.join('; ')}.
            <div className="mt-2 flex gap-2"><Button size="sm" variant="danger" onClick={() => save(true)}>I understand, apply it</Button><Button size="sm" variant="secondary" onClick={() => setLoosening(null)}>Cancel</Button></div>
          </Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        {saved && <Alert variant="info">Saved and recorded in the audit log.</Alert>}
        <div className="flex justify-end"><Button size="sm" disabled={!isOwner} onClick={() => save(false)}>Save policy</Button></div>
      </CardContent>
    </Card>
  );
}
