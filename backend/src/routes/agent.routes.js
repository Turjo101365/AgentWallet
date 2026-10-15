import { Router } from 'express';
import {
  getAgentStatus,
  triggerEvaluation,
  listProposals,
  approveProposal,
  rejectProposal,
  toggleAgentPause,
} from '../controllers/agentController.js';

const router = Router();

router.get('/status', getAgentStatus);
router.post('/evaluate', triggerEvaluation);
router.get('/proposals', listProposals);
router.post('/proposals/:id/approve', approveProposal);
router.post('/proposals/:id/reject', rejectProposal);
router.post('/toggle-pause', toggleAgentPause);

export default router;
