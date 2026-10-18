import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { z } from 'zod';
import { reservedWei } from './reservations.js';
import { treasuryPosition, planPayments } from './treasuryMath.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const eth=z.string().max(60).regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/).refine(v=>{try{return ethers.parseEther(v)<=ethers.MaxUint256;}catch{return false;}},'ETH amount exceeds the supported range');
export const obligationSchema=z.object({recipientLabel:z.string().trim().min(1).max(80),recipient:z.string().refine(ethers.isAddress,'Use a valid wallet address'),amount:eth.refine(v=>{try{return ethers.parseEther(v)>0n;}catch{return false;}},'Amount must be positive'),dueAt:z.iso.datetime({offset:true}),priority:z.enum(['HIGH','NORMAL','LOW']),description:z.string().max(500).default('')}).strict();
export const obligationUpdateSchema=obligationSchema.partial().extend({version:z.number().int().positive(),state:z.enum(['UPCOMING','PLANNED','DEFERRED','CANCELLED']).optional()}).strict();
export const reserveSchema=z.object({amount:eth,confirmLoosening:z.boolean().optional()}).strict();
const scopeOf=p=>p.demoSessionId?`demo:${p.demoSessionId}`:`owner:${p.address.toLowerCase()}`;
const active=new Set(['UPCOMING','PLANNED','DEFERRED']);

export function createTreasuryService({db,repos,chain,auth,config,policySettings,proposals,agentControl}) {
  async function writeAccess(p){
    if(p.demoSessionId){if(!p.executionAllowed)throw forbidden('An invite is required to manage demo obligations');}
    else await auth.assertOwner(p.address);
  }
  async function audit(p,action,id,details){await repos.audit.append({actor:scopeOf(p),action,entityType:'treasury',entityId:id,details});}
  async function list(p){
    const {rows}=await db.query(`SELECT o.*, p.status AS proposal_status,p.resolution_reason,p.policy_result, e.tx_hash,e.status AS execution_status,e.error_message FROM treasury_obligations o
      LEFT JOIN proposals p ON p.id=o.proposal_id LEFT JOIN executions e ON e.proposal_id=p.id WHERE o.scope=$1 ORDER BY o.due_at,o.id`,[scopeOf(p)]);
    return rows.map(r=>({id:r.id,recipientLabel:r.recipient_label,recipient:r.recipient,amountWei:r.amount_wei,amount:ethers.formatEther(BigInt(r.amount_wei)),dueAt:new Date(r.due_at).toISOString(),priority:r.priority,description:r.description,version:r.version,proposalId:r.proposal_id,
      status:r.proposal_status==='CONFIRMED'&&r.execution_status==='CONFIRMED'?'PAID':r.proposal_status==='AWAITING_APPROVAL'?'AWAITING_APPROVAL':['APPROVED','SUBMITTED'].includes(r.proposal_status)?'SCHEDULED':r.proposal_status?'FAILED':r.state,
      txHash:r.tx_hash,receiptUrl:r.tx_hash?chain.txUrl(r.tx_hash):null,error:r.error_message||r.resolution_reason||(r.policy_result?.violations||[]).map(v=>v.message).join('; ').slice(0,500)||null}));
  }
  async function create(input,p){
    await writeAccess(p);const v=obligationSchema.parse(input);
    return db.withTreasuryLock(async()=>{
    if((await list(p)).length>=50)throw conflict('OBLIGATION_LIMIT','This wallet session already has 50 obligations');
    if(!await chain.isRecipientAllowed(v.recipient))throw badRequest('RECIPIENT_NOT_ALLOWLISTED','Choose an approved recipient');
    const id=crypto.randomUUID();
    await db.query(`INSERT INTO treasury_obligations(id,scope,recipient_label,recipient,amount_wei,due_at,priority,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,scopeOf(p),v.recipientLabel,ethers.getAddress(v.recipient),ethers.parseEther(v.amount).toString(),new Date(v.dueAt),v.priority,v.description]);
    await audit(p,'TREASURY_OBLIGATION_CREATED',id,{amountWei:ethers.parseEther(v.amount).toString(),recipient:ethers.getAddress(v.recipient)});
    return (await list(p)).find(o=>o.id===id);
    });
  }
  async function update(id,input,p){
    await writeAccess(p);const patch=obligationUpdateSchema.parse(input);
    return db.withTreasuryLock(async()=>{
    const old=(await list(p)).find(o=>o.id===id);if(!old)throw notFound('Obligation not found');
    if(old.proposalId || await repos.proposals.findById(id))throw conflict('OBLIGATION_LINKED','A prepared payment cannot be edited or cancelled here. Review or reject its payment proposal.');
    const fields={recipientLabel:old.recipientLabel,recipient:old.recipient,amount:old.amount,dueAt:old.dueAt,priority:old.priority,description:old.description};
    const {version,state,...changes}=patch;
    const v=obligationSchema.parse({...fields,...changes});
    if(state!=='CANCELLED'&&!await chain.isRecipientAllowed(v.recipient))throw badRequest('RECIPIENT_NOT_ALLOWLISTED','Choose an approved recipient');
    const changed=await db.query(`UPDATE treasury_obligations SET recipient_label=$3,recipient=$4,amount_wei=$5,due_at=$6,priority=$7,description=$8,state=$9,version=version+1,updated_at=now()
      WHERE id=$1 AND scope=$2 AND version=$10 AND proposal_id IS NULL RETURNING id`,[id,scopeOf(p),v.recipientLabel,ethers.getAddress(v.recipient),ethers.parseEther(v.amount).toString(),new Date(v.dueAt),v.priority,v.description,state||old.status,version]);
    if(!changed.rowCount)throw conflict('OBLIGATION_CHANGED','This obligation changed; refresh before editing');
    await audit(p,'TREASURY_OBLIGATION_UPDATED',id,{version:version+1,state:state||old.status});
    return (await list(p)).find(o=>o.id===id);
    });
  }
  async function overview(p,{days=7}={}){
    if(!Number.isInteger(days)||days<1||days>90)throw badRequest('INVALID_PERIOD','Choose 1 to 90 days');
    const snap=await chain.getSnapshot(),t=snap.tokens.find(t=>t.native);
    if(!t)throw badRequest('ETH_UNAVAILABLE','ETH treasury is unavailable');
    const [settings,committed,obligations,agentPaused]=await Promise.all([policySettings.get(),reservedWei({repos,chain},t.address,null,snap.blockNumber),list(p),agentControl?.isPaused()||false]);
    const configured=BigInt(settings.reserveFloors[t.address]||0),reserve=configured>config.nativeReserveFloorWei?configured:config.nativeReserveFloorWei;
    const now=Date.now(),until=now+days*86400000;
    const candidates=obligations.filter(o=>active.has(o.status)&&Date.parse(o.dueAt)<=until);
    const upcoming=obligations.filter(o=>!['PAID','CANCELLED','FAILED'].includes(o.status)&&Date.parse(o.dueAt)<=until).reduce((s,o)=>s+BigInt(o.amountWei),0n);
    const blockers=[];
    if(snap.paused)blockers.push('Contract payments are paused');
    if(agentPaused)blockers.push('Agent payments are paused');
    if(!t.enabled)blockers.push('ETH payments are disabled');
    if(!config.executor.enabled || snap.agent.toLowerCase()!==config.executor.address?.toLowerCase())blockers.push('The configured executor is not authorized');
    if((snap.executorBalance??0n)<config.minExecutorGasBalanceWei)blockers.push('The separate agent gas wallet is below its minimum');
    const fee=snap.maxFeePerGas??snap.gasPrice;
    if(fee==null||fee>config.maxFeePerGasWei)blockers.push('Network fees are unavailable or exceed policy');
    const checked=await Promise.all(candidates.map(async o=>({...o,blockedBy:[...blockers,...(await chain.isRecipientAllowed(o.recipient,snap.blockNumber)?[]:['Recipient is no longer approved'])]})));
    const plan=planPayments({obligations:checked,balance:t.balance,reserve,committed,dailyRemaining:t.remainingToday,perTxLimit:t.perTxLimit,now});
    return {...treasuryPosition({balance:t.balance,reserve,committed,upcoming}),blockNumber:snap.blockNumber,chainId:config.chainId,contractAddress:config.contractAddress,network:config.network.name,asset:'ETH',days,agentGasWei:snap.executorBalance?.toString()??null,perTxLimitWei:t.perTxLimit.toString(),dailyRemainingWei:t.remainingToday.toString(),obligations,plan,
      note:'Available funds are balance minus reserve and approved/in-flight commitments. Plans also apply contract caps and allowlists. Execution rechecks all policy, authorization and demo budgets. Reserve is application policy, not an on-chain invariant.'};
  }
  async function setReserve(input,p){
    if(p.demoSessionId)throw forbidden('Only a wallet owner or allowlisted admin can change the shared reserve');
    await auth.assertOwner(p.address);const {amount,confirmLoosening}=reserveSchema.parse(input);
    return policySettings.update({reserveFloors:{[ethers.ZeroAddress]:ethers.parseEther(amount).toString()}},p.address,{allowLoosening:confirmLoosening===true,via:'treasury-owner'});
  }
  async function prepare(id,p,{source='MANUAL'}={}){
    await writeAccess(p);
    return db.withTreasuryLock(async()=>{
      const o=(await list(p)).find(o=>o.id===id);if(!o)throw notFound('Obligation not found');
      if(o.proposalId)return {proposal:await proposals.get(o.proposalId),replayed:true};
      if(!active.has(o.status))throw conflict('OBLIGATION_INACTIVE','This obligation cannot be prepared');
      // Preparation does not approve or execute; the existing risk engine is authoritative.
      const proposal=await proposals.create({tokenAddress:ethers.ZeroAddress,recipient:o.recipient,amount:o.amount,memo:`Treasury: ${o.recipientLabel}`,source,idOverride:o.id},p.address);
      await db.tx(async q=>{
        await q.query('UPDATE treasury_obligations SET proposal_id=$2,version=version+1,updated_at=now() WHERE id=$1',[id,proposal.id]);
        if(p.demoSessionId)await q.query('INSERT INTO demo_actions(proposal_id,session_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[proposal.id,p.demoSessionId]);
      });
      await audit(p,'TREASURY_PAYMENT_PREPARED',id,{proposalId:proposal.id,status:proposal.status});
      return {proposal:await proposals.get(proposal.id),replayed:false};
    });
  }
  return {list,create,update,overview,setReserve,prepare};
}
