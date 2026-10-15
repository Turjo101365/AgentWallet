import { Router } from 'express';
import { listModels, selectActiveModel, evaluateModel } from '../controllers/rlController.js';

const router = Router();

router.get('/models', listModels);
router.post('/models/select', selectActiveModel);
router.post('/evaluate', evaluateModel);

export default router;
