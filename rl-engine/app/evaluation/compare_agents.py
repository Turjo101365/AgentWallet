"""
Comparative Evaluation runner for PPO vs DQN.
Executes both policies under identical seeds to benchmark performance.
"""
from .evaluate_ppo import evaluate_ppo
from .evaluate_dqn import evaluate_dqn

def compare_agents(episodes: int = 15):
    print("==========================================================")
    print("AgentWallet: Benchmarking PPO vs DQN Policies")
    print("==========================================================")

    ppo_results = evaluate_ppo(episodes=episodes)
    print("\n----------------------------------------------------------\n")
    dqn_results = evaluate_dqn(episodes=episodes)

    print("\n==========================================================")
    print("Summary Comparison Matrix:")
    print(f"{'Metric':<30} | {'PPO':<12} | {'DQN':<12}")
    print("-" * 60)
    for k in ppo_results.keys():
        print(f"{k:<30} | {str(ppo_results[k]):<12} | {str(dqn_results.get(k, 'N/A')):<12}")
    print("==========================================================")

    return {
        "PPO": ppo_results,
        "DQN": dqn_results
    }

if __name__ == "__main__":
    compare_agents(10)
