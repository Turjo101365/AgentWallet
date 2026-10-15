import { agentOrchestrator } from '../services/agentOrchestrator.js';
import { decisionRepository } from '../repositories/decisionRepository.js';
import { approvalRepository } from '../repositories/approvalRepository.js';

export async function getAgentStatus(req, res, next) {
  try {
    const pending = await approvalRepository.listPending();
    const isPaused = agentOrchestrator.isAgentPaused;
    res.json({
      success: true,
      data: {
        state: isPaused ? 'EMERGENCY_PAUSED' : (pending.length > 0 ? 'AWAITING_APPROVAL' : 'IDLE'),
        isPaused,
        engineMode: agentOrchestrator.engineMode,
        activeModel: agentOrchestrator.activeAgent,
        modelVersion: agentOrchestrator.activeAgent === 'PPO' ? 'AgentPolicy_v2.4_PPO' : 'AgentPolicy_v1.8_DQN',
        pendingProposalsCount: pending.length,
        lastCycleEvaluation: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function triggerEvaluation(req, res, next) {
  try {
    const { agentType, overrideState } = req.body || {};
    const proposal = await agentOrchestrator.runEvaluationCycle(agentType, overrideState);
    res.json({
      success: true,
      data: proposal,
    });
  } catch (err) {
    next(err);
  }
}

export async function listProposals(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const proposals = await decisionRepository.listRecent(limit);
    res.json({
      success: true,
      data: proposals,
    });
  } catch (err) {
    next(err);
  }
}

export async function approveProposal(req, res, next) {
  try {
    const { id } = req.params;
    const { signerAddress } = req.body || {};
    const result = await agentOrchestrator.approveProposal(id, signerAddress);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectProposal(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const result = await agentOrchestrator.rejectProposal(id, reason);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleAgentPause(req, res, next) {
  try {
    const { isPaused } = req.body || {};
    const newStatus = agentOrchestrator.toggleAgentPause(isPaused);
    res.json({
      success: true,
      data: {
        isPaused: newStatus,
        message: newStatus
          ? 'Emergency Pause activated! Agent execution and evaluations halted.'
          : 'Agent execution resumed successfully.',
      },
    });
  } catch (err) {
    next(err);
  }
}
