"""
Base Agent Interface for AgentWallet Reinforcement Learning.
Enforces identical method signatures across PPO, DQN, and future policies.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple

class BaseRLAgent(ABC):
    def __init__(self, agent_name: str, version: str):
        self.agent_name = agent_name
        self.version = version
        self.is_loaded = False
        self.checkpoint_path = None

    @abstractmethod
    def load_checkpoint(self, checkpoint_path: str) -> bool:
        """Loads weights from disk checkpoint."""
        pass

    @abstractmethod
    def predict(
        self,
        observation: List[float],
        deterministic: bool = True
    ) -> Tuple[int, float, Dict[str, Any]]:
        """
        Given an 8-dim observation vector, returns:
        (action_index, confidence_score, metadata_dict)
        """
        pass

    @abstractmethod
    def evaluate_policy(self, env: Any, episodes: int = 10) -> Dict[str, Any]:
        """Runs evaluation rollout across n episodes and returns summary metrics."""
        pass

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "agent_name": self.agent_name,
            "version": self.version,
            "is_loaded": self.is_loaded,
            "checkpoint_path": str(self.checkpoint_path) if self.checkpoint_path else None,
        }
