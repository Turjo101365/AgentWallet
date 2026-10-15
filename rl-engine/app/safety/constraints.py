"""
Safety constraints and bounding invariants for AgentWallet RL policies.
"""
from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class SafetyConstraints:
    max_per_tx_eth: float = 0.01
    max_daily_spend_eth: float = 0.05
    max_gas_base_fee_gwei: float = 45.0
    max_slippage_bps: float = 50.0
    min_reserve_balance_eth: float = 0.05

@dataclass
class ValidationResult:
    passed: bool
    violations: List[str] = field(default_factory=list)
    daily_limit_remaining_eth: float = 0.0
    gas_base_fee_gwei: float = 0.0
    validated_at: Optional[int] = None
