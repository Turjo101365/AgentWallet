"""
AgentWallet Gymnasium Environment.
Simulates autonomous treasury operations, gas markets, and contract limits.
Does not interact directly with real funds or live private keys.
"""
import random
import time
from typing import Tuple, Dict, Any, Optional

try:
    import gymnasium as gym
    from gymnasium import spaces
    import numpy as np
    HAS_GYM = True
except ImportError:
    HAS_GYM = False
    # Fallback dummy class if gymnasium / numpy is not installed
    class gym:
        class Env:
            pass
    class spaces:
        class Discrete:
            def __init__(self, n): self.n = n
        class Box:
            def __init__(self, low, high, shape, dtype=None):
                self.low = low
                self.high = high
                self.shape = shape

from .action_space import NUM_ACTIONS, get_action_details
from .state_encoder import StateEncoder, OBSERVATION_DIM
from .reward_function import WalletRewardFunction
from ..safety.action_validator import DeterministicActionValidator

class WalletEnv(gym.Env):
    """
    Simulated Environment for AgentWallet treasury policy training.
    """
    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        initial_balance_eth: float = 2.0,
        per_tx_limit_eth: float = 0.01,
        daily_limit_eth: float = 0.05,
        max_steps: int = 100,
    ):
        super().__init__()
        self.initial_balance_eth = initial_balance_eth
        self.per_tx_limit_eth = per_tx_limit_eth
        self.daily_limit_eth = daily_limit_eth
        self.max_steps = max_steps

        # 4 Discrete Actions: 0=HOLD, 1=MICRO_PAYMENT, 2=STANDARD_REBALANCE, 3=DEFENSIVE_STABILIZE
        self.action_space = spaces.Discrete(NUM_ACTIONS)

        # 8-Dimensional Normalized Observation Vector
        if HAS_GYM:
            self.observation_space = spaces.Box(
                low=-1.0, high=2.0, shape=(OBSERVATION_DIM,), dtype=np.float32
            )
        else:
            self.observation_space = spaces.Box(low=-1.0, high=2.0, shape=(OBSERVATION_DIM,))

        self.encoder = StateEncoder(
            target_reserve_eth=initial_balance_eth,
            daily_limit_eth=daily_limit_eth,
        )
        self.reward_fn = WalletRewardFunction()
        self.validator = DeterministicActionValidator()

        # Dynamic State Variables
        self.current_step = 0
        self.balance_eth = initial_balance_eth
        self.daily_spent_eth = 0.0
        self.base_fee_gwei = 15.0
        self.mempool_congestion = 0.2
        self.slippage_bps = 12.0
        self.is_paused = False
        self.current_timestamp = int(time.time())

    def reset(
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Any, Dict[str, Any]]:
        super().reset(seed=seed) if HAS_GYM and hasattr(super(), "reset") else None
        if seed is not None:
            random.seed(seed)

        self.current_step = 0
        self.balance_eth = self.initial_balance_eth
        self.daily_spent_eth = 0.0
        self.base_fee_gwei = random.uniform(12.0, 22.0)
        self.mempool_congestion = random.uniform(0.1, 0.35)
        self.slippage_bps = random.uniform(8.0, 25.0)
        self.is_paused = False
        self.current_timestamp = int(time.time())

        obs = self._get_observation()
        info = self._get_info()
        return obs, info

    def step(self, action: int) -> Tuple[Any, float, bool, bool, Dict[str, Any]]:
        self.current_step += 1
        action_details = get_action_details(action)
        proposed_amount = action_details.get("amount_eth", 0.0)

        # Deterministic Safety Validation against simulated state
        raw_state = self._get_raw_state()
        val_result = self.validator.validate_action(
            action_index=action,
            action_name=action_details["name"],
            amount_eth=proposed_amount,
            recipient="0x1234567890123456789012345678901234567890",
            current_state=raw_state
        )

        is_violated = not val_result.passed

        # If valid and non-zero amount, execute in simulation
        if not is_violated and proposed_amount > 0:
            self.balance_eth -= proposed_amount
            self.daily_spent_eth += proposed_amount

        # Compute reward
        reward = self.reward_fn.calculate_reward(
            action_idx=action,
            action_details=action_details,
            raw_state=raw_state,
            is_limit_violated=is_violated
        )

        # Environment dynamics update (Ornstein-Uhlenbeck gas drift + noise)
        drift = 0.15 * (18.0 - self.base_fee_gwei) + random.gauss(0, 3.5)
        self.base_fee_gwei = max(8.0, min(80.0, self.base_fee_gwei + drift))
        self.mempool_congestion = max(0.05, min(0.95, self.mempool_congestion + random.gauss(0, 0.08)))
        self.slippage_bps = max(4.0, min(120.0, self.slippage_bps + random.gauss(0, 4.0)))
        self.current_timestamp += 12  # Advance 12 seconds (~ 1 EVM block)

        # Check termination & truncation
        terminated = self.balance_eth < 0.05  # Reserve depleted
        truncated = self.current_step >= self.max_steps

        obs = self._get_observation()
        info = self._get_info()
        info["action_name"] = action_details["name"]
        info["validation_passed"] = val_result.passed
        info["violations"] = val_result.violations

        return obs, reward, terminated, truncated, info

    def _get_raw_state(self) -> Dict[str, Any]:
        return {
            "nativeBalanceEth": self.balance_eth,
            "dailySpentEth": self.daily_spent_eth,
            "dailyLimitEth": self.daily_limit_eth,
            "perTxLimitEth": self.per_tx_limit_eth,
            "baseFeeGwei": self.base_fee_gwei,
            "mempoolCongestion": self.mempool_congestion,
            "slippageSpreadBps": self.slippage_bps,
            "isContractPaused": self.is_paused,
            "timestamp": self.current_timestamp,
        }

    def _get_observation(self) -> Any:
        vec = self.encoder.encode(self._get_raw_state())
        if HAS_GYM:
            return np.array(vec, dtype=np.float32)
        return vec

    def _get_info(self) -> Dict[str, Any]:
        return {
            "step": self.current_step,
            "balance_eth": round(self.balance_eth, 4),
            "daily_spent_eth": round(self.daily_spent_eth, 4),
            "base_fee_gwei": round(self.base_fee_gwei, 2),
            "slippage_bps": round(self.slippage_bps, 2),
        }
