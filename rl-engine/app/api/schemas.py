"""
Pydantic schemas for RL Engine API requests and responses.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ObservationRequest(BaseModel):
    observation: List[float] = Field(
        ...,
        description="8-dimensional normalized state vector",
        min_length=8,
        max_length=8
    )
    deterministic: bool = Field(True, description="Whether to evaluate deterministically")

class PredictionResponse(BaseModel):
    agent: str
    version: str
    action: int
    action_name: str
    confidence: float
    probabilities: Optional[List[float]] = None
    q_values: Optional[List[float]] = None
    value_estimate: Optional[float] = None

class StateProposalRequest(BaseModel):
    raw_state: Dict[str, Any] = Field(..., description="Raw wallet state dictionary")
    agent_type: Optional[str] = Field(None, description="PPO or DQN (defaults to active agent)")
    recipient_override: Optional[str] = Field(None, description="Optional target recipient address")

class EvaluateRequest(BaseModel):
    agent_type: str = Field("PPO", description="Agent to evaluate: PPO or DQN")
    episodes: int = Field(10, ge=1, le=100, description="Number of evaluation episodes")

class ModelInfo(BaseModel):
    name: str
    version: str
    is_active: bool
    is_loaded: bool
    checkpoint_path: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    engine: str
    active_agent: str
    models_available: List[str]
