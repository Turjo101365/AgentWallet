import { Router } from 'express';
import { getContractConfig } from '../controllers/contractController.js';

const router = Router();

router.get('/config', getContractConfig);

export default router;
