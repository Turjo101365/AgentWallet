"""
FastAPI Routes for AgentWallet RL Microservice.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any

from .schemas import (
    ObservationRequest,
    PredictionResponse,
    StateProposalRequest,
    EvaluateRequest,
    ModelInfo,
    HealthResponse,
)
from ..agents.agent_registry import registry
from ..agents.inference import inference_engine
from ..environment.action_space import get_action_details
from ..environment.wallet_env import WalletEnv

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def get_health():
    return HealthResponse(
        status="healthy",
        engine="AgentWallet-RL-Engine",
        active_agent=registry.get_active_agent_name(),
        models_available=["PPO", "DQN"],
    )

@router.get("/models", response_model=List[ModelInfo])
def list_models():
    return [ModelInfo(**item) for item in registry.list_agents()]

@router.post("/models/select")
def select_active_model(agent_type: str):
    try:
        registry.set_active_agent(agent_type)
        return {
            "status": "success",
            "active_agent": registry.get_active_agent_name(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/predict/ppo", response_model=PredictionResponse)
def predict_ppo(req: ObservationRequest):
    agent = registry.get_agent("PPO")
    action_idx, confidence, meta = agent.predict(req.observation, deterministic=req.deterministic)
    action_details = get_action_details(action_idx)

    return PredictionResponse(
        agent="PPO",
        version=agent.version,
        action=action_idx,
        action_name=action_details["name"],
        confidence=confidence,
        probabilities=meta.get("policy_distribution"),
        value_estimate=meta.get("value_estimate"),
    )

@router.post("/predict/dqn", response_model=PredictionResponse)
def predict_dqn(req: ObservationRequest):
    agent = registry.get_agent("DQN")
    action_idx, confidence, meta = agent.predict(req.observation, deterministic=req.deterministic)
    action_details = get_action_details(action_idx)

    return PredictionResponse(
        agent="DQN",
        version=agent.version,
        action=action_idx,
        action_name=action_details["name"],
        confidence=confidence,
        q_values=meta.get("q_values"),
    )

@router.post("/predict/active", response_model=PredictionResponse)
def predict_active(req: ObservationRequest):
    active_agent_name = registry.get_active_agent_name()
    if active_agent_name == "DQN":
        return predict_dqn(req)
    return predict_ppo(req)

@router.post("/propose")
def propose_action(req: StateProposalRequest):
    """
    Takes raw wallet observation state and returns full structured proposal with
    explainable AI reasoning and deterministic safety validation.
    """
    try:
        proposal = inference_engine.generate_decision(
            raw_state=req.raw_state,
            agent_type=req.agent_type,
            recipient_override=req.recipient_override,
        )
        return proposal
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

@router.post("/evaluate")
def evaluate_agent(req: EvaluateRequest):
    try:
        agent = registry.get_agent(req.agent_type)
        env = WalletEnv()
        results = agent.evaluate_policy(env, episodes=req.episodes)
        return {
            "agent": req.agent_type,
            "version": agent.version,
            "evaluation": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation error: {str(e)}")
