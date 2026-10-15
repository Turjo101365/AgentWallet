"""
Deterministic Action Validator for AgentWallet.
Validates proposed actions before human authorization or execution.
Operates completely independently of ML/RL policy networks.
"""
import time
from typing import Dict, Any, List
from .constraints import SafetyConstraints, ValidationResult

class DeterministicActionValidator:
    def __init__(self, constraints: SafetyConstraints = None):
        self.constraints = constraints or SafetyConstraints()

    def validate_action(
        self,
        action_index: int,
        action_name: str,
        amount_eth: float,
        recipient: str,
        current_state: Dict[str, Any]
    ) -> ValidationResult:
        violations: List[str] = []

        # 1. Action 0 (HOLD) is always inherently safe
        if action_index == 0 or action_name == "HOLD":
            return ValidationResult(
                passed=True,
                violations=[],
                daily_limit_remaining_eth=max(0.0, self.constraints.max_daily_spend_eth - current_state.get("dailySpentEth", 0.0)),
                gas_base_fee_gwei=current_state.get("baseFeeGwei", 0.0),
                validated_at=int(time.time())
            )

        # 2. Check if contract is paused
        if current_state.get("isContractPaused", False):
            violations.append("Contract is currently in paused state. Outbound payments are blocked.")

        # 3. Check single transaction limit
        per_tx_limit = current_state.get("perTxLimitEth", self.constraints.max_per_tx_eth)
        if amount_eth > per_tx_limit:
            violations.append(
                f"Proposed amount ({amount_eth:.4f} ETH) exceeds per-transaction limit ({per_tx_limit:.4f} ETH)."
            )

        # 4. Check cumulative daily spending limit
        daily_spent = current_state.get("dailySpentEth", 0.0)
        daily_limit = current_state.get("dailyLimitEth", self.constraints.max_daily_spend_eth)
        remaining_daily_budget = max(0.0, daily_limit - daily_spent)

        if daily_spent + amount_eth > daily_limit:
            violations.append(
                f"Proposed amount ({amount_eth:.4f} ETH) exceeds remaining daily limit ({remaining_daily_budget:.4f} ETH)."
            )

        # 5. Check treasury reserve balance
        native_balance = current_state.get("nativeBalanceEth", 0.0)
        if native_balance - amount_eth < self.constraints.min_reserve_balance_eth:
            violations.append(
                f"Execution would breach minimum reserve floor ({self.constraints.min_reserve_balance_eth:.4f} ETH)."
            )

        # 6. Check gas base fee threshold
        gas_base_fee = current_state.get("baseFeeGwei", 0.0)
        if gas_base_fee > self.constraints.max_gas_base_fee_gwei:
            violations.append(
                f"Mempool gas base fee ({gas_base_fee:.1f} Gwei) exceeds maximum threshold ({self.constraints.max_gas_base_fee_gwei:.1f} Gwei)."
            )

        # 7. Check recipient address format
        if not recipient or not recipient.startswith("0x") or len(recipient) != 42:
            violations.append(f"Invalid EVM recipient address: '{recipient}'.")

        if recipient.lower() == "0x0000000000000000000000000000000000000000":
            violations.append("Zero address recipient is forbidden.")

        passed = len(violations) == 0

        return ValidationResult(
            passed=passed,
            violations=violations,
            daily_limit_remaining_eth=remaining_daily_budget,
            gas_base_fee_gwei=gas_base_fee,
            validated_at=int(time.time())
        )
