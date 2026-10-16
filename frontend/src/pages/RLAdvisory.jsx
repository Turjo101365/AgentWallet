import React, { useState } from 'react';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useApp } from '../app/providers.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { get, post, describeError } from '../lib/api.js';

const METRICS = [
  ['mean_fee_saving_pct', 'Fee saving vs. executing immediately (%)'],
  ['fee_saving_pct_ci95', '95% CI (bootstrap)'],
  ['mean_objective_gain', 'Objective gain (fee + delay cost)'],
  ['mean_wait_steps', 'Mean wait (steps of 15 min)'],
  ['forced_at_deadline_pct', 'Forced at deadline (%)'],
  ['pct_episodes_worse_than_immediate', 'Episodes worse than immediate (%)'],
  ['mean_regret_vs_oracle', 'Regret vs hindsight oracle'],
];
const fmt = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : v ?? '—');

function ResultsTable({ results }) {
  const cols = Object.keys(results).filter((k) => k !== 'oracle_hindsight');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead><tr className="text-left text-slate-400 uppercase text-[10px] border-b border-slate-100"><th className="py-2">Metric</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {METRICS.map(([k, label]) => (
            <tr key={k} className="border-b border-slate-50"><td className="py-1.5 font-sans text-slate-600">{label}</td>{cols.map((c) => <td key={c}>{fmt(results[c][k])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {results.oracle_hindsight && <p className="text-[11px] text-slate-400 mt-2">Hindsight oracle: {results.oracle_hindsight.mean_fee_saving_pct}% fee saving. {results.oracle_hindsight.note}</p>}
    </div>
  );
}

export function RLAdvisory() {
  const { isOwner } = useApp();
  const models = usePolling(() => get('/rl/models'), 30000);
  const [evaluation, setEvaluation] = useState(null);
  const [preview, setPreview] = useState(null);
  const [windowMin, setWindowMin] = useState(120);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function run(name, fn) {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Execution timing · advisory only" title="RL execution timing">
        PPO and DQN policies decide <em>when</em> an already-authorized payment is submitted inside its execution window, to pay lower network fees. They cannot choose recipients or amounts, cannot skip the deadline, and never bypass policy checks.
      </PageHeader>
      {error && <Alert variant="error">{error}</Alert>}
      {models.error && <Alert variant="warning" title="RL service unavailable">{describeError(models.error)}. Scheduled payments still run; they execute at the start of their window without timing advice.</Alert>}

      <div className="grid lg:grid-cols-2 gap-6">
        {models.data?.map((m) => (
          <Card key={m.name}>
            <CardHeader title={m.name} badge={m.status === 'available' ? <Badge variant="success">trained checkpoint loaded</Badge> : <Badge variant="error">unavailable</Badge>} />
            <CardContent className="text-xs space-y-2">
              {m.status !== 'available' && <div className="text-rose-700">{m.reason}</div>}
              {m.version && (
                <div className="font-mono text-slate-600 space-y-0.5">
                  <div>version {m.version}</div>
                  <div>trained {m.trained_at} · {m.total_timesteps?.toLocaleString()} steps · seed {m.seed}</div>
                  <div>{m.libraries && Object.entries(m.libraries).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
                  <div className="text-amber-800">{m.data}</div>
                </div>
              )}
              {m.test_metrics && (
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Held-out test set ({m.test_set?.episodes} episodes, seeds from {m.test_set?.seed_start})</div>
                  <ResultsTable results={{ [m.name.toLowerCase()]: m.test_metrics, ...m.baselines }} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Fresh evaluation" subtitle="Runs all available policies and baselines on new held-out simulator episodes (synthetic gas, not market data)." />
        <CardContent className="space-y-3">
          <Button variant="secondary" disabled={!isOwner || Boolean(busy)} onClick={() => run('eval', async () => setEvaluation(await post('/rl/evaluate', { episodes: 500 })))}>
            {busy === 'eval' ? 'Evaluating…' : 'Run 500 episodes'}
          </Button>
          {evaluation && <ResultsTable results={evaluation.results} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Live timing advice" subtitle="What the active policy would advise now, from gas samples the backend recorded on this chain." />
        <CardContent className="space-y-3 text-xs">
          <div className="flex gap-2 items-center">
            <span>Window</span>
            <input className="w-20 px-2 py-1 border border-slate-200 rounded font-mono" value={windowMin} onChange={(e) => setWindowMin(e.target.value)} />
            <span>minutes</span>
            <Button size="sm" disabled={Boolean(busy)} onClick={() => run('preview', async () => setPreview(await post('/rl/timing-preview', { windowSeconds: Math.max(60, Number(windowMin) * 60) })))}>Ask</Button>
          </div>
          {preview && (
            <div className="font-mono bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
              <div>status: {preview.status} · advice: {preview.advice ?? 'none'} · {preview.agentType} {preview.modelVersion || ''}</div>
              <div>{preview.reason}</div>
              <div>gas samples used: {preview.samples} · steps remaining {preview.stepsRemaining}/{preview.windowSteps}</div>
              {preview.actionProbabilities && <div>P(wait) {preview.actionProbabilities[0].toFixed(3)} · P(execute) {preview.actionProbabilities[1].toFixed(3)}</div>}
              {preview.qValues && <div>Q(wait) {preview.qValues[0].toFixed(3)} · Q(execute) {preview.qValues[1].toFixed(3)}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
