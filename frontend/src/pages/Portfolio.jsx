import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useApp } from '../app/providers.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { get, put, describeError } from '../lib/api.js';
import { formatAmount, truncateAddress, formatDateTime } from '../utils/formatters.js';

const input = 'w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono';
const SEVERITY = { warning: 'warning', info: 'info', error: 'error' };

function Bar({ pct, target }) {
  return (
    <div className="relative h-2 bg-slate-100 rounded w-32">
      <div className="absolute inset-y-0 left-0 bg-primary rounded" style={{ width: `${Math.min(100, pct || 0)}%` }} />
      {target !== null && target !== undefined && <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-700" style={{ left: `${Math.min(100, target)}%` }} title={`target ${target}%`} />}
    </div>
  );
}

export function Portfolio() {
  const { isOwner } = useApp();
  const overview = usePolling(() => get('/portfolio'), 10000);
  const [days, setDays] = useState(30);
  const spending = usePolling(() => get(`/portfolio/spending?days=${days}`), 15000, [days]);
  const history = usePolling(() => get('/portfolio/history'), 60000);
  const [targets, setTargets] = useState({});
  const [error, setError] = useState(null);
  const o = overview.data;

  async function saveTargets() {
    setError(null);
    try {
      const payload = Object.fromEntries(Object.entries(targets).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
      await put('/portfolio/targets', { targets: payload });
      overview.refresh();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Portfolio</h1>
        <p className="text-sm text-slate-500 mt-1">Balances read on-chain. USD values only where a price feed is configured; every price shows its source and age.</p>
      </div>
      {overview.error && <Alert variant="error">{describeError(overview.error)}</Alert>}
      {o && (
        <>
          <div className="grid sm:grid-cols-4 gap-4">
            <Card><CardContent><div className="text-[11px] uppercase text-slate-400">Total value</div><div className="text-2xl font-bold font-mono">{o.totalUsd ? `$${formatAmount(o.totalUsd, 2)}` : '—'}</div><div className="text-[11px] text-slate-400">{o.valuationNote}</div></CardContent></Card>
            <Card><CardContent><div className="text-[11px] uppercase text-slate-400">Largest allocation</div><div className="text-2xl font-bold font-mono">{o.exposure.largestAllocationPct ?? '—'}%</div></CardContent></Card>
            <Card><CardContent><div className="text-[11px] uppercase text-slate-400">Agent daily capacity</div><div className="text-2xl font-bold font-mono">${formatAmount(o.exposure.agentDailyCapacityUsd, 2)}</div><div className="text-[11px] text-slate-400">{o.exposure.agentDailyCapacityPctOfPortfolio ?? '—'}% of portfolio (sum of daily caps)</div></CardContent></Card>
            <Card><CardContent><div className="text-[11px] uppercase text-slate-400">Executor gas runway</div><div className="text-2xl font-bold font-mono">{o.exposure.executorTxRunway ?? '—'}</div><div className="text-[11px] text-slate-400">transfers at current gas ({formatAmount(o.exposure.executorGasEth, 6)} ETH)</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader title="Assets" subtitle={`Block ${o.blockNumber}`} />
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead><tr className="text-left text-slate-400 uppercase text-[10px] border-b border-slate-100"><th className="py-2">Asset</th><th className="text-right">Balance</th><th className="text-right">Price (USD)</th><th>Source</th><th className="text-right">Value</th><th>Allocation vs target</th><th className="text-right">Scheduled 7d</th><th>Target %</th></tr></thead>
                <tbody>
                  {o.assets.map((a) => (
                    <tr key={a.address} className="border-b border-slate-50">
                      <td className="py-2 font-semibold">{a.symbol}{a.testOnly && <span className="text-amber-700 text-[10px]"> test</span>}</td>
                      <td className="text-right">{a.balanceFormatted}</td>
                      <td className="text-right">{a.price.usd ? formatAmount(a.price.usd, 4) : '—'}</td>
                      <td className="text-[10px] text-slate-500 max-w-[200px]">{a.price.usd ? `${a.price.source} · ${a.price.ageSeconds}s old${a.price.stale ? ' (STALE)' : ''}` : a.price.reason}</td>
                      <td className="text-right">{a.valueUsd ? `$${formatAmount(a.valueUsd, 2)}` : '—'}</td>
                      <td><div className="flex items-center gap-2"><Bar pct={a.allocationPct} target={a.target} /><span>{a.allocationPct ?? '—'}%</span>{a.driftPct !== null && <span className={Math.abs(a.driftPct) >= 10 ? 'text-amber-700' : 'text-slate-400'}>({a.driftPct > 0 ? '+' : ''}{a.driftPct})</span>}</div></td>
                      <td className="text-right">{a.projectedOutflow7d}{a.coverage7d !== null && a.coverage7d < 1 ? <span className="text-rose-700"> !</span> : ''}</td>
                      <td><input className={input} disabled={!isOwner} defaultValue={a.target ?? ''} onChange={(e) => setTargets({ ...targets, [a.address]: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between items-center mt-3">
                <span className="text-[11px] text-slate-400">Targets must sum to 100. AgentWallet does not execute swaps, so drift is reported, not auto-rebalanced.</span>
                <Button size="sm" variant="secondary" disabled={!isOwner} onClick={saveTargets}>Save targets</Button>
              </div>
              {error && <Alert variant="error" className="mt-2">{error}</Alert>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Suggestions" subtitle="Advisory. Nothing here executes automatically." />
            <CardContent className="space-y-2">
              {o.suggestions.length === 0 && <div className="text-xs text-slate-500">No suggestions right now.</div>}
              {o.suggestions.map((s, i) => (
                <Alert key={i} variant={SEVERITY[s.severity] || 'info'} title={s.kind.replace(/_/g, ' ').toLowerCase()}>{s.message}{s.actionable === 'not_supported' ? ' (not supported by AgentWallet)' : ''}</Alert>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader
          title="Spending analytics"
          subtitle={spending.data?.source}
          action={<select className="text-xs border border-slate-200 rounded px-2 py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select>}
        />
        <CardContent className="grid md:grid-cols-3 gap-4 text-xs">
          <div><div className="font-semibold mb-1">Totals</div>{Object.entries(spending.data?.totals || {}).map(([k, v]) => <div key={k} className="font-mono">{v} {k}</div>)}{spending.data && !Object.keys(spending.data.totals).length && <div className="text-slate-400">No agent transfers.</div>}</div>
          <div><div className="font-semibold mb-1">By category</div>{Object.entries(spending.data?.byCategory || {}).map(([c, m]) => <div key={c} className="font-mono">{c}: {Object.entries(m).map(([k, v]) => `${v} ${k}`).join(', ')}</div>)}</div>
          <div><div className="font-semibold mb-1">By recipient</div>{Object.entries(spending.data?.byRecipient || {}).map(([r, v]) => <div key={r} className="font-mono">{v.label || truncateAddress(r)}: {Object.entries(v.totals).map(([k, x]) => `${x} ${k}`).join(', ')}</div>)}</div>
          <div className="md:col-span-3">
            <div className="font-semibold mb-1">Per day</div>
            {Object.entries(spending.data?.byDay || {}).map(([d, m]) => <div key={d} className="font-mono">{d}: {Object.entries(m).map(([k, v]) => `${v} ${k}`).join(', ')}</div>)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Balance history" subtitle={history.data?.source} />
        <CardContent className="grid md:grid-cols-2 gap-4 text-xs font-mono">
          {Object.entries(history.data?.points || {}).map(([sym, pts]) => (
            <div key={sym}>
              <div className="font-semibold mb-1">{sym} ({pts.length} snapshots)</div>
              {pts.slice(-8).map((p) => <div key={p.takenAt}>{formatDateTime(p.takenAt)} · {p.balanceFormatted}{p.priceUsd ? ` @ $${p.priceUsd}` : ''}</div>)}
              {pts.length === 0 && <div className="text-slate-400">No snapshots yet; the backend records one every 15 minutes.</div>}
            </div>
          ))}
        </CardContent>
      </Card>
      {o?.exposure.stalePrices?.length > 0 && <Badge variant="warning">Stale prices: {o.exposure.stalePrices.join(', ')}</Badge>}
    </div>
  );
}
