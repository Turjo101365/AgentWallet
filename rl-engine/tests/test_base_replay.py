import unittest
from unittest.mock import patch
from app.evaluation.base_replay import evaluate, fetch
from app.agents.registry import registry


class TestBaseReplay(unittest.TestCase):
    def test_fetch_refuses_other_chain(self):
        with patch("app.evaluation.base_replay.rpc", return_value="0x1"):
            with self.assertRaisesRegex(ValueError, "Base mainnet"):
                fetch("https://example.invalid", 64)

    def test_replay_rejects_nonuniform_or_reordered_samples(self):
        blocks = [{"number": i, "timestamp": i * 900, "base_fee_wei": 100} for i in range(64)]
        blocks[20]["timestamp"] += 2
        with self.assertRaisesRegex(ValueError, "15-minute"):
            evaluate({"chain_id": 8453, "blocks": blocks}, "test")

    @unittest.skipUnless(all(registry.get(n).available for n in ("PPO", "DQN")), "trained checkpoints unavailable")
    def test_constant_fee_replay_is_reproducible_and_cannot_claim_savings(self):
        blocks = [{"number": i, "timestamp": i * 900, "base_fee_wei": 100} for i in range(80)]
        data = {"chain_id": 8453, "blocks": blocks}
        first = evaluate(data, "test")
        self.assertEqual(first, evaluate(data, "test"))
        for result in first["results"].values():
            self.assertEqual(result["mean_l2_base_fee_saving_pct"], 0)
            self.assertLessEqual(result["mean_objective_gain"], 0)
