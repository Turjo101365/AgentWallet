/**
 * AgentWallet Shared System Constants
 * Centralized enumeration of action spaces, supported networks, guardrails, and statuses.
 */

export const ACTION_SPACE = {
  HOLD: 0,
  MICRO_PAYMENT: 1,
  STANDARD_REBALANCE: 2,
  DEFENSIVE_STABILIZE: 3,
};

export const ACTION_NAMES = {
  0: 'HOLD',
  1: 'MICRO_PAYMENT',
  2: 'STANDARD_REBALANCE',
  3: 'DEFENSIVE_STABILIZE',
};

export const ACTION_DETAILS = {
  0: {
    name: 'HOLD',
    description: 'Maintain current wallet state, no on-chain transaction generated',
    requiresSignature: false,
    baseAmountEth: 0.0,
  },
  1: {
    name: 'MICRO_PAYMENT',
    description: 'Execute small operational payment (up to 0.005 ETH)',
    requiresSignature: true,
    baseAmountEth: 0.005,
  },
  2: {
    name: 'STANDARD_REBALANCE',
    description: 'Standard liquidity rebalance or payment (up to 0.01 ETH contract limit)',
    requiresSignature: true,
    baseAmountEth: 0.01,
  },
  3: {
    name: 'DEFENSIVE_STABILIZE',
    description: 'Pause or defensively conserve funds due to market volatility or gas spike',
    requiresSignature: true,
    baseAmountEth: 0.0,
  },
};

export const SUPPORTED_CHAINS = {
  BASE_SEPOLIA: 84532,
};

export const CHAIN_METADATA = {
  84532: {
    name: 'Base Sepolia Testnet',
    currency: 'ETH',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
  },
};

export const AGENT_TYPES = {
  PPO: 'PPO',
  DQN: 'DQN',
};

export const DECISION_STATUS = {
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SKIPPED_HOLD: 'SKIPPED_HOLD',
};

export const TX_STATUS = {
  AWAITING_USER_SIGNATURE: 'AWAITING_USER_SIGNATURE',
  BROADCASTED: 'BROADCASTED',
  CONFIRMED: 'CONFIRMED',
  REVERTED: 'REVERTED',
  REJECTED_BY_USER: 'REJECTED_BY_USER',
};

export const DEFAULT_GUARDRAILS = {
  MAX_SINGLE_TX_ETH: 0.01,        // Matches default perTransactionLimit in contract
  MAX_DAILY_SPEND_ETH: 0.05,       // Matches default dailySpendingLimit in contract
  MAX_SLIPPAGE_BPS: 50,            // 0.50%
  MAX_GAS_BASE_FEE_GWEI: 45,       // Defer execution if base fee exceeds 45 Gwei
  APPROVAL_TTL_SECONDS: 180,       // 3 minutes before unapproved proposal expires
};
