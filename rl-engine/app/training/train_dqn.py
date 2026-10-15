"""
DQN Agent Training Pipeline.
Trains a Deep Q-Network with experience replay and target network.
"""
import os
import yaml
from pathlib import Path

from ..environment.wallet_env import WalletEnv
from .callbacks import SafetyAuditCallback

def train_dqn(
    total_timesteps: int = 10000,
    config_path: str = None,
    output_model_path: str = None
):
    print("====================================================")
    print("Initiating DQN Training Pipeline for AgentWallet")
    print(f"Total Timesteps: {total_timesteps}")
    print("====================================================")

    # Resolve config
    default_cfg = Path(__file__).resolve().parent.parent.parent / "configs" / "dqn.yaml"
    cfg_file = config_path or default_cfg

    hyperparams = {
        "learning_rate": 0.0005,
        "buffer_size": 20000,
        "learning_starts": 500,
        "batch_size": 64,
        "gamma": 0.99,
    }

    if os.path.exists(cfg_file):
        with open(cfg_file, "r") as f:
            loaded_cfg = yaml.safe_load(f)
            if "hyperparameters" in loaded_cfg:
                hyperparams.update(loaded_cfg["hyperparameters"])

    try:
        from stable_baselines3 import DQN
        env = WalletEnv()
        model = DQN(
            "MlpPolicy",
            env,
            learning_rate=hyperparams.get("learning_rate", 0.0005),
            buffer_size=hyperparams.get("buffer_size", 20000),
            learning_starts=hyperparams.get("learning_starts", 500),
            batch_size=hyperparams.get("batch_size", 64),
            gamma=hyperparams.get("gamma", 0.99),
            verbose=1
        )

        callback = SafetyAuditCallback(check_freq=1000)
        model.learn(total_timesteps=total_timesteps, callback=callback)

        out_path = output_model_path or (
            Path(__file__).resolve().parent.parent.parent / "models" / "dqn" / "best_model.zip"
        )
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        model.save(str(out_path))
        print(f"DQN Checkpoint successfully saved to: {out_path}")
        return str(out_path)
    except ImportError:
        print("[Notice] stable_baselines3 not installed in this environment.")
        print("To run the full neural training loop, install requirements via:")
        print("pip install -r requirements.txt")
        return None

if __name__ == "__main__":
    train_dqn(total_timesteps=2048)
