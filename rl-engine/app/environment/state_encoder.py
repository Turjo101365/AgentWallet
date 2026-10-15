"""
State encoder and normalizer for AgentWallet RL environment.
Encodes 8-dimensional state vectors for neural network ingestion.
"""
import math
from typing import List, Dict, Any

OBSERVATION_DIM = 8

class StateEncoder:
    def __init__(
        self,
        target_reserve_eth: float = 2.0,
        daily_limit_eth: float = 0.05,
        max_gas_scale_gwei: float = 50.0,
        max_slippage_scale_bps: float = 100.0,
    ):
        self.target_reserve_eth = target_reserve_eth
        self.daily_limit_eth = daily_limit_eth
        self.max_gas_scale_gwei = max_gas_scale_gwei
        self.max_slippage_scale_bps = max_slippage_scale_bps

    def encode(self, raw_state: Dict[str, Any]) -> List[float]:
        """
        Transforms raw state dictionary into normalized 8D vector.
        """
        # 1. Normalized native balance [0.0 - 2.0]
        balance_eth = float(raw_state.get("nativeBalanceEth", 1.0))
        norm_balance = min(2.0, max(0.0, balance_eth / self.target_reserve_eth))

        # 2. Daily spent ratio [0.0 - 1.0+]
        daily_spent = float(raw_state.get("dailySpentEth", 0.0))
        norm_daily_spent = min(1.5, daily_spent / max(0.001, self.daily_limit_eth))

        # 3. Remaining daily headroom [0.0 - 1.0]
        daily_headroom = max(0.0, 1.0 - (daily_spent / max(0.001, self.daily_limit_eth)))

        # 4. Normalized gas base fee [0.0 - 2.0]
        gas_base_fee = float(raw_state.get("baseFeeGwei", 15.0))
        norm_gas = min(2.0, max(0.0, gas_base_fee / self.max_gas_scale_gwei))

        # 5. Mempool congestion factor [0.0 - 1.0]
        mempool_congestion = float(raw_state.get("mempoolCongestion", 0.2))
        mempool_congestion = min(1.0, max(0.0, mempool_congestion))

        # 6. Observed pool spread / slippage [0.0 - 2.0]
        slippage_bps = float(raw_state.get("slippageSpreadBps", 15.0))
        norm_slippage = min(2.0, max(0.0, slippage_bps / self.max_slippage_scale_bps))

        # 7. Diurnal time cycle [-1.0, 1.0]
        timestamp = raw_state.get("timestamp", 0)
        time_of_day_phase = math.sin(2.0 * math.pi * (timestamp % 86400) / 86400.0)

        # 8. Contract operational status (1.0 = Active, 0.0 = Paused)
        is_paused = bool(raw_state.get("isContractPaused", False))
        contract_status = 0.0 if is_paused else 1.0

        return [
            round(norm_balance, 4),
            round(norm_daily_spent, 4),
            round(daily_headroom, 4),
            round(norm_gas, 4),
            round(mempool_congestion, 4),
            round(norm_slippage, 4),
            round(time_of_day_phase, 4),
            round(contract_status, 4),
        ]
