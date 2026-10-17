import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { assessmentSchema, analysisSchema } from '../services/judgeService.js';

export function createPublicRouter({ judge, limits }) {
  const router = Router();
  const run = (fn) => (req, res, next) => Promise.resolve(fn(req)).then((data) => res.json({ success: true, data })).catch(next);
  router.get('/overview', limits.publicRead, run(() => judge.overview()));
  router.post('/assess', limits.publicAssess, validate(assessmentSchema), run((req) => judge.assess(req.valid.body)));
  router.post('/analyze', limits.publicAi, validate(analysisSchema), run((req) => judge.analyze(req.valid.body)));
  return router;
}
