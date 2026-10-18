import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireSession } from '../middleware/auth.js';
import { forbidden } from '../lib/errors.js';
import { sameAddress } from '../lib/address.js';
import { ethers } from 'ethers';
import { FROZEN_EVIDENCE_CONTRACTS } from '../config/env.js';
import { reserveSchema } from '../services/treasuryService.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req)).then((data) => res.json({ success: true, data })).catch(next);
const inviteSchema = z.object({ label: z.string().trim().min(1).max(80), maxSessions: z.number().int().min(1).max(100), expiresInHours: z.number().int().min(1).max(24 * 14).nullable().optional() }).strict();
const executionSchema = z.object({ enabled: z.boolean() }).strict();
const emergencySchema = z.object({ action: z.enum(['pause', 'unpause', 'emergencyStop']) }).strict();
const idParam = z.object({ id: z.string().uuid() }).strict();

/**
 * /api/admin: the Owner/Admin role. Requires a SIWE session (wallet signature) whose address is on the server-side
 * ADMIN_ADDRESSES allowlist, checked on every request. Choosing "Admin" in the UI grants nothing by itself.
 */
export function createAdminRouter({ config, auth, demoRuntime, limits, db }) {
  const router = Router();
  const session = requireSession(auth);
  const admin = (req, res, next) => session(req, res, (err) => {
    if (err) return next(err);
    if (!config.adminAddresses.some((a) => sameAddress(a, req.session.address))) return next(forbidden('This wallet is not on the server-side admin allowlist'));
    next();
  });
  const demo = () => {
    if (!demoRuntime?.service) {
      const e = forbidden(demoRuntime?.reason || 'The demo wallet is not configured');
      e.status = 503;
      e.code = 'DEMO_UNAVAILABLE';
      throw e;
    }
    return demoRuntime.service;
  };

  router.get('/me', admin, wrap(async (req) => ({ address: req.session.address, role: 'admin' })));
  router.get('/personal', admin, wrap(async () => (await db.query('SELECT owner_address,contract_address,enabled FROM personal_sandboxes')).rows));
  router.post('/personal', limits.mutation, admin, validate(z.object({ owner:z.string().refine(ethers.isAddress), address:z.string().refine(ethers.isAddress), enabled:z.boolean(),deployBlock:z.number().int().min(1) }).strict()), wrap(async (req) => {
    const address=ethers.getAddress(req.valid.body.address), owner=ethers.getAddress(req.valid.body.owner);
    if (FROZEN_EVIDENCE_CONTRACTS.has(address) || address===config.demo.contractAddress) throw forbidden('Use a separate personal v2 sandbox');
    const provider=demoRuntime?.sandbox?.container.chain.provider;
    if (!provider) throw forbidden('Sandbox relay is not configured');
    const contract=new ethers.Contract(address,['function owner() view returns(address)','function agent() view returns(address)','function VERSION() view returns(uint256)'],provider);
    if (Number(await contract.VERSION())!==2 || !sameAddress(await contract.owner(),owner) || !sameAddress(await contract.agent(),config.demo.agentAddress)) throw forbidden('Verify sandbox owner, v2 version and approved agent before registration');
    if(await provider.getCode(address,req.valid.body.deployBlock)==='0x')throw forbidden('No sandbox code exists at the supplied deployment block');
    await db.query(`INSERT INTO personal_sandboxes(owner_address,contract_address,approved_by,enabled,deploy_block) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(owner_address) DO UPDATE SET contract_address=$2,approved_by=$3,enabled=$4,deploy_block=$5`,[owner,address,req.session.address,req.valid.body.enabled,req.valid.body.deployBlock]);
    return {owner,address,enabled:req.valid.body.enabled};
  }));
  router.get('/demo', admin, wrap(async () => {
    const service=demo(),box=demoRuntime.sandbox.container;
    const settings=await box.policySettings.get();
    const configured=BigInt(settings.reserveFloors[ethers.ZeroAddress]||0);
    const floor=box.config.nativeReserveFloorWei;
    return {status:await service.status(),invites:await service.listInvites(),treasuryReserveEth:ethers.formatEther(configured>floor?configured:floor)};
  }));
  router.put('/demo/treasury/reserve',limits.mutation,admin,validate(reserveSchema),wrap(async req=>{
    demo();
    const box=demoRuntime.sandbox.container;
    return box.policySettings.update({reserveFloors:{[ethers.ZeroAddress]:ethers.parseEther(req.valid.body.amount).toString()}},req.session.address,{allowLoosening:req.valid.body.confirmLoosening===true,via:'allowlisted-admin-treasury'});
  }));
  router.post('/demo/invites', limits.mutation, admin, validate(inviteSchema), wrap((req) => demo().createInvite(req.valid.body, req.session.address)));
  router.post('/demo/invites/:id/revoke', limits.mutation, admin, validate(idParam, 'params'), wrap((req) => demo().revokeInvite(req.valid.params.id, req.session.address)));
  router.post('/demo/execution', limits.mutation, admin, validate(executionSchema), wrap((req) => demo().setExecutionEnabled(req.valid.body.enabled, req.session.address)));
  router.put('/demo/limits', limits.mutation, admin, validate(z.object({maxAmountEth:z.string().regex(/^\d+(\.\d+)?$/).optional(),dailyAmountEth:z.string().regex(/^\d+(\.\d+)?$/).optional(),dailyTxLimit:z.number().int().min(0).optional(),maxTxPerSession:z.number().int().min(0).optional()}).strict()),wrap((req)=>demo().setLimits(req.valid.body,req.session.address)));
  router.post('/demo/emergency', limits.mutation, admin, validate(emergencySchema), wrap((req) => demo().emergency(req.valid.body.action, req.session.address)));
  return router;
}
