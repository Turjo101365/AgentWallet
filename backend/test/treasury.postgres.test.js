// Opt-in: a disposable LOCAL PostgreSQL database, never an application's DATABASE_URL.
import {test,describe,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import request from 'supertest';
import {ethers} from 'ethers';
import {openDatabase} from '../src/db/index.js';
import {migrate} from '../src/db/migrate.js';
import {startTestChain,deployFixture} from './helpers/chain.js';
import {buildTestApp,signIn,signApproval,bearer,idemKey,tempDir,waitFor} from './helpers/app.js';

const url=process.env.AW_ISOLATED_PG_URL;
if(url){const u=new URL(url);if(!['localhost','127.0.0.1'].includes(u.hostname)||u.pathname!=='/aw_release')throw Error('Refusing a non-isolated PostgreSQL target');}
const migrations=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
const schema=()=>`aw_rel_${crypto.randomBytes(8).toString('hex')}`;

describe('isolated PostgreSQL treasury release checks',{skip:!url&&'AW_ISOLATED_PG_URL required; no production fallback'},()=>{
 let chain,fx,ctx,token,scope,instances;
 before(async()=>{chain=await startTestChain();});
 after(async()=>chain?.stop());
 beforeEach(async()=>{fx=await deployFixture(chain.provider);scope=schema();instances=new Set();ctx=await openApp();token=await signIn(ctx.app,fx.owner);});
 afterEach(async()=>{await chain.send('evm_setAutomine',[true]);for(const c of instances)await c.container.close();});
 async function openApp(env={}){const c=await buildTestApp({rpcUrl:chain.rpcUrl,deployment:fx.deployment,env:{DATABASE_URL:url,DB_SCHEMA:scope,RECEIPT_TIMEOUT_MS:'20000',...env}});instances.add(c);return c;}
 async function closeApp(c){await c.container.close();instances.delete(c);}
 async function pending(amount='0.0001'){
  const p=await ctx.container.proposals.create({tokenAddress:ethers.ZeroAddress,recipient:fx.payeeA.address,amount},fx.owner.address);
  const full=await ctx.container.proposals.get(p.id),signature=await signApproval(fx.owner,full);
  await ctx.container.repos.proposals.transition(p.id,['AWAITING_APPROVAL'],'APPROVED',{approvalKind:'OWNER_SIGNATURE',approvedBy:fx.owner.address,approvalSignature:signature});return full;
 }

 test('migration 005 to 006 is additive, idempotent and persists after reconnection',async()=>{
  const db=await openDatabase({databaseUrl:url,schema:schema(),maxConnections:3}),partial=tempDir('aw-five-migrations-');let closed=false;
  try{for(const f of fs.readdirSync(migrations).filter(f=>/00[1-5]_/.test(f)))fs.copyFileSync(path.join(migrations,f),path.join(partial,f));
   assert.equal((await migrate(db,partial)).total,5);await db.query("INSERT INTO settings(key,value,updated_by) VALUES('release.sentinel','{\"preserved\":true}','release-test')");
   assert.deepEqual((await migrate(db,migrations)).applied,['006_treasury.sql']);assert.deepEqual((await migrate(db,migrations)).applied,[]);
   assert.equal((await db.query("SELECT value FROM settings WHERE key='release.sentinel'")).rows[0].value.preserved,true);
   const pgSchema=db.schema;await db.close();closed=true;const reopened=await openDatabase({databaseUrl:url,schema:pgSchema,maxConnections:3});
   try{assert.equal((await reopened.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,6);assert.equal((await reopened.query('SELECT count(*)::int AS n FROM treasury_execution_gate')).rows[0].n,1);}finally{await reopened.close();}
  }finally{if(!closed)await db.close();}
 });

 test('independent connections contend on the lock; rollback releases it and rolls back locked writes',async()=>{
  const peer=await openApp();let release,entered;
  const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
  const held=ctx.container.db.withTreasuryLock(async()=>{entered();await wait;});await ready;
  await assert.rejects(peer.container.db.withTreasuryLock(async()=>{}),e=>e.code==='TREASURY_BUSY');release();await held;
  await assert.rejects(ctx.container.db.withTreasuryLock(async q=>{await q.query('UPDATE treasury_execution_gate SET proposal_id=$1 WHERE id=1',[crypto.randomUUID()]);throw Error('Deliberate rollback');}),/Deliberate rollback/);
  assert.equal((await peer.container.db.query('SELECT proposal_id FROM treasury_execution_gate')).rows[0].proposal_id,null);
  await peer.container.db.withTreasuryLock(async()=>true);
 });

 test('audit hash chain remains valid across two simultaneous application instances',async()=>{
  const peer=await openApp();
  await Promise.all(Array.from({length:12},(_,i)=>(i%2?peer:ctx).container.repos.audit.append({actor:'release-test',action:'RELEASE_CONCURRENCY',entityType:'treasury',entityId:String(i),details:{i}})));
  const audit=await ctx.container.repos.audit.verify();assert.equal(audit.valid,true,'Concurrent instances must not fork audit history');
 });

 test('two executors cannot independently spend the same protected funds',async()=>{
  await ctx.container.treasury.setReserve({amount:'4.99985'},{address:fx.owner.address});
  // Both drafts pass before either approval is committed, simulating competing
  // approvals from separate instances. Execution must still preserve the floor.
  const a=await ctx.container.proposals.create({tokenAddress:ethers.ZeroAddress,recipient:fx.payeeA.address,amount:'0.0001'},fx.owner.address);
  const b=await ctx.container.proposals.create({tokenAddress:ethers.ZeroAddress,recipient:fx.payeeA.address,amount:'0.0001'},fx.owner.address);
  for(const p of [a,b]){const signature=await signApproval(fx.owner,await ctx.container.proposals.get(p.id));await ctx.container.repos.proposals.transition(p.id,['AWAITING_APPROVAL'],'APPROVED',{approvalKind:'OWNER_SIGNATURE',approvedBy:fx.owner.address,approvalSignature:signature});}
  const peer=await openApp();
  await Promise.all([ctx.container.executor.enqueue(a.id),peer.container.executor.enqueue(b.id)]);
  await ctx.container.executor.recover();await ctx.container.executor.whenIdle();await peer.container.executor.whenIdle();
  const balance=(await ctx.container.chain.getSnapshot()).tokens.find(t=>t.native).balance;
  assert.ok(balance>=ethers.parseEther('4.99985'));
  assert.ok((await ctx.container.repos.executions.listRecent()).filter(e=>e.status==='CONFIRMED').length<=1);
 });

 test('unknown transaction and its gate survive restart; mining then recovery settles it once',async()=>{
  const p=await pending();await chain.send('evm_setAutomine',[false]);
  ctx.container.chain.provider.waitForTransaction=async()=>null;
  await ctx.container.executor.enqueue(p.id);
  const sent=await ctx.container.repos.executions.findByProposal(p.id);assert.equal(sent.status,'SUBMITTED');assert.ok(sent.txHash);
  await closeApp(ctx);ctx=await openApp();
  assert.equal((await ctx.container.db.query('SELECT proposal_id FROM treasury_execution_gate')).rows[0].proposal_id,p.id);
  await assert.rejects(ctx.container.treasury.setReserve({amount:'0'},{address:fx.owner.address}),e=>e.code==='TREASURY_BUSY');
  const other=await pending();await ctx.container.executor.enqueue(other.id);assert.equal((await ctx.container.repos.executions.findByProposal(other.id)).errorCode,'TREASURY_BUSY');
  await chain.send('evm_mine');await chain.send('evm_setAutomine',[true]);
  assert.ok(await chain.send('eth_getTransactionReceipt',[sent.txHash]),'The local pending transaction must actually be mined before testing recovery');
  // Ethers caches reads for 250ms. Let this instance observe the mined block,
  // rather than treating its immediately preceding cached null as a new failure.
  await waitFor(async()=>{const receipt=await ctx.container.chain.provider.getTransactionReceipt(sent.txHash);return receipt&&await receipt.confirmations()>=ctx.config.confirmations;});
  await ctx.container.executor.recover();await ctx.container.executor.whenIdle();
  assert.equal((await ctx.container.proposals.get(p.id)).status,'CONFIRMED');assert.equal((await ctx.container.db.query('SELECT proposal_id FROM treasury_execution_gate')).rows[0].proposal_id,null);
  assert.equal((await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(p.intentId))).length,1);assert.equal((await ctx.container.executor.recover()).resumed,0);
 });

 test('two application instances retry contention without duplicate payments or nonces',async()=>{
  const a=await pending(),b=await pending(),peer=await openApp();
  await Promise.all([ctx.container.executor.enqueue(a.id),peer.container.executor.enqueue(b.id)]);
  await ctx.container.executor.recover();await ctx.container.executor.whenIdle();await peer.container.executor.whenIdle();
  const executions=await ctx.container.repos.executions.listRecent();
  for(const p of [a,b]){assert.equal((await ctx.container.proposals.get(p.id)).status,'CONFIRMED');assert.equal((await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(p.intentId))).length,1);}
  const sent=executions.filter(e=>[a.id,b.id].includes(e.proposalId));assert.equal(sent.length,2);assert.equal(new Set(sent.map(e=>e.nonce)).size,2);
  assert.equal((await ctx.container.repos.audit.verify()).valid,true);
 });

 test('a single mined block does not settle a payment configured to require two confirmations',async()=>{
  await closeApp(ctx);ctx=await openApp({CONFIRMATIONS:'2'});const p=await pending();
  const wait=ctx.container.chain.provider.waitForTransaction.bind(ctx.container.chain.provider);
  ctx.container.chain.provider.waitForTransaction=async()=>null;
  await ctx.container.executor.enqueue(p.id);
  assert.equal((await ctx.container.proposals.get(p.id)).status,'SUBMITTED');
  assert.equal((await ctx.container.db.query('SELECT proposal_id FROM treasury_execution_gate')).rows[0].proposal_id,p.id,'One confirmation must not release a two-confirmation gate');
  const other=await pending();await ctx.container.executor.enqueue(other.id);
  assert.equal((await ctx.container.repos.executions.findByProposal(other.id)).errorCode,'TREASURY_BUSY');
  assert.equal((await ctx.container.proposals.get(p.id)).status,'SUBMITTED');
  await chain.send('evm_mine');const e=await ctx.container.repos.executions.findByProposal(p.id);
  await waitFor(async()=>{const r=await ctx.container.chain.provider.getTransactionReceipt(e.txHash);return r&&await r.confirmations()>=2;});
  ctx.container.chain.provider.waitForTransaction=wait;await ctx.container.executor.recover();await ctx.container.executor.whenIdle();
  assert.equal((await ctx.container.proposals.get(p.id)).status,'CONFIRMED');
  assert.equal((await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(p.intentId))).length,1);
 });

 test('loss of the locked PostgreSQL connection prevents broadcast and recovery sends only once',async()=>{
  const p=await pending(),lock=ctx.container.db.withTreasuryLock.bind(ctx.container.db),nonce=await chain.provider.getTransactionCount(fx.agent.address);
  let injected=false;
  ctx.container.db.withTreasuryLock=fn=>lock(async q=>{
   const result=await fn(q);
   if(!injected&&(await q.query('SELECT tx_hash FROM executions WHERE proposal_id=$1',[p.id])).rows[0]?.tx_hash){
    injected=true;const pid=(await q.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await ctx.container.db.query('SELECT pg_terminate_backend($1)',[pid]);
   }
   return result;
  });
  await ctx.container.executor.enqueue(p.id);assert.equal(injected,true);
  assert.equal(await chain.provider.getTransactionCount(fx.agent.address),nonce);
  assert.equal((await ctx.container.repos.executions.findByProposal(p.id)).txHash,null);
  assert.equal((await ctx.container.proposals.get(p.id)).status,'APPROVED');
  ctx.container.db.withTreasuryLock=lock;await ctx.container.executor.recover();await ctx.container.executor.whenIdle();
  assert.equal((await ctx.container.proposals.get(p.id)).status,'CONFIRMED');assert.equal((await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(p.intentId))).length,1);
 });

 test('owner session, obligations and approval persist; restarting executes only once',async()=>{
  const principal={address:fx.owner.address};await ctx.container.treasury.setReserve({amount:'4.9998'},principal);
  const bill=await ctx.container.treasury.create({recipientLabel:'Restart supplier',recipient:fx.payeeA.address,amount:'0.0001',dueAt:new Date(Date.now()+3600000).toISOString(),priority:'HIGH',description:''},principal);
  const {proposal:p}=await ctx.container.treasury.prepare(bill.id,principal);ctx.container.proposals.setExecutor(null);
  await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(token)).set('Idempotency-Key',idemKey()).send({signature:await signApproval(fx.owner,p)}).expect(200);
  await closeApp(ctx);ctx=await openApp();await request(ctx.app).get('/api/auth/session').set(bearer(token)).expect(200);
  await ctx.container.executor.recover();await ctx.container.executor.whenIdle();
  assert.equal((await ctx.container.treasury.list(principal))[0].status,'PAID');assert.equal((await ctx.container.treasury.overview(principal)).reserveWei,ethers.parseEther('4.9998').toString());
  assert.equal((await ctx.container.executor.recover()).resumed,0);assert.equal((await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(p.intentId))).length,1);
 });

 test('confirmed rows newer than the policy snapshot remain reserved on PostgreSQL',async()=>{
  await ctx.container.treasury.setReserve({amount:'4.9999'},{address:fx.owner.address});
  const old=await ctx.container.chain.getSnapshot(),p=await pending();await ctx.container.executor.enqueue(p.id);
  assert.equal((await ctx.container.proposals.get(p.id)).status,'CONFIRMED');
  const snapshot=ctx.container.chain.getSnapshot;ctx.container.chain.getSnapshot=async()=>old;
  try{const {policy}=await ctx.container.risk.assessTransfer({tokenAddress:ethers.ZeroAddress,recipient:fx.payeeA.address,amountWei:ethers.parseEther('0.0001').toString(),source:'MANUAL'});assert.ok(policy.violations.some(v=>v.id==='BALANCE_AND_RESERVE'));}
  finally{ctx.container.chain.getSnapshot=snapshot;}
 });

 test('owner/viewer/anonymous boundaries and explicit reserve-lowering confirmation hold on PostgreSQL',async()=>{
  await request(ctx.app).put('/api/treasury/reserve').send({amount:'0'}).expect(401);
  const outsider=await signIn(ctx.app,fx.outsider);await request(ctx.app).put('/api/treasury/reserve').set(bearer(outsider)).send({amount:'0'}).expect(403);
  await request(ctx.app).put('/api/treasury/reserve').set(bearer(token)).send({amount:'0.0002'}).expect(200);
  await request(ctx.app).put('/api/treasury/reserve').set(bearer(token)).send({amount:'0.0001'}).expect(409);
  assert.equal((await ctx.container.policySettings.get()).reserveFloors[ethers.ZeroAddress],ethers.parseEther('0.0002').toString());
  await request(ctx.app).put('/api/treasury/reserve').set(bearer(token)).send({amount:'0.0001',confirmLoosening:true}).expect(200);
 });
});
