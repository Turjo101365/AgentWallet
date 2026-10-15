"""
Training metrics collection and aggregation utilities.
"""
from typing import Dict, Any, List

class TrainingMetricsTracker:
    def __init__(self):
        self.step_history: List[int] = []
        self.reward_history: List[float] = []
        self.violations_history: List[int] = []

    def record_step(self, step: int, reward: float, violation: bool):
        self.step_history.append(step)
        self.reward_history.append(reward)
        self.violations_history.append(1 if violation else 0)

    def get_summary(self) -> Dict[str, Any]:
        total_steps = len(self.step_history)
        avg_reward = sum(self.reward_history) / max(1, total_steps)
        total_violations = sum(self.violations_history)
        return {
            "total_steps": total_steps,
            "average_reward": round(avg_reward, 4),
            "total_violations": total_violations,
            "violation_rate": round(total_violations / max(1, total_steps), 4),
        }
