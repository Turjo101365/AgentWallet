"""
Non-learned reference policies for the timing task. Evaluation reports RL against all of them.
"""
from __future__ import annotations

from typing import Callable, Dict, List

import numpy as np

from .env import EXECUTE, WAIT

Policy = Callable[[np.ndarray], int]


def execute_immediately(_obs: np.ndarray) -> int:
    """What the system does with no model: submit as soon as the payment is due."""
    return EXECUTE


def threshold_policy(margin: float = 0.10) -> Policy:
    """Execute once the price is at least `margin` below its long-run EMA (feature 0), else wait."""
    cutoff = float(np.log(1.0 - margin))

    def policy(obs: np.ndarray) -> int:
        return EXECUTE if obs[0] <= cutoff else WAIT

    return policy


def oracle_cost(path: List[float], delay_cost: float) -> Dict[str, float]:
    """Hindsight-optimal execution step (uses future prices; unattainable, a lower bound on cost)."""
    start = path[0]
    totals = [p / start + i * delay_cost for i, p in enumerate(path)]
    best = int(np.argmin(totals))
    return {"cost_ratio": path[best] / start, "executed_step": best}
