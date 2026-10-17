import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useApp } from '../app/providers.jsx';
import { useRecipients, labelFor } from '../hooks/useData.js';
import { usePolling } from '../hooks/usePolling.js';
import { useOwnerTx } from '../hooks/useOwnerTx.js';
import { get, post, describeError } from '../lib/api.js';
import { truncateAddress, formatDateTime } from '../utils/formatters.js';

const input = 'field';
const TASK_VARIANT = { ACTIVE: 'success', PENDING_AUTHORIZATION: 'warning', PAUSED: 'warning', CANCELLED: 'neutral', COMPLETED: 'neutral', EXPIRED: 'neutral', FAILED: 'error' };
const RUN_VARIANT = { CONFIRMED: 'success', EXECUTING: 'warning', ESCALATED: 'warning', DEFERRED: 'warning', PENDING: 'warning', CLAIMED: 'warning', RETRY_WAIT: 'warning', FAILED: 'error', SKIPPED: 'neutral' };
const toUnix = (local) => Math.floor(new Date(local).getTime() / 1000);

function DemoAutomation() {
  const {demo}=useApp(), tasks=usePolling(()=>get('/tasks'),5000), recipients=useRecipients();
  const [amount,setAmount]=useState('0.0001'),[recipient,setRecipient]=useState(''),[error,setError]=useState(null);
  const running=useRef(false);
  const active=tasks.data?.some((t)=>t.status==='ACTIVE');
  const run=async()=>{if(running.current)return;running.current=true;try{await post('/automation/run-due',{});tasks.refresh();}catch(e){setError(describeError(e));}finally{running.current=false;}};
  useEffect(()=>{if(!active||!demo?.executionAllowed)return;const timer=setInterval(run,10000);return()=>clearInterval(timer);},[active,demo?.executionAllowed]);
  const act=async(fn)=>{try{setError(null);await fn();tasks.refresh();}catch(e){setError(describeError(e));}};
  return <div className="space-y-5"><PageHeader title="Automatic payments" eyebrow="You set the limits">Let your AI complete approved payments within the limits you set. Demo permissions allow up to two payments, 30 seconds apart, and expire after ten minutes. Keep this page open to process due payments; this free demo does not run unattended.</PageHeader>
    <Card><CardHeader title="Set up an automatic payment" subtitle="Choose who to pay and how much each payment may send."/><CardContent className="space-y-3"><label className="block text-sm font-semibold">Amount per payment (ETH)<input aria-label="Grant amount ETH" inputMode="decimal" className="field mt-1" value={amount} onChange={(e)=>setAmount(e.target.value)}/></label>
      <label className="block text-sm font-semibold">Approved recipient<select aria-label="Grant recipient" className="field" value={recipient} onChange={(e)=>setRecipient(e.target.value)}><option value="">Select approved recipient</option>{(recipients.data||[]).map((r)=><option key={r.address} value={r.address}>{r.label||r.address}</option>)}</select></label>
      <Button onClick={()=>act(()=>post('/tasks',{amount,recipient}))}>Prepare automatic payment</Button>
    </CardContent></Card>
    {error&&<Alert variant="error" title="We couldn’t complete that action"><details className="text-xs"><summary className="cursor-pointer">Technical details</summary>{error}</details></Alert>}
    {!tasks.data && !tasks.error && <p role="status" className="text-sm text-slate-600">Loading automatic payments…</p>}
    {tasks.data?.length===0 && <Card tone="lilac"><CardContent><h2 className="text-xl">No automatic payments yet</h2><p className="mt-2 text-sm">Set a spending limit and authorize your first schedule. No payment runs before you approve it.</p></CardContent></Card>}
    {!demo?.executionAllowed && <Alert title="Invite needed to send payments">You can explore here. Ask the team for a live-demo invite before authorizing an automatic payment.</Alert>}
    {(tasks.data||[]).map((t)=><Card key={t.id}><CardContent className="space-y-3"><h2 className="text-xl">{t.amountFormatted} ETH × {t.maxRuns} → {truncateAddress(t.recipient)}</h2><p className="text-sm">{t.status==='PENDING_AUTHORIZATION'?'Needs your approval':t.status.toLowerCase().replace(/_/g,' ')} · expires {formatDateTime(t.validUntil)} · {t.runsCount} payments processed</p><details className="technical-details"><summary>Authorization details</summary><p className="font-mono text-xs break-all">EIP-712 grant: {t.grantDigest || 'Not signed yet'}</p><p>Up to {t.maxRuns} payments. Each payment remains subject to spending and fee limits.</p></details>
      <p className="text-sm">You confirm the payment limit and recipient; the backend-controlled demo wallet signs the permission. Your personal wallet does not sign.</p>
      {t.status==='PENDING_AUTHORIZATION'&&<Button disabled={!demo?.executionAllowed} onClick={()=>window.confirm(`Authorize up to TWO ${t.amountFormatted} ETH payments to ${t.recipient} until ${formatDateTime(t.validUntil)} using the server demo key?`)&&act(()=>post('/tasks/'+t.id+'/confirm-grant',{confirm:true,digest:t.grantDigest}))}>Authorize these payments</Button>}
      {['ACTIVE','PAUSED'].includes(t.status)&&<Button variant="danger" onClick={()=>act(()=>post('/tasks/'+t.id+'/revoke-demo',{}))}>Revoke permission</Button>}
      {(t.runs||[]).map((r)=><div key={r.id} className="text-sm">{r.status} {r.proposalId&&<Link className="underline" to="/proposals">View payment and receipt</Link>}</div>)}
    </CardContent></Card>)}
    <Button disabled={!demo?.executionAllowed} onClick={run}>Check for due payments</Button>
  </div>;
}

function NewTaskForm({ recipients, onCreated }) {
  const { config, isOwner } = useApp();
  const [f, setF] = useState({ token: config.tokens[0].address, recipient: '', amount: '', title: '', type: 'interval', at: '', every: '86400', weekday: '1', hour: '9', minute: '0', maxRuns: '4', maxTotal: '', validDays: '30', windowMinutes: '0', rl: false, gas: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      let schedule;
      if (f.type === 'once' || f.gas) schedule = { type: 'once', at: f.at ? toUnix(f.at) : now + 60 };
      else if (f.type === 'interval') schedule = { type: 'interval', everySeconds: Number(f.every), startAt: f.at ? toUnix(f.at) : now + 60 };
      else schedule = { type: 'weekly', weekday: Number(f.weekday), hour: Number(f.hour), minute: Number(f.minute) };
      const created = await post('/tasks', {
        token: f.token,
        recipient: f.recipient,
        amount: f.amount,
        title: f.title || null,
        schedule,
        condition: f.gas ? { type: 'gas_below_gwei', gwei: f.gas } : null,
        maxRuns: f.maxRuns ? Number(f.maxRuns) : null,
        maxTotal: f.maxTotal || null,
        validUntil: now + Number(f.validDays) * 86400,
        executionWindowSeconds: Number(f.windowMinutes) * 60,
        useRlTiming: f.rl,
      });
      onCreated(created);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New scheduled or conditional payment" subtitle="Set clear limits and approve them in your wallet. Nothing runs before authorization." />
      <CardContent>
        <form onSubmit={submit} className="space-y-3 text-xs text-slate-500">
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="space-y-1"><span>Asset</span><select className={input} value={f.token} onChange={set('token')}>{config.tokens.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}</select></label>
            <label className="space-y-1 sm:col-span-2"><span>Approved recipient</span><select className={input} value={f.recipient} onChange={set('recipient')} required><option value="">—</option>{recipients.map((r) => <option key={r.address} value={r.address}>{r.label || r.address}</option>)}</select></label>
            <label className="space-y-1"><span>Amount per run</span><input className={input} value={f.amount} onChange={set('amount')} placeholder="0.002" required /></label>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="space-y-1"><span>Schedule</span><select className={input} value={f.type} onChange={set('type')}><option value="once">Once</option><option value="interval">Every N seconds</option><option value="weekly">Weekly (UTC)</option></select></label>
            {f.type !== 'weekly' && <label className="space-y-1"><span>{f.type === 'once' ? 'At' : 'Starting'} (local time)</span><input type="datetime-local" className={input} value={f.at} onChange={set('at')} /></label>}
            {f.type === 'interval' && <label className="space-y-1"><span>Every (seconds)</span><input className={input} value={f.every} onChange={set('every')} /></label>}
            {f.type === 'weekly' && (
              <>
                <label className="space-y-1"><span>Weekday</span><select className={input} value={f.weekday} onChange={set('weekday')}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
                <label className="space-y-1"><span>Hour / minute (UTC)</span><div className="flex gap-1"><input className={input} value={f.hour} onChange={set('hour')} /><input className={input} value={f.minute} onChange={set('minute')} /></div></label>
              </>
            )}
            <label className="space-y-1"><span>Only when gas below (gwei, optional)</span><input className={input} value={f.gas} onChange={set('gas')} placeholder="e.g. 5" /></label>
          </div>
          <div className="grid sm:grid-cols-5 gap-3">
            <label className="space-y-1"><span>Max runs</span><input className={input} value={f.maxRuns} onChange={set('maxRuns')} /></label>
            <label className="space-y-1"><span>Max total (optional)</span><input className={input} value={f.maxTotal} onChange={set('maxTotal')} /></label>
            <label className="space-y-1"><span>Valid for (days)</span><input className={input} value={f.validDays} onChange={set('validDays')} /></label>
            <label className="space-y-1"><span>Execution window (min)</span><input className={input} value={f.windowMinutes} onChange={set('windowMinutes')} /></label>
            <label className="flex items-center gap-2 pt-5 text-slate-700"><input type="checkbox" checked={f.rl} onChange={set('rl')} /> RL gas timing</label>
          </div>
          <input className={input} value={f.title} onChange={set('title')} placeholder="Title (optional)" maxLength={160} />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end"><Button type="submit" disabled={busy || !isOwner} icon="event_repeat">{busy ? 'Creating…' : 'Create task'}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function TaskCard({ task, recipients, onChanged }) {
  const { config, isOwner, getSigner } = useApp();
  const ownerTx = useOwnerTx();
  // Contract v2 verifies grants on-chain, so cancelling off-chain alone would leave the signed grant usable
  // by a compromised agent key until it expires. This revokes it on-chain (owner transaction), then cancels.
  const canRevokeOnChain = config?.contractVersion >= 2 && Boolean(task.grantDigest) && task.grantRevokedOnChain !== true
    && ['ACTIVE', 'PAUSED', 'CANCELLED'].includes(task.status);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function act(name, fn) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      onChanged();
      if (detail) setDetail(await get(`/tasks/${task.id}`));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  const revokeOnChain = () => act('revoke', async () => {
    const receipt = await ownerTx.send('Revoke task grant', ({ wallet }) => wallet.revokeGrant(task.grantDigest));
    if (!receipt) throw ownerTx.state.error || new Error('Revocation transaction was not confirmed');
    if (task.status !== 'CANCELLED') await post(`/tasks/${task.id}/cancel`, { reason: 'Grant revoked on-chain by owner' });
  });

  const authorize = () => act('authorize', async () => {
    const signer = await getSigner();
    const { domain, types, message } = task.grantTypedData;
    await post(`/tasks/${task.id}/authorize`, { signature: await signer.signTypedData(domain, types, message) });
  });

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <div className="flex items-center gap-2"><Badge variant={TASK_VARIANT[task.status] || 'neutral'}>{task.status}</Badge><span className="text-[11px] font-mono text-slate-400">{task.kind} · {task.source}</span></div>
            <div className="font-semibold text-slate-800 mt-1">{task.title}</div>
            <div className="text-xs text-slate-500 font-mono">{task.amountFormatted} {task.token.symbol} → {labelFor(recipients, task.recipient) || truncateAddress(task.recipient)} · {task.scheduleDescription}{task.condition ? ` · when gas < ${task.condition.gwei} gwei` : ''}</div>
            <div className="text-xs text-slate-500">Runs {task.runsCount}{task.maxRuns ? `/${task.maxRuns}` : ''} · next {task.nextRunAt ? formatDateTime(task.nextRunAt) : '—'} · valid until {formatDateTime(task.validUntil)}{task.useRlTiming ? ` · RL timing within ${task.executionWindowSeconds / 60} min` : ''}</div>
            {task.statusReason && <div className="text-xs text-amber-800 mt-1">{task.statusReason}</div>}
            {task.grantRevokedOnChain && <div className="text-xs text-slate-600 mt-1">Grant revoked on-chain: the contract will refuse every remaining run.</div>}
          </div>
          <div className="flex gap-2 items-start flex-wrap">
            {task.status === 'PENDING_AUTHORIZATION' && <Button size="sm" disabled={!isOwner || busy} onClick={authorize} icon="draw">{busy === 'authorize' ? 'Sign in wallet…' : 'Sign grant'}</Button>}
            {task.status === 'ACTIVE' && <Button size="sm" variant="secondary" disabled={!isOwner || busy} onClick={() => act('pause', () => post(`/tasks/${task.id}/pause`, {}))}>Pause</Button>}
            {task.status === 'PAUSED' && <Button size="sm" variant="secondary" disabled={!isOwner || busy} onClick={() => act('resume', () => post(`/tasks/${task.id}/resume`, {}))}>Resume</Button>}
            {['PENDING_AUTHORIZATION', 'ACTIVE', 'PAUSED'].includes(task.status) && <Button size="sm" variant="danger" disabled={!isOwner || busy} onClick={() => act('cancel', () => post(`/tasks/${task.id}/cancel`, {}))}>Cancel</Button>}
            {canRevokeOnChain && <Button size="sm" variant="danger" disabled={!isOwner || busy} onClick={revokeOnChain} icon="block">{busy === 'revoke' ? 'Confirm in wallet…' : 'Revoke grant on-chain'}</Button>}
            <Button size="sm" variant="secondary" onClick={async () => setDetail(detail ? null : await get(`/tasks/${task.id}`))}>{detail ? 'Hide runs' : 'Runs'}</Button>
          </div>
        </div>
        {task.status === 'PENDING_AUTHORIZATION' && (
          <div className="text-[11px] text-slate-500">Signing authorizes up to {task.maxRuns ?? '∞'} runs of exactly {task.amountFormatted} {task.token.symbol} to this one address until {formatDateTime(task.validUntil)}. Runs above your auto-approval limit still need approval.</div>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        {detail?.onChainGrant && (
          <div className="text-[11px] text-slate-500 font-mono">
            On-chain grant: {detail.onChainGrant.runs} run{detail.onChainGrant.runs === 1 ? '' : 's'} executed{detail.onChainGrant.revoked ? ' · REVOKED' : ''} · digest {truncateAddress(task.grantDigest, 10, 6)}
          </div>
        )}
        {detail && (
          <div className="space-y-1.5 text-xs">
            {detail.runs.length === 0 && <div className="text-slate-400">No runs yet.</div>}
            {detail.runs.map((r) => (
              <div key={r.id} className="border border-slate-100 rounded p-2 space-y-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant={RUN_VARIANT[r.status] || 'neutral'}>{r.status}</Badge>
                  <span className="font-mono text-slate-500">{formatDateTime(r.scheduledFor)} · attempt {r.attempt}</span>
                  {r.proposalId && <Link className="underline" to="/proposals">proposal {r.proposalId.slice(0, 8)}</Link>}
                </div>
                {r.decision?.headline && <div className="text-slate-700">{r.decision.headline}</div>}
                {r.decision?.approvalRoute?.reasons && <div className="text-slate-500">Approval route: {r.decision.approvalRoute.route} — {r.decision.approvalRoute.reasons.join('; ')}</div>}
                {r.timingAdvice && <div className="text-slate-500">Timing: {r.timingAdvice.reason}</div>}
                {r.errorCode && <div className="text-rose-700 font-mono">{r.errorCode}: {r.errorMessage}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Automation() {
  const { isOwner,isDemo,personal } = useApp();
  const tasks = usePolling(() => get('/tasks'), 5000);
  const automation = usePolling(() => get('/automation'), 5000);
  const recipients = useRecipients();
  const [error, setError] = useState(null);
  const paused = automation.data?.paused;

  async function toggle() {
    setError(null);
    try {
      await post(paused ? '/automation/resume' : '/automation/pause', { reason: 'Operator console' });
      automation.refresh();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if(isDemo)return <DemoAutomation/>;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Approved payment schedules"
        title="Automatic payments"
        actions={
          <>
          {automation.data && (paused ? <Badge variant="error">Automation paused</Badge> : <Badge variant="success">Automation on</Badge>)}
          <Button variant={paused ? 'primary' : 'danger'} disabled={!isOwner} onClick={toggle} icon={paused ? 'play_arrow' : 'pause'}>{paused ? 'Resume automation' : 'Stop all automated payments'}</Button>
          </>
        }
      >
        Set the recipient, amount, schedule and total limit. Approve a bounded permission in your wallet before any automatic payment can run. You can pause or revoke it.
      </PageHeader>
      {paused && automation.data?.reason && <Alert variant="warning">Paused: {automation.data.reason} ({automation.data.by})</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {personal&&<Button onClick={()=>post('/automation/run-due',{}).then(()=>tasks.refresh()).catch((e)=>setError(describeError(e)))}>Check for due authorized payments</Button>}
      <NewTaskForm recipients={recipients.data || []} onCreated={() => tasks.refresh()} />
      <div className="space-y-4">
        {tasks.data?.map((t) => <TaskCard key={t.id} task={t} recipients={recipients.data} onChanged={tasks.refresh} />)}
        {tasks.data?.length === 0 && <div className="text-sm text-slate-500">No automatic payments yet. Set a limit and authorize your first schedule.</div>}
      </div>
    </div>
  );
}
