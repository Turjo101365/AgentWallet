"""
Tests for DeterministicActionValidator.
"""
import unittest
from app.safety.action_validator import DeterministicActionValidator
from app.safety.constraints import SafetyConstraints

class TestSafetyValidator(unittest.TestCase):
    def test_validator_allows_safe_payment(self):
        validator = DeterministicActionValidator()
        state = {
            "nativeBalanceEth": 2.0,
            "dailySpentEth": 0.01,
            "dailyLimitEth": 0.05,
            "perTxLimitEth": 0.01,
            "baseFeeGwei": 18.0,
            "isContractPaused": False,
        }
        result = validator.validate_action(
            action_index=1,
            action_name="MICRO_PAYMENT",
            amount_eth=0.005,
            recipient="0xE592427A0AEce92De3Edee1F18E0157C05861564",
            current_state=state
        )
        self.assertTrue(result.passed)
        self.assertEqual(len(result.violations), 0)

    def test_validator_rejects_exceeding_per_tx_limit(self):
        validator = DeterministicActionValidator()
        state = {
            "nativeBalanceEth": 2.0,
            "dailySpentEth": 0.0,
            "dailyLimitEth": 0.05,
            "perTxLimitEth": 0.01,
            "baseFeeGwei": 18.0,
            "isContractPaused": False,
        }
        result = validator.validate_action(
            action_index=2,
            action_name="LARGE_PAYMENT",
            amount_eth=0.02, # Exceeds 0.01 limit
            recipient="0xE592427A0AEce92De3Edee1F18E0157C05861564",
            current_state=state
        )
        self.assertFalse(result.passed)
        self.assertTrue(any("per-transaction limit" in v for v in result.violations))

    def test_validator_rejects_paused_contract(self):
        validator = DeterministicActionValidator()
        state = {
            "nativeBalanceEth": 2.0,
            "dailySpentEth": 0.0,
            "dailyLimitEth": 0.05,
            "perTxLimitEth": 0.01,
            "baseFeeGwei": 18.0,
            "isContractPaused": True,
        }
        result = validator.validate_action(
            action_index=1,
            action_name="MICRO_PAYMENT",
            amount_eth=0.005,
            recipient="0xE592427A0AEce92De3Edee1F18E0157C05861564",
            current_state=state
        )
        self.assertFalse(result.passed)
        self.assertTrue(any("paused" in v for v in result.violations))

if __name__ == "__main__":
    unittest.main()
