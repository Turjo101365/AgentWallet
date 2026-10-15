"""
Agent Registry managing active PPO and DQN instances.
"""
from typing import Dict, Optional, List
from .base_agent import BaseRLAgent
from .ppo_agent import PPOAgent
from .dqn_agent import DQNAgent

class AgentRegistry:
    def __init__(self):
        self._agents: Dict[str, BaseRLAgent] = {
            "PPO": PPOAgent(),
            "DQN": DQNAgent(),
        }
        self._active_agent_name = "PPO"

    def get_agent(self, agent_name: Optional[str] = None) -> BaseRLAgent:
        name = (agent_name or self._active_agent_name).upper()
        if name not in self._agents:
            raise ValueError(f"Unknown agent type '{name}'. Registered: {list(self._agents.keys())}")
        return self._agents[name]

    def set_active_agent(self, agent_name: str) -> None:
        name = agent_name.upper()
        if name not in self._agents:
            raise ValueError(f"Unknown agent type '{name}'. Registered: {list(self._agents.keys())}")
        self._active_agent_name = name

    def get_active_agent_name(self) -> str:
        return self._active_agent_name

    def list_agents(self) -> List[Dict]:
        return [
            {
                "name": name,
                "is_active": name == self._active_agent_name,
                "version": agent.version,
                "is_loaded": agent.is_loaded,
                "checkpoint_path": agent.checkpoint_path,
            }
            for name, agent in self._agents.items()
        ]

# Global singleton
registry = AgentRegistry()
