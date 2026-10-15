"""
Train a PPO or DQN execution-timing policy and write a versioned checkpoint.

    python -m app.training.train --algo ppo
    python -m app.training.train --algo dqn --timesteps 300000 --seed 7

Outputs (MODEL_DIR/<algo>/):
    best_model.zip   SB3 checkpoint selected on validation episodes
    metadata.json    version, config + hash, seeds, library versions, held-out test metrics
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import tempfile
import time
from pathlib import Path

import yaml

from ..config import CONFIGS_DIR, MODELS_DIR
from ..evaluation.evaluate import VALIDATION_SEED_START, compare
from ..timing.env import GasTimingEnv


def _load_config(algo: str, path: str | None) -> dict:
    cfg_file = Path(path) if path else CONFIGS_DIR / f"{algo}.yaml"
    with open(cfg_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def train(algo: str, timesteps: int | None = None, seed: int | None = None, config_path: str | None = None,
          out_dir: Path | None = None, test_episodes: int | None = None) -> dict:
    import gymnasium as gym
    import stable_baselines3
    import torch
    from stable_baselines3 import DQN, PPO
    from stable_baselines3.common.callbacks import EvalCallback
    from stable_baselines3.common.monitor import Monitor

    cfg = _load_config(algo, config_path)
    timesteps = int(timesteps or cfg["training"]["total_timesteps"])
    seed = int(cfg["training"]["seed"] if seed is None else seed)
    test_episodes = int(test_episodes or cfg["evaluation"]["test_episodes"])
    config_hash = hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:12]
    version = f"{algo}-timing-{config_hash}-s{seed}-t{timesteps}"

    train_env = Monitor(GasTimingEnv())
    eval_env = Monitor(GasTimingEnv())
    eval_env.reset(seed=VALIDATION_SEED_START)
    Algo = PPO if algo == "ppo" else DQN
    model = Algo("MlpPolicy", train_env, seed=seed, verbose=0, **cfg["hyperparameters"])

    workdir = Path(tempfile.mkdtemp(prefix=f"aw-{algo}-"))
    callback = EvalCallback(eval_env, n_eval_episodes=int(cfg["evaluation"]["validation_episodes"]),
                            eval_freq=int(cfg["evaluation"]["eval_freq"]), best_model_save_path=str(workdir),
                            deterministic=True, verbose=0)
    started = time.time()
    model.learn(total_timesteps=timesteps, callback=callback, progress_bar=False)
    train_seconds = round(time.time() - started, 1)

    best_file = workdir / "best_model.zip"
    best = Algo.load(str(best_file)) if best_file.exists() else model

    def policy(obs):
        action, _ = best.predict(obs, deterministic=True)
        return int(action)

    test = compare({algo: policy}, episodes=test_episodes)

    out = Path(out_dir) if out_dir else MODELS_DIR / algo
    out.mkdir(parents=True, exist_ok=True)
    best.save(str(out / "best_model.zip"))
    metadata = {
        "algorithm": algo.upper(),
        "checkpoint_sha256": hashlib.sha256((out / "best_model.zip").read_bytes()).hexdigest(),
        "task": "execution_timing",
        "version": version,
        "config_sha256_12": config_hash,
        "config": cfg,
        "seed": seed,
        "total_timesteps": timesteps,
        "train_seconds": train_seconds,
        "best_validation_mean_reward": None if callback.best_mean_reward == float("-inf") else round(float(callback.best_mean_reward), 4),
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "libraries": {"stable_baselines3": stable_baselines3.__version__, "torch": torch.__version__,
                      "gymnasium": gym.__version__, "python": platform.python_version()},
        "data": "synthetic gas process (app/timing/gas_process.py); not market data",
        "test_set": {"seed_start": 1_000_000, "episodes": test_episodes},
        "test_metrics": test,
    }
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    shutil.rmtree(workdir, ignore_errors=True)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--algo", choices=["ppo", "dqn"], required=True)
    parser.add_argument("--timesteps", type=int)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--config")
    parser.add_argument("--test-episodes", type=int)
    args = parser.parse_args()
    meta = train(args.algo, args.timesteps, args.seed, args.config, test_episodes=args.test_episodes)
    print(json.dumps({"version": meta["version"], "train_seconds": meta["train_seconds"], "test_metrics": meta["test_metrics"]}, indent=2))


if __name__ == "__main__":
    main()
