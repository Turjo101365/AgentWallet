"""
Checkpoint loading, versioning and health checks, plus genuine inference from the trained
checkpoints when present (models/<algo>/best_model.zip produced by app.training.train).
"""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app.agents.registry import PolicyRegistry
from app.config import MODELS_DIR
from app.evaluation.evaluate import compare
from app.timing.env import GasTimingEnv

try:
    import stable_baselines3  # noqa: F401

    HAS_SB3 = True
except ImportError:  # pragma: no cover
    HAS_SB3 = False

TRAINED = HAS_SB3 and all((MODELS_DIR / a / "best_model.zip").exists() for a in ("ppo", "dqn"))


class TestRegistryUnavailable(unittest.TestCase):
    def test_checkpoint_hash_mismatch_is_refused_before_deserialization(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d) / "ppo"
            folder.mkdir()
            (folder / "best_model.zip").write_bytes(b"tampered")
            (folder / "metadata.json").write_text(json.dumps({
                "task": "execution_timing", "algorithm": "PPO", "checkpoint_sha256": "0" * 64,
            }))
            policy = PolicyRegistry(Path(d)).get("PPO")
            self.assertFalse(policy.available)
            self.assertIn("SHA-256", policy.reason)

    def test_missing_checkpoint_is_unavailable_not_faked(self):
        with tempfile.TemporaryDirectory() as d:
            reg = PolicyRegistry(Path(d))
            for p in reg.policies.values():
                self.assertEqual(p.status, "unavailable")
                self.assertIn("no trained checkpoint", p.reason)
                self.assertIsNone(p.version)

    def test_checkpoint_without_metadata_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "ppo").mkdir()
            (Path(d) / "ppo" / "best_model.zip").write_bytes(b"x")
            self.assertIn("metadata", PolicyRegistry(Path(d)).get("PPO").reason)

    @unittest.skipUnless(HAS_SB3, "stable-baselines3 not installed")
    def test_corrupt_checkpoint_is_unavailable(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "dqn").mkdir()
            (Path(d) / "dqn" / "best_model.zip").write_bytes(b"not a zip")
            (Path(d) / "dqn" / "metadata.json").write_text(json.dumps({"task": "execution_timing", "version": "x"}))
            p = PolicyRegistry(Path(d)).get("DQN")
            self.assertEqual(p.status, "unavailable")
            self.assertIn("failed to load", p.reason)

    @unittest.skipUnless(TRAINED, "trained checkpoints not present")
    def test_wrong_task_metadata_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            shutil.copytree(MODELS_DIR / "ppo", Path(d) / "ppo")
            meta = json.loads((Path(d) / "ppo" / "metadata.json").read_text())
            meta["task"] = "treasury_spending"
            (Path(d) / "ppo" / "metadata.json").write_text(json.dumps(meta))
            self.assertIn("expected 'execution_timing'", PolicyRegistry(Path(d)).get("PPO").reason)


@unittest.skipUnless(TRAINED, "trained checkpoints not present")
class TestTrainedCheckpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reg = PolicyRegistry(MODELS_DIR)

    def test_checkpoints_load_with_versions_and_pass_health_check(self):
        for name in ("PPO", "DQN"):
            p = self.reg.get(name)
            self.assertEqual(p.status, "available", p.reason)
            self.assertTrue(p.version.startswith(name.lower() + "-timing-"))

    def test_genuine_inference_depends_on_the_observation(self):
        # Evidence that outputs come from the network, not a constant or a rule: on real env states the
        # policy is non-constant, deterministic, and its scores vary with the input. (No assumption is
        # made about *which* states it executes in; that is what the held-out evaluation measures.)
        env = GasTimingEnv()
        states = [env.reset(seed=s)[0] for s in range(3000, 3200)]
        for name in ("PPO", "DQN"):
            p = self.reg.get(name)
            outputs = [p.predict(o) for o in states]
            rate = sum(o["action"] for o in outputs) / len(outputs)
            self.assertGreater(rate, 0.0, name)
            self.assertLess(rate, 1.0, name)
            self.assertEqual(p.predict(states[0]), outputs[0], "inference must be deterministic")
            scores = [tuple(o.get("action_probabilities") or o.get("q_values")) for o in outputs]
            self.assertGreater(len(set(scores)), 100, name)
            if name == "PPO":
                for o in outputs[:20]:
                    self.assertAlmostEqual(sum(o["action_probabilities"]), 1.0, places=5)

    def test_fresh_held_out_episodes_beat_executing_immediately(self):
        policies = {n.lower(): (lambda pol: (lambda o: pol.predict(o)["action"]))(self.reg.get(n)) for n in ("PPO", "DQN")}
        results = compare(policies, episodes=300, seed_start=2_000_000)
        for name in ("ppo", "dqn"):
            self.assertGreater(results[name]["mean_objective_gain"], 0.0, results[name])
            self.assertLess(results[name]["mean_fee_ratio"], 1.0)
            self.assertGreater(results[name]["mean_fee_ratio"], results["oracle_hindsight"]["mean_fee_ratio"])


if __name__ == "__main__":
    unittest.main()
