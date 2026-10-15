/**
 * Integration Test: Agent to Deterministic Safety Pipeline
 * Verifies that untrusted agent proposals are strictly validated by safetyService.
 */
import assert from 'node:assert';
import { test, describe } from 'node:test';
import { SafetyService } from '../../backend/src/services/safetyService.js';

describe('Integration: Agent Safety Pipeline', () => {
  const safetyService = new SafetyService();

  test('Safe proposal within limits passes validation', () => {
    const proposal = {
      decisionId: 'test-safe-001',
      actionIndex: 1,
      actionType: 'MICRO_PAYMENT',
      proposedParameters: {
        recipient: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        amountEth: 0.005,
      },
    };

    const walletState = {
      nativeBalanceEth: 2.0,
      dailySpentEth: 0.01,
      dailyLimitEth: 0.05,
      perTxLimitEth: 0.01,
      baseFeeGwei: 15.0,
      isContractPaused: false,
    };

    const result = safetyService.validateProposal(proposal, walletState);
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.violations.length, 0);
  });

  test('Over-limit proposal is deterministically rejected', () => {
    const proposal = {
      decisionId: 'test-unsafe-001',
      actionIndex: 2,
      actionType: 'STANDARD_REBALANCE',
      proposedParameters: {
        recipient: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        amountEth: 0.02, // Exceeds 0.01 limit
      },
    };

    const walletState = {
      nativeBalanceEth: 2.0,
      dailySpentEth: 0.0,
      dailyLimitEth: 0.05,
      perTxLimitEth: 0.01,
      baseFeeGwei: 15.0,
      isContractPaused: false,
    };

    const result = safetyService.validateProposal(proposal, walletState);
    assert.strictEqual(result.passed, false);
    assert.ok(result.violations.length > 0);
    assert.match(result.violations[0], /per-transaction limit/);
  });

  test('HOLD action (Index 0) is always passed and incurs zero spend', () => {
    const holdProposal = {
      decisionId: 'test-hold-001',
      actionIndex: 0,
      actionType: 'HOLD',
      proposedParameters: { amountEth: 0.0 },
    };

    const walletState = {
      nativeBalanceEth: 0.02, // Low balance
      dailySpentEth: 0.05,    // At daily cap
      dailyLimitEth: 0.05,
      perTxLimitEth: 0.01,
      baseFeeGwei: 80.0,      // High gas
      isContractPaused: true, // Paused
    };

    const result = safetyService.validateProposal(holdProposal, walletState);
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.violations.length, 0);
  });
});
