import { v4 as uuidv4 } from 'uuid';
import { blockchainService } from './blockchainService.js';
import { rlClient } from './rlClient.js';
import { safetyService } from './safetyService.js';
import { decisionRepository } from '../repositories/decisionRepository.js';
import { approvalRepository } from '../repositories/approvalRepository.js';

class AgentOrchestrator {
  constructor() {
    this.activeAgent = 'PPO';
    this.engineMode = 'HITL_AUTONOMOUS';
    this.isAgentPaused = false;
  }

  toggleAgentPause(requestedState = null) {
    if (requestedState !== null && typeof requestedState === 'boolean') {
      this.isAgentPaused = requestedState;
    } else {
      this.isAgentPaused = !this.isAgentPaused;
    }
    return this.isAgentPaused;
  }

  async runEvaluationCycle(agentTypeOverride = null, stateOverride = null) {
    if (this.isAgentPaused) {
      const error = new Error('Agent execution is currently in EMERGENCY PAUSE mode. Evaluations and proposals are halted.');
      error.statusCode = 403;
      throw error;
    }

    const selectedAgent = agentTypeOverride || this.activeAgent;

    // 1. Observe state
    const walletState = stateOverride || await blockchainService.getWalletState();

    // 2. Request proposal from RL engine
    let proposal = await rlClient.proposeAction(walletState, selectedAgent);

    // Fallback if RL engine is offline
    if (!proposal) {
      const decisionId = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      proposal = {
        decisionId,
        agentType: selectedAgent,
        modelVersion: selectedAgent === 'PPO' ? 'AgentPolicy_v2.4_PPO' : 'AgentPolicy_v1.8_DQN',
        actionIndex: 2,
        actionType: 'STANDARD_REBALANCE',
        proposedParameters: {
          recipient: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
          amountEth: 0.01,
          maxSlippageBps: 30.0,
          gasLimit: 142500,
        },
        confidenceScore: 0.948,
        rationale: `[Offline Local Simulation] ${selectedAgent} evaluated standard liquidity rebalance parameters.`,
        deterministicValidation: { passed: true, violations: [] },
        authorization: {
          status: 'AWAITING_APPROVAL',
          ttlSeconds: 180,
          expiresAt: now + 180,
          signatureRequired: true
        },
        createdAt: now,
        isSimulated: true,
      };
    }

    // 3. Run Deterministic Safety Invariant Checks
    const validationResult = safetyService.validateProposal(proposal, walletState);
    proposal.deterministicValidation = validationResult;

    if (!validationResult.passed) {
      proposal.authorization.status = 'REJECTED';
      proposal.authorization.signatureRequired = false;
    }

    proposal.observedState = walletState;

    // 4. Persist to Repositories
    await decisionRepository.save(proposal);
    await approvalRepository.save({
      decisionId: proposal.decisionId,
      status: proposal.authorization.status,
      ttlSeconds: proposal.authorization.ttlSeconds || 180,
      expiresAt: proposal.authorization.expiresAt,
      signerAddress: null,
      rejectionReason: validationResult.passed ? null : validationResult.violations.join('; '),
      resolvedAt: null,
    });

    return proposal;
  }

  async approveProposal(decisionId, signerAddress = null) {
    const decision = await decisionRepository.findById(decisionId);
    if (!decision) {
      throw new Error(`Decision proposal "${decisionId}" not found.`);
    }

    const approval = await approvalRepository.findByDecisionId(decisionId);
    const now = Math.floor(Date.now() / 1000);

    if (approval && approval.expiresAt < now) {
      approval.status = 'EXPIRED';
      await approvalRepository.save(approval);
      throw new Error('Proposal has expired (180s TTL elapsed).');
    }

    // Prepare encoded calldata for client-side MetaMask signing
    const recipient = decision.proposedParameters?.recipient || '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    const amountEth = decision.proposedParameters?.amountEth || 0.01;
    const callData = blockchainService.encodeExecutePaymentCall(recipient, amountEth);

    // Update approval status
    const updatedApproval = {
      decisionId,
      status: 'APPROVED',
      signerAddress,
      resolvedAt: now,
      expiresAt: approval?.expiresAt || now + 180
    };
    await approvalRepository.save(updatedApproval);

    return {
      decisionId,
      status: 'APPROVED',
      callData,
      proposedParameters: decision.proposedParameters,
      approvedAt: now,
    };
  }

  async rejectProposal(decisionId, reason = 'Operator rejected') {
    const approval = await approvalRepository.findByDecisionId(decisionId);
    const updated = {
      decisionId,
      status: 'REJECTED',
      rejectionReason: reason,
      resolvedAt: Math.floor(Date.now() / 1000),
      expiresAt: approval?.expiresAt || Math.floor(Date.now() / 1000)
    };
    await approvalRepository.save(updated);
    return { decisionId, status: 'REJECTED', reason };
  }
}

export const agentOrchestrator = new AgentOrchestrator();
