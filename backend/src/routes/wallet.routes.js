import { Router } from 'express';
import { getWalletState } from '../controllers/walletController.js';

const router = Router();

router.get('/state', getWalletState);

export default router;
