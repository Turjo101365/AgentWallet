import { Router } from 'express';
import { ethers } from 'ethers';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { AppError, forbidden } from '../lib/errors.js';
import { createApiRouter } from './api.js';
import { startSchema, chatSchema, confirmSchema } from '../services/demoService.js';
import { listQuery } from './schemas.js';
import { createTreasuryRouter } from './treasury.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => (res.headersSent ? null : res.json({ success: true, data }))).catch(next);
const idParam = z.object({ id: z.string().uuid() }).strict();

/**
 * /api/demo: the judge demo wallet.
 *  - /status and /session are public (a session without an invite can explore and draft, never execute).
 *  - /sandbox/* mirrors the operator API of the DEMO sandbox for the dashboard: GET only, viewer rights, plus the
 *    demo chat and the confirm endpoint. Owner-only operator routes are refused for demo sessions.
 */
export function createDemoRouter({ demoRuntime, limits }) {
  const router = Router();
  if (!demoRuntime?.service) {
    router.use((req, res) => res.status(503).json({ success: false, error: { code: 'DEMO_UNAVAILABLE', message: demoRuntime?.reason || 'The demo wallet is not configured', requestId: req.id } }));
    return router;
  }
  const { service, sandbox } = demoRuntime;
  const session = (req, _res, next) => service.authenticate(req.get('authorization')).then((s) => { req.demo = s; next(); }, next);
  const optionalSession = (req, _res, next) => (req.get('authorization') ? session(req, _res, next) : next());

  router.get('/status', limits.publicRead, optionalSession, wrap((req) => service.status(req.demo || null)));
  router.post('/session', limits.auth, validate(startSchema), wrap((req) => service.startSession(req.valid.body)));

  const box = Router();
  box.use('/treasury',createTreasuryRouter({treasury:sandbox.container.treasury,session,limits,allowReserve:false,
    principal:req=>({address:sandbox.ownerSigner.address,demoSessionId:req.demo.id,executionAllowed:req.demo.executionAllowed}),
    decorateProposal:(req,id)=>service.getProposal(req.demo,id)}));
  box.get('/auth/session', session, wrap((req) => ({ id: req.demo.id, address: null, role: 'demo', executionAllowed: req.demo.executionAllowed, expiresAt: req.demo.expiresAt })));
  box.post('/agent/chat', limits.demoAi, session, validate(chatSchema), wrap((req) => service.chat(req.demo, req.valid.body)));
  box.get('/agent/conversations', session, wrap((req) => service.conversations(req.demo)));
  box.get('/agent/conversations/:id', session, validate(idParam, 'params'), wrap((req) => service.conversation(req.demo, req.valid.params.id)));
  box.get('/proposals', session, validate(listQuery, 'query'), wrap((req) => service.listProposals(req.demo, { status: req.valid.query.status ? req.valid.query.status.split(',') : null, limit: req.valid.query.limit })));
  box.get('/proposals/:id', session, validate(idParam, 'params'), wrap((req) => service.getProposal(req.demo, req.valid.params.id)));
  box.post('/proposals/:id/confirm', limits.mutation, session, validate(idParam, 'params'), validate(confirmSchema), wrap((req) => service.confirm(req.demo, req.valid.params.id, req.valid.body)));
  box.get('/sandbox-status', session, wrap((req) => service.status(req.demo)));
  const taskDraft=z.object({recipient:z.string().refine(ethers.isAddress),amount:z.string().regex(/^\d+(\.\d+)?$/)}).strict();
  box.post('/tasks',limits.mutation,session,validate(taskDraft),wrap((req)=>service.createTask(req.demo,req.valid.body)));
  box.get('/tasks',session,wrap((req)=>service.tasks(req.demo)));
  box.get('/tasks/:id',session,validate(idParam,'params'),wrap((req)=>service.taskFor(req.demo,req.valid.params.id)));
  box.post('/tasks/:id/confirm-grant',limits.mutation,session,validate(idParam,'params'),validate(z.object({confirm:z.literal(true),digest:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict()),wrap((req)=>service.confirmGrant(req.demo,req.valid.params.id,req.valid.body.digest)));
  box.post('/tasks/:id/revoke-demo',limits.mutation,session,validate(idParam,'params'),wrap((req)=>service.revokeTask(req.demo,req.valid.params.id)));
  box.post('/automation/run-due',limits.mutation,session,wrap((req)=>service.runDue(req.demo)));

  // Everything else: read-only mirror of the sandbox's own API, with demo sessions as viewers.
  box.use((req, res, next) => {
    if (req.method === 'GET') return next();
    res.status(403).json({ success: false, error: { code: 'DEMO_READ_ONLY', message: 'This action is not available in the demo wallet', requestId: req.id } });
  });
  const viewerAuth = {
    authenticate: async (header) => {
      const s = await service.authenticate(header);
      return { id: s.id, address: ethers.ZeroAddress, expiresAt: s.expiresAt };
    },
    roleFor: async () => 'demo',
    assertOwner: async () => { throw forbidden('Demo sessions cannot perform owner actions'); },
    issueNonce: async () => { throw new AppError(403, 'DEMO_READ_ONLY', 'Not available in the demo wallet'); },
    verifySignIn: async () => { throw new AppError(403, 'DEMO_READ_ONLY', 'Not available in the demo wallet'); },
    signOut: async () => {},
  };
  box.use(createApiRouter({ ...sandbox.container, auth: viewerAuth, limits }));
  router.use('/sandbox', box);
  return router;
}
