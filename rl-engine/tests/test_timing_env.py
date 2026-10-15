"""
Gymnasium interface and reward semantics of the execution-timing environment.
"""
import math
import unittest

import numpy as np
from gymnasium.utils.env_checker import check_env

from app.timing.baselines import oracle_cost
from app.timing.env import EXECUTE, WAIT, GasTimingEnv
from app.timing.features import timing_features


class TestTimingEnv(unittest.TestCase):
    def test_passes_gymnasium_env_checker(self):
        check_env(GasTimingEnv(), skip_render_check=True)

    def test_same_seed_same_episode(self):
        a, b = GasTimingEnv(), GasTimingEnv()
        oa, _ = a.reset(seed=123)
        ob, _ = b.reset(seed=123)
        np.testing.assert_array_equal(oa, ob)
        self.assertEqual(a.price_path(), b.price_path())

    def test_execute_immediately_costs_exactly_one(self):
        env = GasTimingEnv()
        env.reset(seed=1)
        _obs, reward, done, _t, info = env.step(EXECUTE)
        self.assertTrue(done)
        self.assertAlmostEqual(reward, -1.0)
        self.assertEqual(info["executed_step"], 0)

    def test_waiting_has_a_cost_and_deadline_forces_execution(self):
        env = GasTimingEnv()
        env.reset(seed=2)
        rewards, done, info = [], False, {}
        while not done:
            _o, r, done, _t, info = env.step(WAIT)
            rewards.append(r)
        self.assertTrue(info["forced"])
        self.assertEqual(info["executed_step"], env.window - 1)
        self.assertTrue(all(math.isclose(r, -env.config.delay_cost) for r in rewards[:-1]))
        self.assertAlmostEqual(rewards[-1], -info["cost_ratio"])

    def test_reward_is_fee_cost_not_spending(self):
        # Every episode settles exactly one payment; reward only reflects the relative fee and delay.
        env = GasTimingEnv()
        env.reset(seed=3)
        _o, r, _d, _t, _i = env.step(EXECUTE)
        self.assertEqual(r, -1.0)

    def test_observation_has_no_lookahead(self):
        env = GasTimingEnv()
        obs0, _ = env.reset(seed=4)
        path = env.price_path()
        env._path = path[:1] + [p * 10 for p in path[1:]]  # change only future prices
        np.testing.assert_array_equal(env._obs(), obs0)

    def test_oracle_is_a_lower_bound(self):
        env = GasTimingEnv()
        for seed in range(20):
            env.reset(seed=seed)
            self.assertLessEqual(oracle_cost(env.price_path(), env.config.delay_cost)["cost_ratio"], 1.0 + 1e-9)


class TestFeatures(unittest.TestCase):
    def test_features_are_scale_free(self):
        hist = [1.0, 1.1, 0.9, 1.2, 0.8, 1.05, 0.95, 1.0, 0.7]
        a = timing_features(hist, 5, 10, 13.0)
        b = timing_features([g * 1e-6 for g in hist], 5, 10, 13.0)  # Base Sepolia-scale fees
        np.testing.assert_allclose(a, b, rtol=1e-4, atol=1e-5)

    def test_rejects_invalid_prices(self):
        for bad in ([], [0.0], [-1.0], [float("nan")]):
            with self.assertRaises(ValueError):
                timing_features(bad, 1, 2, 0.0)

    def test_deadline_flag(self):
        self.assertEqual(timing_features([1.0], 0, 4, 0.0)[7], 1.0)
        self.assertEqual(timing_features([1.0], 2, 4, 0.0)[7], 0.0)


if __name__ == "__main__":
    unittest.main()
