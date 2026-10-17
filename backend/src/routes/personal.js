import { Router } from 'express';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { createContainer } from '../container.js';
import { createApiRouter } from './api.js';
import { FROZEN_EVIDENCE_CONTRACTS } from '../config/env.js';
import { forbidden } from '../lib/errors.js';
import { DEMO_TOOLS } from '../services/demoService.js';

/** Only admin-registered contracts; SIWE owner is rechecked on EVERY request. No arbitrary RPC/keys supplied by clients. */
export function createPersonalRouter(root, limits) {
  const router = Router();
  const cache = new Map();
  let creating=false;
  const wrap = (fn) => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
  const close = root.close;
  root.close = async () => { for (const c of cache.values()) await c.close(); cache.clear(); await close(); };
  router.use((req,_res,next) => root.auth.authenticate(req.get('authorization')).then((s) => { req.personalSession=s; next(); },next));
  router.use((req,res,next)=>req.path.endsWith('/agent/chat') && req.method==='POST' ? limits.demoAi(req,res,next):next());
  router.post('/select', wrap(async (req,res) => {
    const address = ethers.getAddress(req.body?.address || '');
    const r = await root.db.query('SELECT * FROM personal_sandboxes WHERE lower(owner_address)=lower($1) AND lower(contract_address)=lower($2) AND enabled=TRUE', [req.personalSession.address,address]);
    if (!r.rows.length) throw forbidden('Ask the admin to register your separate sandbox first');
    res.json({ success:true,data:{ address } });
  }));
  router.use('/:address', wrap(async (req,res) => {
    if (!root.demoRuntime?.sandbox) throw forbidden('Sandbox relay is not configured');
    const address = ethers.getAddress(req.params.address);
    if (FROZEN_EVIDENCE_CONTRACTS.has(address)) throw forbidden('Historical evidence contracts cannot be selected');
    const registered = (await root.db.query('SELECT * FROM personal_sandboxes WHERE lower(contract_address)=lower($1) AND lower(owner_address)=lower($2) AND enabled=TRUE', [address,req.personalSession.address])).rows[0];
    if (!registered) throw forbidden('This sandbox is not registered for your wallet');
    let box = cache.get(address);
    if (!box) {
      if(creating)throw forbidden('Sandbox is starting; retry shortly');
      creating=true;
      try {
      if (cache.size >= 2) throw forbidden('Two personal sandboxes are already active; ask the admin to restart the free demo service');
      const base = root.demoRuntime.sandbox.container.config;
      box = await createContainer({ ...base, contractAddress:address, dbSchema:'personal_'+crypto.createHash('sha256').update(address).digest('hex').slice(0,16),
        deployBlock:Number(registered.deploy_block), demo:{enabled:false}, backgroundJobs:false, publicAi:{enabled:false}, llm:root.config.llm }, { logger:root.logger,llmProvider:root.llm });
      if (box.chain.contractVersion() !== 2 || !await box.chain.contract.agent().then((a) => a === root.config.demo.agentAddress)) { await box.close(); throw forbidden('Sandbox must be v2 and authorize the approved relay agent'); }
      box.executor.setSandboxGuard(root.demoRuntime.bindGuard(box, async (p) => {
        if (p.token.address !== ethers.ZeroAddress || BigInt(p.amountWei)>root.config.demo.maxAmountWei) return null;
        if (p.createdBy.toLowerCase() !== registered.owner_address.toLowerCase()) {
          const run=p.taskRunId ? await box.repos.runs.findById(p.taskRunId) : null;
          const task=run ? await box.repos.tasks.findById(run.taskId):null;
          if(!task || task.createdBy.toLowerCase()!==registered.owner_address.toLowerCase())return null;
        }
        const enabled = (await root.db.query('SELECT enabled FROM personal_sandboxes WHERE lower(contract_address)=lower($1)', [address])).rows[0]?.enabled;
        const executionEnabled=(await root.demoRuntime.sandbox.container.db.query('SELECT execution_enabled FROM demo_settings WHERE id=1')).rows[0]?.execution_enabled;
        return enabled && executionEnabled ? 'personal:'+registered.owner_address.toLowerCase() : null;
      }));
      cache.set(address,box);
      }finally{creating=false;}
    }
    await box.auth.assertOwner(req.personalSession.address);
    const auth = { ...box.auth, authenticate: async () => req.personalSession };
    const api = createApiRouter({ ...box, auth,limits });
    if(req.path==='/automation/run-due' && req.method==='POST'){
      await box.scheduler.tick();await box.executor.whenIdle();await box.scheduler.tick();
      return res.json({success:true,data:await box.scheduler.list({limit:20})});
    }
    // Public AI caps apply to personal planning too; never enable the full privileged tool list.
    if (req.path === '/agent/chat' && req.method === 'POST') {
      if(root.publicAiGate.active)throw forbidden('An AI request is already running');
      root.publicAiGate.active=true;
      try{
      if (typeof req.body?.message!=='string' || req.body.message.length>1200)throw forbidden('Use a public question of at most 1200 characters');
      const budget = await root.db.query(`INSERT INTO judge_ai_usage(day,requests) VALUES((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,1)
        ON CONFLICT(day) DO UPDATE SET requests=judge_ai_usage.requests+1 WHERE judge_ai_usage.requests<$1 RETURNING requests`,[root.config.publicAi.dailyLimit]);
      if (!budget.rows.length) throw forbidden('Public AI daily limit reached');
      const data = await box.agentChat.chat(req.body,req.personalSession,{ tools:DEMO_TOOLS,maxModelCalls:4,maxOutputTokens:1024,maxContextBytes:24000 });
      return res.json({success:true,data});
      }finally{root.publicAiGate.active=false;}
    }
    return api(req,res,(err) => { if (err) res.status(err.status||500).json({success:false,error:{code:err.code||'PERSONAL_ERROR',message:'Personal sandbox request failed'}}); else res.status(404).end(); });
  }));
  return router;
}
