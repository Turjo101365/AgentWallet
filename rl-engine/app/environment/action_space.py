"""
Discrete action space definitions for AgentWallet RL environment.
Compatible with standard DQN and discrete PPO.
"""
from typing import Dict, Any

ACTION_HOLD = 0
ACTION_MICRO_PAYMENT = 1
ACTION_STANDARD_REBALANCE = 2
ACTION_DEFENSIVE_STABILIZE = 3

NUM_ACTIONS = 4

ACTION_MAP: Dict[int, Dict[str, Any]] = {
    ACTION_HOLD: {
        "name": "HOLD",
        "description": "Observe next block without executing transactions",
        "amount_eth": 0.0,
        "requires_signature": False,
        "gas_limit": 0,
    },
    ACTION_MICRO_PAYMENT: {
        "name": "MICRO_PAYMENT",
        "description": "Execute sub-limit operational payment (0.005 ETH)",
        "amount_eth": 0.005,
        "requires_signature": True,
        "gas_limit": 65000,
    },
    ACTION_STANDARD_REBALANCE: {
        "name": "STANDARD_REBALANCE",
        "description": "Standard liquidity rebalance or payment (0.010 ETH)",
        "amount_eth": 0.010,
        "requires_signature": True,
        "gas_limit": 142500,
    },
    ACTION_DEFENSIVE_STABILIZE: {
        "name": "DEFENSIVE_STABILIZE",
        "description": "Defensively conserve funds / pause execution due to volatility",
        "amount_eth": 0.0,
        "requires_signature": True,
        "gas_limit": 45000,
    },
}

def get_action_details(action_idx: int) -> Dict[str, Any]:
    return ACTION_MAP.get(action_idx, ACTION_MAP[ACTION_HOLD])
