"""
HTTP contract between the backend (backend/src/services/rlClient.js) and the timing service.
"""
import unittest

try:
    from fastapi.testclient import TestClient

    from app.agents.registry import registry
    from app.main import app

    HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    HAS_FASTAPI = False

REQ = {"gas_history": [1.0] * 30 + [0.55], "steps_remaining": 10, "window_steps": 20, "hour_of_day": 12.0}


@unittest.skipUnless(HAS_FASTAPI, "fastapi not installed")
class TestApi(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_lists_policy_status(self):
        body = self.client.get("/health").json()
        self.assertEqual(body["task"], "execution_timing")
        self.assertEqual(set(body["policies"]), {"PPO", "DQN"})

    def test_timing_contract(self):
        body = self.client.post("/timing", json={**REQ, "agent_type": "PPO"}).json()
        self.assertIn(body["status"], ("ok", "unavailable"))
        self.assertEqual(len(body["observation"]), 8)
        if body["status"] == "ok":
            self.assertIn(body["advice"], ("WAIT", "EXECUTE_NOW"))
            self.assertTrue(body["modelVersion"].startswith("ppo-timing-"))
        else:
            self.assertIsNone(body["advice"])
            self.assertTrue(body["reason"])

    def test_unavailable_policy_returns_no_advice(self):
        policy = registry.get("DQN")
        saved = (policy.status, policy.reason, policy.model)
        policy.status, policy.reason, policy.model = "unavailable", "simulated outage", None
        try:
            body = self.client.post("/timing", json={**REQ, "agent_type": "DQN"}).json()
            self.assertEqual(body["status"], "unavailable")
            self.assertIsNone(body["advice"])
            self.assertEqual(body["reason"], "simulated outage")
        finally:
            policy.status, policy.reason, policy.model = saved

    def test_strict_request_schema(self):
        self.assertEqual(self.client.post("/timing", json={**REQ, "recipient": "0x" + "1" * 40}).status_code, 422)
        self.assertEqual(self.client.post("/timing", json={**REQ, "gas_history": []}).status_code, 422)
        self.assertEqual(self.client.post("/timing", json={**REQ, "gas_history": [-1.0]}).status_code, 400)
        self.assertEqual(self.client.post("/timing", json={**REQ, "agent_type": "GPT"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
