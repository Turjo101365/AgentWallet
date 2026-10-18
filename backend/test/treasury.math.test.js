import {test} from 'node:test';
import assert from 'node:assert/strict';
import {treasuryPosition,planPayments,prioritize} from '../src/services/treasuryMath.js';

for(const [name,balance,reserve,committed,upcoming,available,health] of [
  ['zero balance',0n,0n,0n,0n,'0','Healthy'],
  ['zero reserve',100n,0n,0n,10n,'100','Healthy'],
  ['reserve equals balance',100n,100n,0n,1n,'0','Limited funds'],
  ['reserve above balance',100n,101n,0n,0n,'0','Reserve at risk'],
  ['commitments above balance',100n,0n,101n,0n,'0','Insufficient funds'],
  ['exact one wei boundary',10n**30n+1n,10n**30n,0n,1n,'1','Healthy'],
  ['pending commitments counted once',100n,20n,30n,50n,'50','Healthy'],
])test(name,()=>{const p=treasuryPosition({balance,reserve,committed,upcoming});assert.equal(p.availableWei,available);assert.equal(p.health,health);});
const now=Date.parse('2026-10-17T00:00:00Z');
const o=(id,amountWei='10',priority='NORMAL',dueAt='2026-10-18T00:00:00Z')=>({id,amountWei,priority,dueAt});
const plan=obligations=>planPayments({obligations,balance:40n,reserve:20n,committed:0n,dailyRemaining:100n,perTxLimit:100n,now});
test('overdue, then priority, then earliest date with stable tie breaking',()=>{
 const xs=[o('low','1','LOW'),o('normal'),o('high','1','HIGH','2026-10-19T00:00:00Z'),o('overdue','1','LOW','2026-10-16T00:00:00Z'),o('high-early','1','HIGH')];
 assert.deepEqual(prioritize(xs,now).map(x=>x.id),['overdue','high-early','high','normal','low']);
 assert.deepEqual(prioritize([o('b'),o('a')],now).map(x=>x.id),['a','b']);
});
test('combined payments cannot cross reserve, no hypothetical deposits',()=>{
 const p=plan([o('urgent','10','HIGH'),o('other','20')]);
 assert.deepEqual(p.payments.map(x=>x.recommendation),['PAY','DEFER']);assert.equal(p.projectedBalanceWei,'30');assert.equal(p.aboveReserveWei,'10');assert.equal(p.authorization,false);
 assert.deepEqual(p,plan([o('other','20'),o('urgent','10','HIGH')]));
});
test('affordable exact boundary, no negative available, cap and allowlist blocks',()=>{
 assert.equal(plan([o('exact','20')]).projectedBalanceWei,'20');
 assert.equal(plan([o('too-large','21')]).payments[0].recommendation,'DEFER');
 const p=planPayments({obligations:[{...o('blocked'),blockedBy:['Not approved']}],balance:100n,reserve:0n,committed:0n,dailyRemaining:5n,perTxLimit:5n,now});
 assert.equal(p.plannedOutflowWei,'0');assert.equal(p.payments[0].reasons.length,3);
});
