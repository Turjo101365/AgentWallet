import React,{StrictMode,useState} from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {id as fingerprint} from 'ethers';
import {AppProvider,useApp} from '../src/app/providers.jsx';
import {Welcome} from '../src/pages/Welcome.jsx';

const invite='isolated-one-use-fixture',token='d.'+'1'.repeat(64),sessionId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const expiresAt=()=>Math.floor(Date.now()/1000)+3600;
let requests,release,postFailure,configFailure,authFailure,authAllowed;
function reply(data,status=200){return {ok:status<400,status,json:async()=>status<400?{success:true,data}:{success:false,error:{code:'UNAUTHENTICATED',message:'Session invalid'}}};}
function Harness(){const app=useApp(),[error,setError]=useState(null);const concurrent=()=>Promise.all([app.startDemo(invite),app.startDemo(invite)]).catch(e=>setError(e.message));return <>
 {!app.isDemo?<Welcome/>:<h1>Demo session ready</h1>}
 <button onClick={concurrent}>Concurrent entry callers</button>
 <button onClick={()=>app.startDemo(invite).catch(e=>setError(e.message))}>Recover stored entry</button>
 {app.configError&&<><p>{app.configError}</p><button onClick={app.reloadConfig}>Retry configuration</button></>}
 {error&&<p>{error}</p>}
 <output data-testid="session-id">{app.demo?.sessionId||''}</output>
 <output data-testid="execution-eligible">{String(app.demo?.executionAllowed??false)}</output>
 </>;}
function mount(){return render(<StrictMode><MemoryRouter><AppProvider ethereum={null}><Harness/></AppProvider></MemoryRouter></StrictMode>);}
beforeEach(()=>{sessionStorage.clear();requests=[];release=null;postFailure=false;configFailure=false;authFailure=false;authAllowed=true;
 vi.stubGlobal('fetch',vi.fn(async(url,init={})=>{const path=new URL(String(url)).pathname;requests.push({path,method:init.method||'GET',body:init.body?JSON.parse(init.body):null});
  if(path==='/api/demo/session'){
   await new Promise(resolve=>{release=resolve;});if(postFailure)throw TypeError('network response lost');
   return reply({token,sessionId,executionAllowed:true,expiresAt:expiresAt(),limits:{maxTxPerSession:0}});
  }
  if(path==='/api/demo/sandbox/auth/session')return reply({id:sessionId,executionAllowed:authAllowed,expiresAt:expiresAt()},authFailure?401:200);
  if(path.endsWith('/config')){if(configFailure&&path.includes('/sandbox/'))throw TypeError('temporary config outage');return reply({appMode:'judge',chainId:11155111,chainReady:true});}
  throw Error('Unexpected test request: '+path);
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const posts=()=>requests.filter(r=>r.path==='/api/demo/session'&&r.method==='POST');
it('StrictMode lifecycle and rapid duplicate form submissions send exactly one creation request',async()=>{
 mount();await act(async()=>{});expect(posts()).toHaveLength(0);
 fireEvent.change(screen.getByLabelText(/Invite code/),{target:{value:invite}});
 const form=screen.getByRole('button',{name:/Enter with live transactions/}).closest('form');
 act(()=>{fireEvent.submit(form);fireEvent.submit(form);});await waitFor(()=>expect(posts()).toHaveLength(1));
 await act(async()=>release());await screen.findByText('Demo session ready');expect(posts()).toHaveLength(1);expect(screen.getByTestId('session-id').textContent).toBe(sessionId);
});
it('provider serializes concurrent entry callers even outside the Welcome button',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Concurrent entry callers'}));await waitFor(()=>expect(posts()).toHaveLength(1));await act(async()=>release());await screen.findByText('Demo session ready');expect(posts()).toHaveLength(1);
});
it('successful session persists across a full remount without a new session-creation POST',async()=>{
 let view=mount();fireEvent.click(screen.getByRole('button',{name:'Concurrent entry callers'}));await waitFor(()=>expect(release).toBeTypeOf('function'));await act(async()=>release());await screen.findByText('Demo session ready');
 view.unmount();view=mount();await screen.findByText('Demo session ready');expect(posts()).toHaveLength(1);expect(screen.getByTestId('session-id').textContent).toBe(sessionId);
});
it('configuration recovery uses GET only and keeps the successful invited session',async()=>{
 configFailure=true;mount();fireEvent.click(screen.getByRole('button',{name:'Concurrent entry callers'}));await waitFor(()=>expect(release).toBeTypeOf('function'));await act(async()=>release());await screen.findByRole('button',{name:'Retry configuration'});expect(JSON.parse(sessionStorage.getItem('aw.demo')).sessionId).toBe(sessionId);
 configFailure=false;fireEvent.click(screen.getByRole('button',{name:'Retry configuration'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Retry configuration'})).toBeNull());expect(posts()).toHaveLength(1);
});
it('a stored successful response is server-verified and restored without resubmitting the one-use invite',async()=>{
 sessionStorage.setItem('aw.demo',JSON.stringify({token,sessionId,executionAllowed:true,expiresAt:expiresAt(),entryFingerprint:fingerprint(invite),limits:{maxTxPerSession:0}}));
 mount();fireEvent.click(screen.getByRole('button',{name:'Recover stored entry'}));await screen.findByText('Demo session ready');expect(posts()).toHaveLength(0);expect(requests.filter(r=>r.path.endsWith('/auth/session'))).toHaveLength(1);
});
it('a forged or expired stored bearer is refused without creating a replacement session',async()=>{
 authFailure=true;sessionStorage.setItem('aw.demo',JSON.stringify({token,sessionId,expiresAt:expiresAt(),entryFingerprint:fingerprint(invite)}));mount();fireEvent.click(screen.getByRole('button',{name:'Recover stored entry'}));await screen.findByText('Session invalid');expect(posts()).toHaveLength(0);expect(screen.queryByText('Demo session ready')).toBeNull();
});
it('a revoked invite restores only backend-authorized explorer access, never cached execution eligibility',async()=>{
 authAllowed=false;sessionStorage.setItem('aw.demo',JSON.stringify({token,sessionId,executionAllowed:true,expiresAt:expiresAt(),entryFingerprint:fingerprint(invite)}));mount();fireEvent.click(screen.getByRole('button',{name:'Recover stored entry'}));await screen.findByText('Demo session ready');expect(screen.getByTestId('execution-eligible').textContent).toBe('false');expect(posts()).toHaveLength(0);
});
it('a lost creation response is shown as an error and never automatically retried by StrictMode',async()=>{
 postFailure=true;mount();fireEvent.change(screen.getByLabelText(/Invite code/),{target:{value:invite}});fireEvent.click(screen.getByRole('button',{name:/Enter with live transactions/}));await waitFor(()=>expect(release).toBeTypeOf('function'));await act(async()=>release());await screen.findByText(/Do not submit it again/);expect(posts()).toHaveLength(1);expect(sessionStorage.getItem('aw.demo')).toBeNull();
});
