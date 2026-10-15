"""
Evaluation metrics calculation for AgentWallet RL policies.
Calculates Mean Reward, Sharpe Ratio, Gas Efficiency, and Safety Violation Rate.
"""
import math
from typing import List, Dict, Any

def compute_sharpe_ratio(rewards: List[float], risk_free_rate: float = 0.0) -> float:
    if not rewards or len(rewards) < 2:
        return 0.0
    mean_r = sum(rewards) / len(rewards)
    variance = sum((r - mean_r) ** 2 for r in rewards) / (len(rewards) - 1)
    std_dev = math.sqrt(variance)
    if std_dev == 0:
        return 0.0
    return round((mean_r - risk_free_rate) / std_dev, 3)

def compute_evaluation_summary(
    rewards: List[float],
    violations_count: int,
    total_actions: int,
    gas_spent_gwei: float,
    actions_executed: int
) -> Dict[str, Any]:
    mean_reward = sum(rewards) / len(rewards) if rewards else 0.0
    violation_rate = (violations_count / max(1, total_actions)) * 100.0
    sharpe = compute_sharpe_ratio(rewards)

    return {
        "episodes": len(rewards),
        "mean_episode_reward": round(mean_reward, 3),
        "sharpe_ratio": sharpe,
        "total_actions": total_actions,
        "actions_executed": actions_executed,
        "violations_count": violations_count,
        "safety_violation_rate_pct": round(violation_rate, 3),
        "total_gas_consumed_gwei": round(gas_spent_gwei, 2),
    }
