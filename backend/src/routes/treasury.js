import {Router} from 'express';
import {z} from 'zod';
import {validate} from '../middleware/validate.js';
import {obligationSchema,obligationUpdateSchema,reserveSchema} from '../services/treasuryService.js';

// Authentication is supplied by the existing operator or demo session middleware.
export function createTreasuryRouter({treasury,principal,session,limits,allowReserve=true,decorateProposal=null}) {
  const r=Router(),id=z.object({id:z.string().uuid()}).strict();
  const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req)).then(data=>res.json({success:true,data})).catch(next);
  r.use(session);
  r.get('/',validate(z.object({days:z.coerce.number().int().min(1).max(90).default(7)}).strict(),'query'),wrap(req=>treasury.overview(principal(req),req.valid.query)));
  r.get('/obligations',wrap(req=>treasury.list(principal(req))));
  r.post('/obligations',limits.mutation,validate(obligationSchema),wrap(req=>treasury.create(req.valid.body,principal(req))));
  r.put('/obligations/:id',limits.mutation,validate(id,'params'),validate(obligationUpdateSchema),wrap(req=>treasury.update(req.valid.params.id,req.valid.body,principal(req))));
  r.post('/obligations/:id/prepare',limits.mutation,validate(id,'params'),validate(z.object({}).strict()),wrap(async req=>{
    const result=await treasury.prepare(req.valid.params.id,principal(req));
    return decorateProposal?{...result,proposal:await decorateProposal(req,result.proposal.id)}:result;
  }));
  if(allowReserve)r.put('/reserve',limits.mutation,validate(reserveSchema),wrap(req=>treasury.setReserve(req.valid.body,principal(req))));
  return r;
}
