import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {openDatabase} from '../src/db/index.js';
import {migrate} from '../src/db/migrate.js';
import {tempDir} from './helpers/app.js';
import {fileURLToPath} from 'node:url';

test('treasury obligations and an unresolved gate persist across a real database restart',async()=>{
 const dir=tempDir('aw-treasury-persistence-'),migrations=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
 let db=await openDatabase({pgliteDir:dir});
 try{
  await migrate(db,migrations);const id=crypto.randomUUID(),scope='owner:local-test-owner',amount='123456789012345678901';
  await db.query("INSERT INTO treasury_obligations(id,scope,recipient_label,recipient,amount_wei,due_at,priority) VALUES($1,$2,'Local fixture','0x0000000000000000000000000000000000000001',$3,now(),'HIGH')",[id,scope,amount]);
  await db.query('UPDATE treasury_execution_gate SET proposal_id=$1 WHERE id=1',[id]);
  await db.close();db=await openDatabase({pgliteDir:dir});assert.deepEqual((await migrate(db,migrations)).applied,[]);
  assert.equal((await db.query('SELECT amount_wei::text AS amount FROM treasury_obligations WHERE id=$1 AND scope=$2',[id,scope])).rows[0].amount,amount);
  assert.equal((await db.query('SELECT proposal_id FROM treasury_execution_gate WHERE id=1')).rows[0].proposal_id,id);
 }finally{await db.close();}
});
