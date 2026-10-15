"""
High-Level Inference Service for AgentWallet.
Bridges state ingestion, RL policy prediction, explainable reasoning generation,
and deterministic safety validation into a unified decision proposal.
"""
import uuid
import time
from typing import Dict, Any, Optional

from .agent_registry import registry
from ..environment.state_encoder import StateEncoder
from ..environment.action_space import get_action_details
from ..safety.action_validator import DeterministicActionValidator

class InferenceEngine:
    def __init__(self):
        self.encoder = StateEncoder()
        self.validator = DeterministicActionValidator()

    def generate_decision(
        self,
        raw_state: Dict[str, Any],
        agent_type: Optional[str] = None,
        recipient_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes complete inference and safety verification pipeline.
        """
        agent = registry.get_agent(agent_type)
        obs_vector = self.encoder.encode(raw_state)

        # 1. RL Policy Inference
        action_idx, confidence, meta = agent.predict(obs_vector, deterministic=True)
        action_details = get_action_details(action_idx)
        action_name = action_details["name"]
        amount_eth = action_details["amount_eth"]

        # Default or assigned recipient for operational payments
        recipient = recipient_override or raw_state.get(
            "defaultRecipient", "0xE592427A0AEce92De3Edee1F18E0157C05861564"
        )

        # 2. Deterministic Safety Validation
        validation_result = self.validator.validate_action(
            action_index=action_idx,
            action_name=action_name,
            amount_eth=amount_eth,
            recipient=recipient,
            current_state=raw_state
        )

        # 3. Explainable AI Rationale Synthesis
        rationale = self._synthesize_rationale(
            agent_type=agent.agent_name,
            action_name=action_name,
            amount_eth=amount_eth,
            raw_state=raw_state,
            confidence=confidence,
            validation_passed=validation_result.passed
        )

        # 4. Construct Structured Proposal
        decision_id = str(uuid.uuid4())
        created_at = int(time.time())
        ttl_seconds = 180

        requires_sig = action_details["requires_signature"] and validation_result.passed
        status = "AWAITING_APPROVAL" if requires_sig else (
            "SKIPPED_HOLD" if action_idx == 0 else "REJECTED"
        )

        proposal = {
            "decisionId": decision_id,
            "agentType": agent.agent_name,
            "modelVersion": agent.version,
            "actionIndex": action_idx,
            "actionType": action_name,
            "proposedParameters": {
                "recipient": recipient if amount_eth > 0 else None,
                "amountEth": amount_eth,
                "maxSlippageBps": 30.0,
                "gasLimit": action_details["gas_limit"],
            },
            "confidenceScore": round(confidence, 4),
            "rationale": rationale,
            "deterministicValidation": {
                "passed": validation_result.passed,
                "violations": validation_result.violations,
                "dailyLimitRemainingEth": round(validation_result.daily_limit_remaining_eth, 4),
                "validatedAt": validation_result.validated_at,
            },
            "authorization": {
                "status": status,
                "ttlSeconds": ttl_seconds,
                "expiresAt": created_at + ttl_seconds,
                "signatureRequired": requires_sig,
                "signerAddress": None,
                "resolvedAt": None,
            },
            "createdAt": created_at,
        }

        # Include policy distribution or Q-values depending on model
        if "policy_distribution" in meta:
            proposal["policyDistribution"] = meta["policy_distribution"]
        if "q_values" in meta:
            proposal["qValues"] = meta["q_values"]

        return proposal

    def _synthesize_rationale(
        self,
        agent_type: str,
        action_name: str,
        amount_eth: float,
        raw_state: Dict[str, Any],
        confidence: float,
        validation_passed: bool
    ) -> str:
        base_fee = raw_state.get("baseFeeGwei", 15.0)
        daily_spent = raw_state.get("dailySpentEth", 0.0)
        daily_limit = raw_state.get("dailyLimitEth", 0.05)
        slippage = raw_state.get("slippageSpreadBps", 15.0)

        if not validation_passed:
            return (
                f"{agent_type} proposed {action_name} ({amount_eth} ETH), but deterministic safety validation "
                f"flagged limit or threshold violations. Proposal suppressed."
            )

        if action_name == "HOLD":
            return (
                f"{agent_type} observed network base fee at {base_fee:.1f} Gwei with slippage {slippage:.1f} bps. "
                f"Policy determined optimal expected value by holding treasury reserves."
            )
        elif action_name == "DEFENSIVE_STABILIZE":
            return (
                f"{agent_type} detected elevated mempool volatility or gas fee ({base_fee:.1f} Gwei). "
                f"Activating defensive stabilization to conserve funds."
            )
        elif action_name == "STANDARD_REBALANCE":
            return (
                f"The {agent_type} policy observed favorable gas ({base_fee:.1f} Gwei) and liquidity spread ({slippage:.1f} bps). "
                f"Proposing liquidity rebalance of {amount_eth:.4f} ETH within daily budget "
                f"({daily_spent:.4f} / {daily_limit:.4f} ETH utilized)."
            )
        else:
            return (
                f"{agent_type} proposed operational micro-payment of {amount_eth:.4f} ETH. "
                f"Confidence score {confidence * 100:.1f}%. Risk invariants passed."
            )

inference_engine = InferenceEngine()
