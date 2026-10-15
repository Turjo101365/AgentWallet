"""
Evaluation script for DQN policy.
"""
from ..environment.wallet_env import WalletEnv
from ..agents.dqn_agent import DQNAgent
from .metrics import compute_evaluation_summary

def evaluate_dqn(episodes: int = 10, checkpoint_path: str = None):
    print(f"--- Evaluating DQN Agent across {episodes} episodes ---")
    agent = DQNAgent()
    if checkpoint_path:
        agent.load_checkpoint(checkpoint_path)

    env = WalletEnv()
    rewards = []
    violations = 0
    total_actions = 0
    executed = 0
    gas_consumed = 0.0

    for ep in range(episodes):
        obs, _ = env.reset()
        done = False
        ep_reward = 0.0
        while not done:
            action, _, _ = agent.predict(obs)
            obs, reward, term, trunc, info = env.step(action)
            ep_reward += reward
            total_actions += 1
            if not info.get("validation_passed", True):
                violations += 1
            if action in [1, 2]:
                executed += 1
                gas_consumed += info.get("base_fee_gwei", 15.0)
            done = term or trunc
        rewards.append(ep_reward)

    summary = compute_evaluation_summary(rewards, violations, total_actions, gas_consumed, executed)
    print("DQN Evaluation Results:")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    return summary

if __name__ == "__main__":
    evaluate_dqn(10)
