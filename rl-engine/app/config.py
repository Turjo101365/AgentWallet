import os
from pathlib import Path

# Base paths
APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
MODELS_DIR = ROOT_DIR / "models"
CONFIGS_DIR = ROOT_DIR / "configs"

# Environment settings with fallback defaults
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Model paths
PPO_CONFIG_PATH = CONFIGS_DIR / "ppo.yaml"
DQN_CONFIG_PATH = CONFIGS_DIR / "dqn.yaml"
PPO_MODEL_DIR = MODELS_DIR / "ppo"
DQN_MODEL_DIR = MODELS_DIR / "dqn"

# Guardrail constants
MAX_PER_TX_LIMIT_ETH = float(os.getenv("MAX_PER_TX_LIMIT_ETH", "0.01"))
MAX_DAILY_LIMIT_ETH = float(os.getenv("MAX_DAILY_LIMIT_ETH", "0.05"))
MAX_GAS_BASE_FEE_GWEI = float(os.getenv("MAX_GAS_BASE_FEE_GWEI", "45.0"))
MAX_SLIPPAGE_BPS = float(os.getenv("MAX_SLIPPAGE_BPS", "50.0"))
