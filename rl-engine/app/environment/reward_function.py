"""
Composite reward function for AgentWallet RL environment.
Balances treasury yield, operational utility, gas efficiency, and safety.
"""
from typing import Dict, Any

class WalletRewardFunction:
    def __init__(
        self,
        gas_weight: float = 0.4,
        slippage_weight: float = 0.3,
        violation_penalty: float = 10.0,
    ):
        self.gas_weight = gas_weight
        self.slippage_weight = slippage_weight
        self.violation_penalty = violation_penalty

    def calculate_reward(
        self,
        action_idx: int,
        action_details: Dict[str, Any],
        raw_state: Dict[str, Any],
        is_limit_violated: bool,
    ) -> float:
        """
        Computes scalar reward signal.
        """
        # Severe penalty if action breaches contract constraints
        if is_limit_violated:
            return -self.violation_penalty

        base_fee_gwei = raw_state.get("baseFeeGwei", 15.0)
        slippage_bps = raw_state.get("slippageSpreadBps", 15.0)

        # 1. Operational utility reward
        utility_reward = 0.0
        if action_idx == 0:  # HOLD
            # Small positive reinforcement for patience during high gas
            if base_fee_gwei > 30.0:
                utility_reward = 0.6
            else:
                utility_reward = 0.1
        elif action_idx == 1:  # MICRO_PAYMENT
            utility_reward = 1.5
        elif action_idx == 2:  # STANDARD_REBALANCE
            utility_reward = 3.0
        elif action_idx == 3:  # DEFENSIVE_STABILIZE
            # Reward for defending treasury during severe congestion or spreads
            if base_fee_gwei > 40.0 or slippage_bps > 40.0:
                utility_reward = 1.8
            else:
                utility_reward = -0.2

        # 2. Gas expenditure penalty (exponential scaling past 20 Gwei)
        gas_penalty = 0.0
        if action_details.get("requires_signature", False):
            gas_ratio = max(0.0, base_fee_gwei / 15.0)
            gas_penalty = self.gas_weight * (gas_ratio ** 1.3)

        # 3. Slippage spread penalty
        slippage_penalty = 0.0
        if action_details.get("requires_signature", False):
            slippage_penalty = self.slippage_weight * (slippage_bps / 20.0)

        total_reward = utility_reward - gas_penalty - slippage_penalty
        return round(float(total_reward), 4)
