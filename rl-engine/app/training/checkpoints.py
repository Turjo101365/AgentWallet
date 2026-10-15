"""
Checkpoint management utilities for PPO and DQN trained models.
"""
import os
from pathlib import Path
from typing import Optional, List

class CheckpointManager:
    def __init__(self, base_models_dir: Optional[Path] = None):
        self.base_dir = base_models_dir or (Path(__file__).resolve().parent.parent.parent / "models")
        self.ppo_dir = self.base_dir / "ppo"
        self.dqn_dir = self.base_dir / "dqn"
        self.ppo_dir.mkdir(parents=True, exist_ok=True)
        self.dqn_dir.mkdir(parents=True, exist_ok=True)

    def get_latest_checkpoint(self, agent_type: str) -> Optional[Path]:
        target_dir = self.ppo_dir if agent_type.upper() == "PPO" else self.dqn_dir
        checkpoints = sorted(target_dir.glob("*.zip"), key=os.path.getmtime, reverse=True)
        return checkpoints[0] if checkpoints else None

    def list_checkpoints(self, agent_type: str) -> List[Path]:
        target_dir = self.ppo_dir if agent_type.upper() == "PPO" else self.dqn_dir
        return sorted(target_dir.glob("*.zip"), key=os.path.getmtime, reverse=True)
