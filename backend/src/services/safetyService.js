import { DEFAULT_GUARDRAILS } from '../../../shared/constants.js';

export class SafetyService {
  constructor(guardrails = DEFAULT_GUARDRAILS) {
    this.guardrails = guardrails;
  }

  validateProposal(proposal, walletState) {
    const violations = [];
    const amountEth = proposal.proposedParameters?.amountEth || 0.0;
    const recipient = proposal.proposedParameters?.recipient;

    // Action 0 (HOLD) is always inherently safe
    if (proposal.actionIndex === 0 || proposal.actionType === 'HOLD') {
      return {
        passed: true,
        violations: [],
        dailyLimitRemainingEth: Math.max(0, (walletState.dailyLimitEth || this.guardrails.MAX_DAILY_SPEND_ETH) - (walletState.dailySpentEth || 0.0)),
        validatedAt: Math.floor(Date.now() / 1000)
      };
    }

    // 1. Contract pause check
    if (walletState.isContractPaused) {
      violations.push('Smart contract is paused. Execution halted.');
    }

    // 2. Per-transaction limit
    const perTxLimit = walletState.perTxLimitEth || this.guardrails.MAX_SINGLE_TX_ETH;
    if (amountEth > perTxLimit) {
      violations.push(`Proposed amount (${amountEth} ETH) exceeds per-transaction limit (${perTxLimit} ETH).`);
    }

    // 3. Daily spending limit
    const dailyLimit = walletState.dailyLimitEth || this.guardrails.MAX_DAILY_SPEND_ETH;
    const dailySpent = walletState.dailySpentEth || 0.0;
    const remainingDaily = Math.max(0, dailyLimit - dailySpent);

    if (dailySpent + amountEth > dailyLimit) {
      violations.push(`Proposed amount (${amountEth} ETH) exceeds remaining daily limit (${remainingDaily} ETH).`);
    }

    // 4. Reserve floor check
    const currentBalance = walletState.nativeBalanceEth || 0.0;
    if (currentBalance - amountEth < 0.05) {
      violations.push('Execution would breach the 0.05 ETH minimum safety reserve.');
    }

    // 5. Gas base fee check
    const baseFee = walletState.baseFeeGwei || 0.0;
    if (baseFee > this.guardrails.MAX_GAS_BASE_FEE_GWEI) {
      violations.push(`Mempool base fee (${baseFee} Gwei) exceeds threshold (${this.guardrails.MAX_GAS_BASE_FEE_GWEI} Gwei).`);
    }

    // 6. Recipient sanity
    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
      violations.push(`Invalid recipient address: "${recipient}".`);
    }

    return {
      passed: violations.length === 0,
      violations,
      dailyLimitRemainingEth: remainingDaily,
      validatedAt: Math.floor(Date.now() / 1000)
    };
  }
}

export const safetyService = new SafetyService();
