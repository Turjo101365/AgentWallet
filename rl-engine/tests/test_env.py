"""
Unit tests for WalletEnv environment.
"""
import unittest
from app.environment.wallet_env import WalletEnv

class TestWalletEnv(unittest.TestCase):
    def test_wallet_env_initialization(self):
        env = WalletEnv(initial_balance_eth=2.0)
        obs, info = env.reset()
        self.assertEqual(len(obs), 8)
        self.assertEqual(info["balance_eth"], 2.0)
        self.assertEqual(info["daily_spent_eth"], 0.0)

    def test_wallet_env_step(self):
        env = WalletEnv(initial_balance_eth=2.0)
        env.reset()
        obs, reward, term, trunc, info = env.step(0)
        self.assertEqual(len(obs), 8)
        self.assertIsInstance(reward, float)
        self.assertFalse(term)
        self.assertFalse(trunc)
        self.assertEqual(info["action_name"], "HOLD")
        self.assertTrue(info["validation_passed"])

    def test_wallet_env_spend_updates_balance(self):
        env = WalletEnv(initial_balance_eth=2.0)
        env.reset()
        obs, reward, term, trunc, info = env.step(1)
        self.assertEqual(round(info["daily_spent_eth"], 3), 0.005)
        self.assertEqual(round(info["balance_eth"], 3), 1.995)

if __name__ == "__main__":
    unittest.main()
