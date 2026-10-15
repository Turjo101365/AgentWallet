"""
Registry of trained execution-timing policies.

A policy is AVAILABLE only if its checkpoint and metadata load *and* a health-check inference on a
fixed observation returns a valid action with finite outputs. Otherwise it is UNAVAILABLE with the
reason; the service never substitutes a heuristic and calls it RL.
"""
from __future__ import annotations

import json
import hashlib
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from ..config import MODELS_DIR
from ..timing.env import EXECUTE
from ..timing.features import OBSERVATION_DIM

ALGORITHMS = ("PPO", "DQN")
HEALTH_OBS = np.array([-0.2, -0.05, 0.1, 0.1, 0.5, 0.0, 1.0, 0.0], dtype=np.float32)


@dataclass
class LoadedPolicy:
    algorithm: str
    model: Any = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: str = "unavailable"
    reason: Optional[str] = "not loaded"

    @property
    def available(self) -> bool:
        return self.status == "available"

    @property
    def version(self) -> Optional[str]:
        return self.metadata.get("version")

    def predict(self, obs: np.ndarray) -> Dict[str, Any]:
        import torch
        with torch.inference_mode():
            return self._predict(obs)

    def _predict(self, obs: np.ndarray) -> Dict[str, Any]:
        obs = np.asarray(obs, dtype=np.float32).reshape(1, -1)
        action, _ = self.model.predict(obs, deterministic=True)
        out: Dict[str, Any] = {"action": int(action[0])}
        if self.algorithm == "PPO":
            tensor = self.model.policy.obs_to_tensor(obs)[0]
            probs = self.model.policy.get_distribution(tensor).distribution.probs.detach().cpu().numpy()[0]
            out["action_probabilities"] = [float(p) for p in probs]
        else:
            tensor = self.model.q_net.obs_to_tensor(obs)[0]
            out["q_values"] = [float(q) for q in self.model.q_net(tensor).detach().cpu().numpy()[0]]
        return out

    def describe(self) -> Dict[str, Any]:
        m = self.metadata
        test = (m.get("test_metrics") or {}).get(self.algorithm.lower())
        return {
            "name": self.algorithm,
            "status": self.status,
            "reason": self.reason,
            "version": self.version,
            "task": m.get("task"),
            "trained_at": m.get("trained_at"),
            "total_timesteps": m.get("total_timesteps"),
            "seed": m.get("seed"),
            "config_sha256_12": m.get("config_sha256_12"),
            "libraries": m.get("libraries"),
            "data": m.get("data"),
            "test_set": m.get("test_set"),
            "test_metrics": test,
            "baselines": {k: v for k, v in (m.get("test_metrics") or {}).items() if k != self.algorithm.lower()},
        }


class PolicyRegistry:
    def __init__(self, models_dir: Path = MODELS_DIR, autoload: bool = True) -> None:
        self.models_dir = Path(models_dir)
        self.policies: Dict[str, LoadedPolicy] = {a: LoadedPolicy(a) for a in ALGORITHMS}
        self.active = "PPO"
        if autoload:
            self.reload()

    def _load(self, algorithm: str) -> LoadedPolicy:
        policy = LoadedPolicy(algorithm)
        folder = self.models_dir / algorithm.lower()
        ckpt, meta = folder / "best_model.zip", folder / "metadata.json"
        if not ckpt.exists():
            policy.reason = "no trained checkpoint (run: python -m app.training.train --algo %s)" % algorithm.lower()
            return policy
        if not meta.exists():
            policy.reason = "checkpoint has no metadata.json; refusing an unversioned model"
            return policy
        try:
            policy.metadata = json.loads(meta.read_text(encoding="utf-8"))
            if policy.metadata.get("task") != "execution_timing":
                policy.reason = f"checkpoint task is {policy.metadata.get('task')!r}, expected 'execution_timing'"
                return policy
            expected = policy.metadata.get("checkpoint_sha256")
            if expected and hashlib.sha256(ckpt.read_bytes()).hexdigest() != expected:
                raise ValueError("checkpoint SHA-256 does not match metadata")
            if policy.metadata.get("algorithm", algorithm) != algorithm:
                raise ValueError("checkpoint algorithm does not match registry slot")
            if algorithm == "PPO":
                from stable_baselines3 import PPO as Algo
            else:
                from stable_baselines3 import DQN as Algo
            policy.model = Algo.load(str(ckpt), device="cpu")
        except ImportError:
            policy.reason = "stable_baselines3/torch not installed (pip install -r requirements-train.txt)"
            policy.model = None
            return policy
        except Exception as exc:  # corrupt or incompatible checkpoint
            policy.reason = f"failed to load checkpoint: {exc}"
            policy.model = None
            return policy
        try:
            if policy.model.observation_space.shape != (OBSERVATION_DIM,):
                raise ValueError(f"observation shape {policy.model.observation_space.shape} != ({OBSERVATION_DIM},)")
            result = policy.predict(HEALTH_OBS)
            values = result.get("action_probabilities") or result.get("q_values") or []
            if result["action"] not in (0, 1) or not all(math.isfinite(v) for v in values):
                raise ValueError("health-check inference returned invalid output")
        except Exception as exc:
            policy.reason = f"health check failed: {exc}"
            policy.model = None
            return policy
        policy.status, policy.reason = "available", None
        return policy

    def reload(self) -> Dict[str, str]:
        for a in ALGORITHMS:
            self.policies[a] = self._load(a)
        return {a: p.status for a, p in self.policies.items()}

    def get(self, name: Optional[str]) -> LoadedPolicy:
        key = (name or self.active).upper()
        if key not in self.policies:
            raise ValueError(f"Unknown policy {name!r}; expected one of {ALGORITHMS}")
        return self.policies[key]

    def set_active(self, name: str) -> None:
        self.get(name)
        self.active = name.upper()

    def list(self) -> List[Dict[str, Any]]:
        return [{**p.describe(), "is_active": a == self.active} for a, p in self.policies.items()]


registry = PolicyRegistry()
EXECUTE_ACTION = EXECUTE
