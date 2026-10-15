/**
 * E2E Simulation Test: Complete 9-Stage Execution Lifecycle
 */
import assert from 'node:assert';
import { test, describe } from 'node:test';
import { agentOrchestrator } from '../../backend/src/services/agentOrchestrator.js';

describe('E2E Lifecycle: State -> Inference -> Safety -> Approval -> Calldata', () => {
  test('Complete flow executes deterministically through all checkpoints', async () => {
    // 1. Trigger evaluation cycle
    const mockState = {
      chainId: 84532,
      blockNumber: 6842109,
      nativeBalanceEth: 2.5,
      dailySpentEth: 0.005,
      dailyLimitEth: 0.05,
      perTxLimitEth: 0.01,
      baseFeeGwei: 14.5,
      mempoolCongestion: 0.22,
      slippageSpreadBps: 10.0,
      isContractPaused: false,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const proposal = await agentOrchestrator.runEvaluationCycle('PPO', mockState);

    // 2. Verify proposal contents
    assert.ok(proposal.decisionId);
    assert.strictEqual(proposal.agentType, 'PPO');
    assert.ok(proposal.confidenceScore > 0);
    assert.strictEqual(proposal.deterministicValidation.passed, true);
    assert.strictEqual(proposal.authorization.status, 'AWAITING_APPROVAL');

    // 3. User Approves proposal
    const approvalResult = await agentOrchestrator.approveProposal(
      proposal.decisionId,
      '0x71C8412eD33ef08083a216F669B78D8210D3498B'
    );

    assert.strictEqual(approvalResult.status, 'APPROVED');
    assert.ok(approvalResult.callData.calldata);
  });
});
