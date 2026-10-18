import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../src/db/index.js';
import {migrate} from '../src/db/migrate.js';
import {createRepositories} from '../src/repositories/index.js';
import {createDemoService} from '../src/services/demoService.js';

// Isolated database only; no chain, provider, signer, real invite or paid API.
const owner='0x0000000000000000000000000000000000000001';
const demo={ownerAddress:owner,maxTxPerSession:0,maxAiPerSession:6,maxAmountWei:1n,dailyTxLimit:0,dailyAmountWei:0n,minTreasuryEth:'0.0003',minAgentGasEth:'0.0005',maxGasPerTxWei:0n,sessionGasWei:0n,dailyGasWei:0n,sessionTtlSeconds:3600};
const migrations=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
const isolatedPg=process.env.AW_ENTRY_TEST_PG_URL;
if(isolatedPg){const u=new URL(isolatedPg);if(!['localhost','127.0.0.1'].includes(u.hostname)||u.pathname!=='/aw_release')throw Error('Admission tests require the named isolated loopback database');}
let db,service;
function make(database,repos=createRepositories(database)){return createDemoService({demo,sandbox:{container:{db:database,repos,chain:{},config:{}},ownerSigner:{}},budgetDb:database,logger:{}});}
before(async()=>{db=await openDatabase(isolatedPg?{databaseUrl:isolatedPg,schema:'entry_release_'+process.pid}:{pgliteDir:'memory://'});await migrate(db,migrations);service=make(db);});
after(async()=>{await db?.close();});
async function invite(){return service.createInvite({label:'isolated admission '+crypto.randomUUID(),maxSessions:1,expiresInHours:1},owner);}
async function counts(id){const used=(await db.query('SELECT sessions_used FROM demo_invites WHERE id=$1',[id])).rows[0].sessions_used;const sessions=(await db.query('SELECT count(*)::int AS n FROM demo_sessions WHERE invite_id=$1',[id])).rows[0].n;return {used,sessions};}

test('one-use invite admits one session; a second request is refused without a second session',async()=>{
 const i=await invite(),s=await service.startSession({inviteCode:i.code});assert.equal(s.executionAllowed,true);
 await assert.rejects(service.startSession({inviteCode:i.code}),e=>e.code==='INVITE_INVALID');assert.deepEqual(await counts(i.id),{used:1,sessions:1});
 const event=(await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='DEMO_SESSION_STARTED' AND entity_id=$1",[s.sessionId])).rows[0].n;assert.equal(event,1);
});
test('concurrent requests cannot admit two sessions for a one-use invite',async()=>{
 const i=await invite(),r=await Promise.allSettled([service.startSession({inviteCode:i.code}),service.startSession({inviteCode:i.code})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'INVITE_INVALID');assert.deepEqual(await counts(i.id),{used:1,sessions:1});
});
test('session insert failure rolls back invite consumption',async()=>{
 const i=await invite(),fault={...db,tx:fn=>db.tx(q=>fn({...q,query:(sql,params)=>{if(sql.startsWith('INSERT INTO demo_sessions'))throw Error('injected insert failure');return q.query(sql,params);}}))};
 await assert.rejects(make(fault).startSession({inviteCode:i.code}),/injected insert failure/);assert.deepEqual(await counts(i.id),{used:0,sessions:0});await service.startSession({inviteCode:i.code});
});
test('audit insert failure rolls back both session insertion and invite consumption',async()=>{
 const i=await invite(),repos=createRepositories(db);repos.audit.append=async()=>{throw Error('injected audit failure');};
 await assert.rejects(make(db,repos).startSession({inviteCode:i.code}),/injected audit failure/);assert.deepEqual(await counts(i.id),{used:0,sessions:0});await service.startSession({inviteCode:i.code});
});
test('one-hour expiry, expired/revoked invites and existing-session authorization remain enforced',async()=>{
 const i=await invite(),r=(await db.query('SELECT EXTRACT(EPOCH FROM(expires_at-created_at)) AS lifetime FROM demo_invites WHERE id=$1',[i.id])).rows[0];assert.ok(Math.abs(Number(r.lifetime)-3600)<5);
 const s=await service.startSession({inviteCode:i.code});await service.revokeInvite(i.id,owner);assert.equal((await service.authenticate('Bearer '+s.token)).executionAllowed,false);await assert.rejects(service.startSession({inviteCode:i.code}),e=>e.code==='INVITE_INVALID');
 const expired=await invite();await db.query("UPDATE demo_invites SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);await assert.rejects(service.startSession({inviteCode:expired.code}),e=>e.code==='INVITE_INVALID');assert.deepEqual(await counts(expired.id),{used:0,sessions:0});
});
test('existing bearer session recovers after database restart without consuming its invite again',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aw-entry-recovery-'));let disk=await openDatabase({pgliteDir:dir});try{
 await migrate(disk,migrations);let s=make(disk);const i=await s.createInvite({label:'local restart',maxSessions:1,expiresInHours:1},owner),entry=await s.startSession({inviteCode:i.code});await disk.close();disk=await openDatabase({pgliteDir:dir});s=make(disk);
 const restored=await s.authenticate('Bearer '+entry.token);assert.equal(restored.id,entry.sessionId);assert.equal(restored.executionAllowed,true);assert.equal((await disk.query('SELECT sessions_used FROM demo_invites WHERE id=$1',[i.id])).rows[0].sessions_used,1);await assert.rejects(s.authenticate('Bearer d.'+'0'.repeat(64)),e=>e.status===401);
 }finally{await disk.close();}
});
test('admission and failure paths preserve the existing hash-linked audit chain',async()=>{assert.equal((await createRepositories(db).audit.verify()).valid,true);});
