"""
RL execution-timing advisory service. Reachable only from the backend; holds no keys, moves no
funds, and cannot override the backend's deterministic policy or deadlines.
"""
from fastapi import APIRouter, HTTPException

from ..agents.registry import registry
from ..evaluation.evaluate import compare
from ..timing.features import timing_features
from .schemas import EvaluateRequest, HealthResponse, TimingRequest

router = APIRouter()
ACTIONS = {0: "WAIT", 1: "EXECUTE_NOW"}


@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="healthy",
        engine="AgentWallet-RL-Timing",
        task="execution_timing",
        active_policy=registry.active,
        policies={name: p.status for name, p in registry.policies.items()},
    )


@router.get("/models")
def models():
    return registry.list()


@router.post("/models/reload")
def reload():
    return {"policies": registry.reload()}


@router.post("/models/select")
def select(agent_type: str):
    try:
        registry.set_active(agent_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"active_policy": registry.active}


@router.post("/timing")
def timing(req: TimingRequest):
    """Advice for one decision point. If the policy is unavailable it says so; it never guesses."""
    try:
        policy = registry.get(req.agent_type)
        obs = timing_features(req.gas_history, req.steps_remaining, req.window_steps, req.hour_of_day)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    base = {"agentType": policy.algorithm, "observation": [round(float(x), 6) for x in obs]}
    if not policy.available:
        return {**base, "status": "unavailable", "reason": policy.reason, "advice": None, "modelVersion": None}
    result = policy.predict(obs)
    return {
        **base,
        "status": "ok",
        "advice": ACTIONS[result["action"]],
        "modelVersion": policy.version,
        "actionProbabilities": result.get("action_probabilities"),
        "qValues": result.get("q_values"),
    }


@router.post("/evaluate")
def evaluate(req: EvaluateRequest):
    """Fresh held-out comparison of every available policy against the baselines."""
    policies = {}
    for name, p in registry.policies.items():
        if p.available:
            policies[name.lower()] = (lambda pol: (lambda obs: pol.predict(obs)["action"]))(p)
    return {"episodes": req.episodes, "available": list(policies), "results": compare(policies, episodes=req.episodes)}
