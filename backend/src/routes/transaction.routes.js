import { Router } from 'express';
import { listTransactions, trackTransaction } from '../controllers/transactionController.js';
import { validateBody } from '../middleware/validateRequest.js';

const router = Router();

router.get('/', listTransactions);
router.post('/track', validateBody(['fromAddress', 'toAddress']), trackTransaction);

export default router;
