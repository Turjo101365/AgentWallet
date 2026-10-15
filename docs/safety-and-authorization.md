# Safety Architecture, Guardrails, and Authorization Boundaries

## 1. Multi-Tiered Defense-in-Depth Model

AgentWallet implements a zero-trust multi-tiered safety model. Untrusted machine learning policies are never granted autonomous custody of funds or execution authorization.

```
+-------------------------------------------------------------------+
| Tier 1: Reinforcement Learning Policy                             |
| (Penalized during training for limit violations)                  |
+-------------------------------------------------------------------+
                                 | Proposed Action
                                 v
+-------------------------------------------------------------------+
| Tier 2: Deterministic Safety Validation Engine (Off-Chain Backend)|
| (Strict code assertions independent of RL model)                  |
| - Daily & Tx limits check                                         |
| - Gas fee ceiling check                                           |
| - Recipient whitelist & zero-address validation                   |
| - Contract pause status check                                     |
+-------------------------------------------------------------------+
                                 | Validated Proposal
                                 v
+-------------------------------------------------------------------+
| Tier 3: Human-in-the-Loop Authorization Gate (Dashboard UI)       |
| - Explainable AI reasoning inspection                             |
| - Calldata decode inspection                                      |
| - 180s countdown TTL (Time-to-Live) auto-expiration               |
| - Explicit "Approve" or "Reject & Freeze" choice                  |
+-------------------------------------------------------------------+
                                 | Approved Calldata
                                 v
+-------------------------------------------------------------------+
| Tier 4: Client-Side Non-Custodial Signer (MetaMask Extension)     |
| - Hardware-isolated private key signature                         |
| - EIP-1193 RPC standard                                           |
| - Zero server-side private key storage                            |
+-------------------------------------------------------------------+
                                 | Signed Transaction
                                 v
+-------------------------------------------------------------------+
| Tier 5: Immutable On-Chain Smart Contract Bytecode                |
| (AgentWallet.sol EVM execution)                                   |
| - require(msg.sender == authorizedAgent)                          |
| - require(!paused)                                                |
| - require(amount <= perTransactionLimit)                          |
| - require(dailySpent[today] + amount <= dailySpendingLimit)       |
| - Checks-Effects-Interactions reentrancy protection               |
+-------------------------------------------------------------------+
```

---

## 2. Deterministic Validation Engine Rules

The off-chain validator in `backend/src/services/safetyService.js` and `rl-engine/app/safety/action_validator.py` evaluates all candidate proposals:

1. **Per-Transaction Limit:**
   `proposal.amountEth <= contract.perTransactionLimit` (default `0.01 ETH`). Any proposal exceeding this is immediately rejected.
2. **Cumulative Daily Spending Limit:**
   `contract.dailySpent + proposal.amountEth <= contract.dailySpendingLimit` (default `0.05 ETH`).
3. **Mempool Gas Ceiling:**
   `network.baseFeeGwei <= MAX_GAS_BASE_FEE_GWEI` (default `45 Gwei`). If the network is experiencing a gas spike, execution is deferred.
4. **Recipient Verification:**
   Recipient must be a valid 20-byte EVM address, not the zero address (`0x00...00`), and not the wallet contract itself.
5. **Contract Pause Check:**
   If `contract.isPaused == true`, all outbound actions are blocked.

---

## 3. Threat Modeling & Safeguards

| Threat Vector | Mitigation Strategy |
|---|---|
| **Adversarial / Drifted RL Model** | The deterministic validator and human approval gate reject anomalous proposals regardless of policy confidence. |
| **Private Key Theft** | Backend and RL engine do NOT possess private keys. Keys remain locked inside the user's browser MetaMask extension. |
| **Reentrancy Exploit** | `AgentWallet.sol` updates `dailySpent[today] += amount` **before** invoking external ETH transfers (`.call{value: amount}("")`). |
| **Stale Transaction / Frontrunning** | Proposals have a strict TTL (180 seconds). Transactions submitted after TTL or market movement are rejected by the user. |
| **Emergency Treasury Drain** | The owner can call `setPaused(true)` to instantly halt agent spending, followed by `emergencyWithdraw` to a cold safe. |

---

## 4. Human-in-the-Loop (HITL) Workflow

1. A pending proposal appears on the **Agent Activity** and **Overview** screens.
2. The UI renders:
   - Target recipient address and verified contract tag.
   - Proposed amount in ETH and USD equivalent.
   - PPO / DQN confidence score and AI rationale.
   - Decoded function call: `executePayment(address recipient, uint256 amount)`.
3. If the user clicks **Approve & Sign via MetaMask**, MetaMask triggers a confirmation modal.
4. If the user clicks **Reject & Freeze**, the proposal is cancelled and an optional pause command is queued.
5. If no response occurs within 180 seconds, the proposal status transitions automatically to `EXPIRED`.
