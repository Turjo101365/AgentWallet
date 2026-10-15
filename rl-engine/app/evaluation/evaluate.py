"""
Held-out evaluation for timing policies.

Every policy (RL or baseline) is run on the *same* episodes (same seeds -> same price paths), so
comparisons are paired. Test seeds never overlap training or validation seeds:
    training     seeds drawn by SB3 from the training seed
    validation   500_000 + i   (checkpoint selection during training)
    test         1_000_000 + i (reported numbers; never used for selection)
"""
from __future__ import annotations

from typing import Callable, Dict, List, Optional

import numpy as np

from ..timing.baselines import execute_immediately, oracle_cost, threshold_policy
from ..timing.env import GasTimingEnv, TimingEnvConfig

VALIDATION_SEED_START = 500_000
TEST_SEED_START = 1_000_000


def run_policy(policy: Callable[[np.ndarray], int], seeds: List[int], config: Optional[TimingEnvConfig] = None) -> Dict[str, np.ndarray]:
    env = GasTimingEnv(config)
    cost, total, steps, forced, oracle = [], [], [], [], []
    for seed in seeds:
        obs, _ = env.reset(seed=seed)
        path = env.price_path()
        done = False
        info: Dict = {}
        while not done:
            obs, _r, done, _t, info = env.step(policy(obs))
        cost.append(info["cost_ratio"])
        steps.append(info["executed_step"])
        total.append(info["cost_ratio"] + info["executed_step"] * env.config.delay_cost)
        forced.append(1.0 if info["forced"] else 0.0)
        oracle.append(oracle_cost(path, env.config.delay_cost)["cost_ratio"])
    return {k: np.array(v, dtype=np.float64) for k, v in
            {"cost": cost, "total": total, "steps": steps, "forced": forced, "oracle": oracle}.items()}


def _bootstrap_ci(values: np.ndarray, rng: np.random.Generator, n: int = 2000) -> List[float]:
    idx = rng.integers(0, len(values), size=(n, len(values)))
    means = values[idx].mean(axis=1)
    return [float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))]


def summarize(result: Dict[str, np.ndarray], reference: Dict[str, np.ndarray]) -> Dict[str, object]:
    """reference = execute-immediately on the same seeds. Savings are paired per episode."""
    rng = np.random.default_rng(0)
    fee_saving = (reference["cost"] - result["cost"]) / reference["cost"]
    objective_gain = reference["total"] - result["total"]
    return {
        "episodes": int(len(result["cost"])),
        "mean_fee_ratio": round(float(result["cost"].mean()), 4),
        "mean_fee_saving_pct": round(float(fee_saving.mean() * 100), 2),
        "fee_saving_pct_ci95": [round(x * 100, 2) for x in _bootstrap_ci(fee_saving, rng)],
        "mean_objective_gain": round(float(objective_gain.mean()), 4),
        "objective_gain_ci95": [round(x, 4) for x in _bootstrap_ci(objective_gain, rng)],
        "mean_wait_steps": round(float(result["steps"].mean()), 2),
        "forced_at_deadline_pct": round(float(result["forced"].mean() * 100), 2),
        "mean_regret_vs_oracle": round(float((result["cost"] - result["oracle"]).mean()), 4),
        "pct_episodes_worse_than_immediate": round(float((result["total"] > reference["total"] + 1e-12).mean() * 100), 2),
    }


def compare(policies: Dict[str, Callable[[np.ndarray], int]], episodes: int = 1000, seed_start: int = TEST_SEED_START,
            config: Optional[TimingEnvConfig] = None) -> Dict[str, Dict[str, object]]:
    seeds = list(range(seed_start, seed_start + episodes))
    reference = run_policy(execute_immediately, seeds, config)
    out = {"execute_immediately": summarize(reference, reference),
           "threshold_10pct": summarize(run_policy(threshold_policy(0.10), seeds, config), reference)}
    for name, policy in policies.items():
        out[name] = summarize(run_policy(policy, seeds, config), reference)
    oracle = reference["oracle"]
    out["oracle_hindsight"] = {
        "episodes": episodes,
        "mean_fee_ratio": round(float(oracle.mean()), 4),
        "mean_fee_saving_pct": round(float(((reference["cost"] - oracle) / reference["cost"]).mean() * 100), 2),
        "note": "Uses future prices; an unattainable lower bound, not a policy.",
    }
    return out
