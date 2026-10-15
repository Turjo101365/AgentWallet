"""
Request/response schemas for the RL timing service. Requests forbid unknown fields.
"""
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TimingRequest(StrictModel):
    gas_history: List[float] = Field(..., min_length=1, max_length=512, description="Recent gas prices (any unit), oldest first, fixed interval")
    steps_remaining: int = Field(..., ge=0, le=10_000)
    window_steps: int = Field(..., ge=1, le=10_000)
    hour_of_day: float = Field(..., ge=0, lt=24)
    agent_type: Optional[str] = Field(None, pattern="^(PPO|DQN|ppo|dqn)$")


class EvaluateRequest(StrictModel):
    episodes: int = Field(500, ge=50, le=5000)


class HealthResponse(BaseModel):
    status: str
    engine: str
    task: str
    active_policy: str
    policies: Dict[str, str]
