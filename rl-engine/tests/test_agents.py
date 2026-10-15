"""
Tests for PPO and DQN Agent interfaces.
"""
import unittest
from app.agents.ppo_agent import PPOAgent
from app.agents.dqn_agent import DQNAgent
from app.agents.agent_registry import registry

class TestAgents(unittest.TestCase):
    def test_ppo_agent_predict(self):
        agent = PPOAgent()
        sample_obs = [0.8, 0.1, 0.9, 0.3, 0.2, 0.15, 0.5, 1.0]
        action, conf, meta = agent.predict(sample_obs)
        self.assertTrue(0 <= action <= 3)
        self.assertTrue(0.0 <= conf <= 1.0)
        self.assertIn("policy_distribution", meta)
        self.assertEqual(len(meta["policy_distribution"]), 4)

    def test_dqn_agent_predict(self):
        agent = DQNAgent()
        sample_obs = [0.8, 0.1, 0.9, 0.3, 0.2, 0.15, 0.5, 1.0]
        action, conf, meta = agent.predict(sample_obs)
        self.assertTrue(0 <= action <= 3)
        self.assertTrue(0.0 <= conf <= 1.0)
        self.assertIn("q_values", meta)
        self.assertEqual(len(meta["q_values"]), 4)

    def test_agent_registry(self):
        self.assertIn(registry.get_active_agent_name(), ["PPO", "DQN"])
        registry.set_active_agent("DQN")
        self.assertEqual(registry.get_active_agent_name(), "DQN")
        agent = registry.get_agent()
        self.assertEqual(agent.agent_name, "DQN")
        registry.set_active_agent("PPO")

if __name__ == "__main__":
    unittest.main()
