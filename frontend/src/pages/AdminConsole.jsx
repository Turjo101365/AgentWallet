import React, { useEffect, useState } from 'react';
import { useApp } from '../app/providers.jsx';
import { AccessGate } from '../components/wallet/AccessGate.jsx';
import { get, post, put, describeError } from '../lib/api.js';
import { Card, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';

export function AdminConsole() {
  const { session }=useApp();
  const [allowed,setAllowed]=useState(false),[data,setData]=useState(null),[error,setError]=useState(null),[invite,setInvite]=useState(null);
  const [owner,setOwner]=useState(''),[address,setAddress]=useState('');
  const [deployBlock,setDeployBlock]=useState(''),[daily,setDaily]=useState('3');
  const [reserve,setReserve]=useState('');
  const [notice,setNotice]=useState(null);
  const refresh=async()=>{ setAllowed(false);try { await get('/admin/me',{root:true});setAllowed(true);setData(await get('/admin/demo',{root:true}));setError(null); }catch(e){setError(describeError(e));} };
  useEffect(()=>{if(session?.token)refresh();else setAllowed(false);},[session?.token]);
  const act=async(path,body)=>{try{const r=await post('/admin/'+path,body,{root:true});await refresh();return r;}catch(e){setError(describeError(e));}};
  return <AccessGate><div className="space-y-5"><PageHeader title="Demo administration" eyebrow="SIWE + server allowlist">The server verifies your wallet on every request. No frontend role grants privileges.</PageHeader>
    {error&&<Alert variant="error">{error}</Alert>}
    {allowed&&<Card><CardContent className="space-y-4">
      <p>Execution: {data?.status.executionEnabled?'enabled':'disabled'}. Funding ceilings are shown below; changing deployment funding requires separate approval.</p>
      <p>Effective protected treasury reserve: <strong>{data?.treasuryReserveEth??'Unavailable'} ETH</strong>. Server minimum: {data?.status.limits.minTreasuryEth??'Unavailable'} ETH. Payments use the higher of your saved reserve and the server minimum.</p>
      {notice&&<p role="status">{notice}</p>}
      <label>Protected treasury balance (ETH)<input aria-label="Protected treasury balance" className="field" inputMode="decimal" value={reserve} onChange={e=>setReserve(e.target.value)}/></label>
      <Button onClick={async()=>{setNotice(null);try{try{await put('/admin/demo/treasury/reserve',{amount:reserve},{root:true});}catch(e){if(e.code!=='LOOSENING_REQUIRES_OWNER_CONSOLE'||!window.confirm(`Lower the shared protected reserve to ${reserve} ETH? The server floor still applies.`))throw e;await put('/admin/demo/treasury/reserve',{amount:reserve,confirmLoosening:true},{root:true});}setNotice('Protected reserve saved. The effective reserve is shown above.');await refresh();}catch(e){setError(describeError(e));}}}>Save shared treasury reserve</Button>
      <p>This changes application payment policy only. It cannot lower the server's minimum reserve or alter the contract.</p>
      <p>Demo execution ceilings below: <code>minTreasuryEth</code> is the server minimum, not your saved protected reserve.</p>
      <pre className="text-xs overflow-auto">{JSON.stringify(data?.status.limits,null,2)}</pre>
      <label>Daily demo payment limit<input aria-label="Daily demo payment limit" type="number" min="0" className="field" value={daily} onChange={(e)=>setDaily(e.target.value)}/></label>
      <Button onClick={async()=>{try{await put('/admin/demo/limits',{dailyTxLimit:Number(daily)},{root:true});await refresh();}catch(e){setError(describeError(e));}}}>Set within approved ceiling</Button>
      <Button onClick={async()=>setInvite(await act('demo/invites',{label:'Judge invitation',maxSessions:1,expiresInHours:24}))}>Create single-use invite</Button>
      {invite?.code&&<Alert>Copy this code now; it is shown only once: <code>{invite.code}</code></Alert>}
      <div className="flex flex-wrap gap-2"><Button onClick={()=>act('demo/execution',{enabled:false})}>Disable execution</Button><Button onClick={()=>act('demo/execution',{enabled:true})}>Enable within approved limits</Button>
      <Button variant="danger" onClick={()=>window.confirm('Emergency-stop ONLY the separate demo sandbox on Sepolia?')&&act('demo/emergency',{action:'emergencyStop'})}>Emergency stop sandbox</Button></div>
      {data?.invites.map((i)=><div key={i.id} className="flex gap-3 text-sm">{i.label} · {i.sessions_used}/{i.max_sessions} · {i.revoked_at?'revoked':<button className="underline" onClick={()=>act('demo/invites/'+i.id+'/revoke',{})}>Revoke</button>}</div>)}
      <h2 className="text-xl">Register a personal sandbox</h2><p className="text-sm">Only a separate v2 contract whose actual owner is the judge and whose agent is the approved relay. Registration does not deploy or fund it.</p>
      <input aria-label="Personal owner" className="field" value={owner} onChange={(e)=>setOwner(e.target.value)} placeholder="Judge owner address"/>
      <input aria-label="Personal sandbox contract" className="field" value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Separate sandbox contract"/>
      <input aria-label="Sandbox deployment block" className="field" value={deployBlock} onChange={(e)=>setDeployBlock(e.target.value)} placeholder="Actual deployment block"/>
      <Button onClick={()=>act('personal',{owner,address,deployBlock:Number(deployBlock),enabled:true})}>Verify and register</Button>
    </CardContent></Card>}
  </div></AccessGate>;
}
