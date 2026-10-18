import React,{useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {formatEther} from 'ethers';
import {useApp} from '../app/providers.jsx';
import {usePolling} from '../hooks/usePolling.js';
import {get,post,put,describeError} from '../lib/api.js';
import {Card,CardContent,PageHeader} from '../components/ui/Card.jsx';
import {Button,LinkButton} from '../components/ui/Button.jsx';
import {Alert} from '../components/ui/Alert.jsx';

const eth=v=>v==null?'Unavailable':`${formatEther(BigInt(v))} ETH`;
const empty={recipientLabel:'',recipient:'',amount:'',dueAt:'',priority:'NORMAL',description:''};
const prompts=['Analyze my treasury','What can I safely spend?','Prioritize my upcoming payments','Forecast my balance','Why was this payment blocked?'];
const statusLabel={SCHEDULED:'Authorized / queued',AWAITING_APPROVAL:'Payment needs approval',PAID:'Paid — verified receipt',PLANNED:'Planned',UPCOMING:'Upcoming',DEFERRED:'Deferred',CANCELLED:'Cancelled',FAILED:'Failed / rejected'};

export function TreasuryManager(){
  const {isOwner,isDemo,demo}=useApp(),navigate=useNavigate();
  const [days,setDays]=useState(7),[form,setForm]=useState(empty),[editing,setEditing]=useState(null),[reserve,setReserve]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
  const [editStatus,setEditStatus]=useState('UPCOMING');
  const [loosen,setLoosen]=useState(false);
  const state=usePolling(()=>get(`/treasury?days=${days}`),15000,[days]);
  const data=state.data,canManage=isOwner||(isDemo&&demo?.executionAllowed);
  const act=async fn=>{setBusy(true);setError(null);try{await fn();await state.refresh();}catch(e){setError(describeError(e));}finally{setBusy(false);}};
  const saveReserve=confirm=>act(async()=>{try{await put('/treasury/reserve',{amount:reserve,...(confirm?{confirmLoosening:true}:{})});setLoosen(false);}catch(e){if(e.code==='LOOSENING_REQUIRES_OWNER_CONSOLE')setLoosen(true);throw e;}});
  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const save=e=>{e.preventDefault();act(async()=>{
    const body={...form,dueAt:new Date(form.dueAt).toISOString()};
    if(editing)await put(`/treasury/obligations/${editing.id}`,{...body,version:editing.version,state:editStatus});
    else await post('/treasury/obligations',body);
    setEditing(null);setForm(empty);
  });};
  const edit=o=>{setEditing(o);setEditStatus(o.status);const d=new Date(o.dueAt);setForm({recipientLabel:o.recipientLabel,recipient:o.recipient,amount:o.amount,dueAt:new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16),priority:o.priority,description:o.description});};
  const prepare=id=>act(async()=>{const r=await post(`/treasury/obligations/${id}/prepare`,{});setResult(r.proposal);if(r.proposal.status==='AWAITING_APPROVAL')navigate('/proposals');});
  return <div className="space-y-6 min-w-0">
    <PageHeader eyebrow="AI Treasury Manager" title="Protect what you need.">Know what you can spend, protect your reserve, and plan upcoming payments. {isDemo?'Shared Sepolia test ETH — no real money.':'Known ETH obligations for this treasury.'}</PageHeader>
    <div className="flex flex-wrap gap-3"><LinkButton to="/funding">Balance & funding</LinkButton><label>Planning period <select aria-label="Planning period" className="field" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Next 7 days</option><option value={30}>Next 30 days</option><option value={90}>Next 90 days</option></select></label></div>
    {(error||state.error)&&<Alert variant="error">{error||describeError(state.error)} <button onClick={()=>state.refresh()} className="underline">Retry</button></Alert>}
    {data&&state.error&&<Alert variant="warning">These are the last successfully read values. Refresh before making decisions; payments are always checked again on the server.</Alert>}
    {state.loading&&!data&&<p role="status">Reading your treasury and upcoming payments…</p>}
    {data&&<>
      <section aria-label="Treasury overview" className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[["Treasury balance",data.balanceWei,'bg-mint'],['Protected balance',data.reserveWei,'bg-lilac'],['Available to spend',data.availableWei,'bg-butter'],['Upcoming payments',data.upcomingWei,'bg-sky']].map(([title,value,color])=><Card key={title} className={color}><CardContent><h2 className="font-semibold">{title}</h2><p className="text-2xl break-words mt-3" data-testid={title}>{eth(value)}</p></CardContent></Card>)}
      </section>
      <Alert title={`Treasury health: ${data.health}`}>Available funds exclude the protected balance and approved or in-flight commitments ({eth(data.committedWei)}). They are not an execution guarantee: payment caps, invites, gas and authorization still apply.</Alert>
      <Card><CardContent className="space-y-4"><h2 className="text-2xl">Protected reserve</h2><p>This is an application-level payment rule. The treasury holds payment funds; a separate agent wallet pays gas. Direct owner withdrawals remain under the contract owner's control.</p>
        {isOwner&&!isDemo?<form onSubmit={e=>{e.preventDefault();saveReserve(false);}} className="flex flex-wrap gap-3 items-end"><label>Minimum ETH balance<input aria-label="Minimum ETH balance" className="field" inputMode="decimal" value={reserve} onChange={e=>{setReserve(e.target.value);setLoosen(false);}} required/></label><Button type="submit" disabled={busy}>Save protected balance</Button></form>:<p>{isDemo?'Only the allowlisted administrator can change this shared reserve.':'Sign in as the treasury owner to change this reserve.'}</p>}
        {loosen&&<Alert variant="warning" title="Lowering the reserve reduces protection"><p>The server minimum still applies. Confirm this specific lower reserve only if intended.</p><Button disabled={busy} onClick={()=>saveReserve(true)}>I understand, lower the reserve</Button><Button variant="secondary" disabled={busy} onClick={()=>setLoosen(false)}>Keep current reserve</Button></Alert>}
      </CardContent></Card>
      <Card><CardContent className="space-y-4"><h2 className="text-2xl">Upcoming payments</h2><p>An obligation records a bill; it is not proof of payment. Only a verified receipt marks it paid.</p>
        {!data.obligations.length&&<p>No obligations recorded. {canManage?'Add a supplier payment below.':'An authorized owner or invited demo session can add payments.'}</p>}
        <div className="space-y-3">{data.obligations.map(o=><article key={o.id} className="rounded-2xl border border-slate-200 p-4 space-y-2 min-w-0"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{o.recipientLabel} · {o.amount} ETH</h3><span>{statusLabel[o.status]||o.status}</span></div><p>Due {new Date(o.dueAt).toLocaleString()} · {o.priority.toLowerCase()} priority</p><p className="break-all font-mono">{o.recipient}</p>{o.description&&<p className="break-words">{o.description}</p>}{o.error&&<Alert variant="error">{o.error}</Alert>}
          {o.receiptUrl&&<a href={o.receiptUrl} target="_blank" rel="noreferrer" className="underline">{o.status==='PAID'?'View verified receipt':'Inspect transaction — not confirmed paid'}</a>}
          <div className="flex flex-wrap gap-2">{o.proposalId?<Link to="/proposals" className="underline">Review payment outcome →</Link>:canManage&&o.status!=='CANCELLED'&&<><Button disabled={busy} onClick={()=>edit(o)} variant="secondary">Edit</Button><Button disabled={busy} onClick={()=>act(()=>put(`/treasury/obligations/${o.id}`,{version:o.version,state:'CANCELLED'}))} variant="secondary">Cancel obligation</Button></>}</div>
        </article>)}</div>
        {canManage&&<form onSubmit={save} className="grid sm:grid-cols-2 gap-4 border-t pt-4">
          <h3 className="font-semibold sm:col-span-2">{editing?'Edit obligation':'Add an obligation'}</h3>
          <label>Recipient label<input aria-label="Recipient label" className="field" maxLength={80} value={form.recipientLabel} onChange={e=>change('recipientLabel',e.target.value)} required/></label>
          <label>Approved recipient address<input aria-label="Approved recipient address" className="field" value={form.recipient} onChange={e=>change('recipient',e.target.value)} required/></label>
          <label>Amount in ETH<input aria-label="Amount in ETH" className="field" inputMode="decimal" value={form.amount} onChange={e=>change('amount',e.target.value)} required/></label>
          <label>Due date and time (your local time)<input aria-label="Due date and time" className="field" type="datetime-local" value={form.dueAt} onChange={e=>change('dueAt',e.target.value)} required/></label>
          <label>Priority<select aria-label="Priority" className="field" value={form.priority} onChange={e=>change('priority',e.target.value)}><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></label>
          <label>Description (optional)<input aria-label="Description" className="field" maxLength={500} value={form.description} onChange={e=>change('description',e.target.value)}/></label>
          {editing&&<label>Obligation status<select aria-label="Obligation status" className="field" value={editStatus} onChange={e=>setEditStatus(e.target.value)}><option value="UPCOMING">Upcoming</option><option value="PLANNED">Planned — not authorized</option><option value="DEFERRED">Deferred</option><option value="CANCELLED">Cancelled</option></select></label>}
          <div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">{editing?'Save obligation':'Add obligation'}</Button>{editing&&<Button onClick={()=>{setEditing(null);setForm(empty);}} variant="secondary">Cancel editing</Button>}</div>
        </form>}
      </CardContent></Card>
      <Card><CardContent className="space-y-4"><h2 className="text-2xl">Recommended plan</h2><p>The trusted calculation puts overdue bills first, then high, normal and low priority; earlier due dates break ties. AI explains these results and cannot override them.</p>
        <div className="flex flex-wrap gap-2">{prompts.map(draft=><LinkButton key={draft} to="/agent" state={{draft}}>{draft}</LinkButton>)}</div>
        {!data.plan.payments.length&&<p>No unprepared payments within this period.</p>}
        {data.plan.payments.map(o=><div key={o.id} className={`rounded-2xl p-4 space-y-2 ${o.recommendation==='PAY'?'bg-mint':'bg-butter'}`}><h3 className="font-semibold">{o.recipientLabel} · {eth(o.amountWei)} · {o.recommendation==='PAY'?'Fits the plan':'Defer'}</h3><p>{o.reasons.join('; ')}</p>{canManage&&<Button variant="secondary" disabled={busy} onClick={()=>prepare(o.id)}>{o.recommendation==='PAY'?'Prepare for review':'Check payment policy'}</Button>}</div>)}
      </CardContent></Card>
      <Card><CardContent className="space-y-3"><h2 className="text-2xl">Projected balance</h2><dl className="grid sm:grid-cols-2 gap-3">{[['Current balance',data.balanceWei],['Already committed',data.committedWei],['Recommended outflows',data.plan.plannedOutflowWei],['Projected remaining balance',data.plan.projectedBalanceWei],['Protected reserve',data.reserveWei],['Amount above / below reserve',data.plan.aboveReserveWei]].map(([k,v])=><div key={k}><dt>{k}</dt><dd className="font-semibold break-words">{eth(v)}</dd></div>)}</dl><p>{data.plan.forecast}</p></CardContent></Card>
      {result&&result.status!=='AWAITING_APPROVAL'&&<Alert variant="warning" title="Payment was not authorized">{result.policyResult?.violations?.map(v=>v.message).join('; ')||result.status}</Alert>}
      <details className="technical-details"><summary>Calculation details and treasury activity</summary><p>{data.note}</p><p className="break-all">{data.network} · chain {data.chainId} · contract {data.contractAddress} · block {data.blockNumber}</p><p>Separate agent gas balance: {eth(data.agentGasWei)}. Per-payment cap: {eth(data.perTxLimitWei)}. Remaining daily contract capacity: {eth(data.dailyRemainingWei)}.</p><Link to="/audit" className="underline">Open recorded activity</Link></details>
    </>}
  </div>;
}
