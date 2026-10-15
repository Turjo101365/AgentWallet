"""
GasTimingEnv: when should an already-authorized payment be submitted within its window?

Episode: a payment becomes due with an execution window of W decision steps (randomized).
Actions: 0 = WAIT, 1 = EXECUTE. At the final step execution is forced (the real system enforces the
deadline deterministically, not the policy).

Reward:
    on execution: -(gas_at_execution / gas_at_window_start)   relative fee paid; executing at once = -1.0
    per WAIT:     -delay_cost                                 opportunity / settlement-delay cost
The agent learns to wait only when expected fee savings exceed the delay cost. It is never rewarded
for spending: every episode settles exactly one payment, whatever the policy does.

The price path for the window is generated at reset (so evaluation baselines and the oracle see the
same path), but observations only ever include prices up to the current step: no look-ahead.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .features import OBSERVATION_DIM, timing_features
from .gas_process import GasProcess, GasProcessConfig

WAIT, EXECUTE = 0, 1


@dataclass(frozen=True)
class TimingEnvConfig:
    min_window: int = 8
    max_window: int = 32
    delay_cost: float = 0.004
    gas: GasProcessConfig = field(default_factory=GasProcessConfig)


class GasTimingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, config: Optional[TimingEnvConfig] = None):
        super().__init__()
        self.config = config or TimingEnvConfig()
        self.action_space = spaces.Discrete(2)
        self.observation_space = spaces.Box(low=-5.0, high=5.0, shape=(OBSERVATION_DIM,), dtype=np.float32)
        self._past: List[float] = []
        self._path: List[float] = []
        self._hours: List[float] = []
        self._window = 0
        self._step = 0

    @property
    def window(self) -> int:
        return self._window

    def price_path(self) -> List[float]:
        """Full window price path (evaluation / baselines only; never part of the observation)."""
        return list(self._path)

    def _obs(self) -> np.ndarray:
        visible = self._past + self._path[: self._step + 1]
        return timing_features(visible, self._window - 1 - self._step, self._window, self._hours[self._step])

    def reset(self, *, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        proc = GasProcess.create(self.config.gas, self.np_random)
        self._window = int(self.np_random.integers(self.config.min_window, self.config.max_window + 1))
        self._past = list(proc.history[:-1])
        self._path = [proc.history[-1]]
        self._hours = [proc.hour_of_day(len(proc.history) - 1)]
        for _ in range(self._window - 1):
            self._hours.append(proc.hour_of_day())
            self._path.append(proc.step())
        self._step = 0
        return self._obs(), {"window": self._window}

    def step(self, action: int):
        if not self._path:
            raise RuntimeError("call reset() first")
        forced = self._step >= self._window - 1
        if int(action) == EXECUTE or forced:
            cost_ratio = self._path[self._step] / self._path[0]
            info = {"executed_step": self._step, "cost_ratio": cost_ratio, "forced": forced and int(action) != EXECUTE, "window": self._window}
            return self._obs(), float(-cost_ratio), True, False, info
        self._step += 1
        return self._obs(), float(-self.config.delay_cost), False, False, {}
