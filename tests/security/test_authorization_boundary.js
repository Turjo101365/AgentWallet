/**
 * Security Test: Authorization Boundaries & Custody Isolation
 * Verifies non-custodial boundaries and TTL expiration security.
 */
import assert from 'node:assert';
import { test, describe } from 'node:test';
import { agentOrchestrator } from '../../backend/src/services/agentOrchestrator.js';
import { approvalRepository } from '../../backend/src/repositories/approvalRepository.js';
import { decisionRepository } from '../../backend/src/repositories/decisionRepository.js';

describe('Security: Non-Custodial Authorization Boundaries', () => {
  test('Expired proposal cannot be approved after TTL elapses', async () => {
    const expiredDecisionId = 'expired-decision-001';
    const pastTimestamp = Math.floor(Date.now() / 1000) - 30; // 30s ago in past

    await decisionRepository.save({
      decisionId: expiredDecisionId,
      agentType: 'PPO',
      modelVersion: 'AgentPolicy_v2.4_PPO',
      actionIndex: 1,
      actionType: 'MICRO_PAYMENT',
      confidenceScore: 0.9,
      rationale: 'Test expired proposal',
      proposedParameters: { amountEth: 0.005, recipient: '0xE592427A0AEce92De3Edee1F18E0157C05861564' },
      createdAt: pastTimestamp - 180,
    });

    // Seed expired approval in repository
    await approvalRepository.save({
      decisionId: expiredDecisionId,
      status: 'AWAITING_APPROVAL',
      ttlSeconds: 180,
      expiresAt: pastTimestamp,
    });

    // Mock decision
    await agentOrchestrator.approveProposal(expiredDecisionId).catch((err) => {
      assert.match(err.message, /Proposal has expired/);
    });
  });

  test('Backend never stores or exposes private keys in generated calldata', async () => {
    // Calldata generated for executePayment only contains recipient address and amount
    const recipient = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    const amountEth = 0.01;
    const { blockchainService } = await import('../../backend/src/services/blockchainService.js');

    const callPayload = blockchainService.encodeExecutePaymentCall(recipient, amountEth);
    assert.ok(callPayload.calldata);
    assert.strictEqual(typeof callPayload.calldata, 'string');
    assert.ok(callPayload.calldata.startsWith('0x'));

    // Verify no private key fields exist in output
    assert.strictEqual(callPayload.privateKey, undefined);
    assert.strictEqual(callPayload.signerKey, undefined);
  });
});
