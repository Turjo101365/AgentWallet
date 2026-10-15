# AgentWallet

> Non-custodial Web3 wallet automation and decision support system combining **Proximal Policy Optimization (PPO)**, **Deep Q-Networks (DQN)**, **deterministic guardrail verification**, and **EVM smart contract bytecode enforcement**.

[![License: MIT](https://img.shields.io/badge/License-MIT-059669.svg)](LICENSE)
[![EVM Network: Base Sepolia](https://img.shields.io/badge/EVM-Base%20Sepolia%20(84532)-047857.svg)](#8-blockchain--smart-contract-integration)
[![Architecture: Human--in--the--Loop](https://img.shields.io/badge/Security-HITL%20Non--Custodial-0f172a.svg)](#14-security-architecture--responsible-execution)
[![Test Suite: 25 Passing](https://img.shields.io/badge/Tests-25%20Passing%20(Verified)-10b981.svg)](#13-testing--reproducibility)

---

## Table of Contents

- [1. Executive Summary & Problem Formulation](#1-executive-summary--problem-formulation)
- [2. System Architecture](#2-system-architecture)
- [3. The Nine-Stage Execution Pipeline](#3-the-nine-stage-execution-pipeline)
- [4. Reinforcement Learning Engine (PPO & DQN)](#4-reinforcement-learning-engine-ppo--dqn)
- [5. State, Action, and Reward Formulation](#5-state-action-and-reward-formulation)
- [6. Deterministic Safety & Guardrail Engine](#6-deterministic-safety--guardrail-engine)
- [7. Blockchain & Smart Contract Integration](#7-blockchain--smart-contract-integration)
- [8. Client Dashboard & Verdant Design System](#8-client-dashboard--verdant-design-system)
- [9. Repository Structure](#9-repository-structure)
- [10. Technology Stack](#10-technology-stack)
- [11. Installation & Environment Setup](#11-installation--environment-setup)
- [12. Service Execution Guide](#12-service-execution-guide)
- [13. Testing & Reproducibility](#13-testing--reproducibility)
- [14. API Reference](#14-api-reference)
- [15. Security Architecture & Threat Model](#15-security-architecture--threat-model)
- [16. Implementation Status Matrix](#16-implementation-status-matrix)
- [17. Current Limitations & Technical Roadmap](#17-current-limitations--technical-roadmap)
- [18. Documentation Index](#18-documentation-index)
- [19. License](#19-license)

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Challenge of Autonomous Web3 Operations
Decentralized treasury operations, payment scheduling, and liquidity rebalancing require continuous monitoring of volatile network conditions, such as base gas fees ($g_t$), mempool congestion, and decentralized exchange (DEX) slippage spreads. Traditional programmatic wallet automation relies on static heuristic rules (e.g., hardcoded gas price thresholds), which fail to dynamically adapt to shifting diurnal network cycles or complex trade-offs between execution urgency and transaction fee expenditure.

Conversely, deploying unconstrained black-box Machine Learning (ML) or Reinforcement Learning (RL) models directly to manage cryptographic private keys introduces catastrophic operational risks:
1. **Model Hallucination & Value Drift:** Neural policies can output out-of-distribution parameter values or execute during adverse market conditions.
2. **Exploitation & State Adversarial Perturbations:** Manipulation of observed state variables could induce an agent to drain liquidity.
3. **Custodial Vulnerability:** Granting an autonomous backend service custody over raw private keys creates a single point of failure (SPOF) for entire treasury reserves.

### 1.2 The AgentWallet Solution
**AgentWallet** is an experimental decision-support and controlled-execution platform that bridges adaptive statistical learning and deterministic cryptographic security. 

AgentWallet strictly bifurcates **decision intelligence** from **transaction authorization**:
- **Probabilistic Intelligence (RL Engine):** Twin reinforcement learning agents—Proximal Policy Optimization (**PPO**) and Deep Q-Networks (**DQN**)—observe normalized on-chain and mempool dynamics ($s_t \in \mathbb{R}^8$) to propose optimal discrete treasury actions (hold, micro-disburse, rebalance, or defensively freeze).
- **Deterministic Off-Chain Validation (`safetyService`):** Every proposed action must pass programmatic invariant checks (single-transaction caps, rolling 24-hour spending limits, reserve floors, mempool gas ceilings, and recipient sanity) before reaching the user interface.
- **Cryptographic Human-in-the-Loop Gate (MetaMask):** Zero private keys or mnemonic seed phrases are stored on or processed by the server. Transactions must be explicitly reviewed and signed client-side by an operator through an EIP-1193 compatible provider.
- **On-Chain Bytecode Enforcement (`AgentWallet.sol`):** Smart contracts deployed on Base Sepolia guarantee spending ceilings, role authorization (`onlyAgent`), reentrancy resistance (Checks-Effects-Interactions), and emergency circuit breakers (`whenNotPaused`) directly in EVM execution bytecode.

```
+---------------------------------------------------------------------------------------------------+
|                                   DEFENSE-IN-DEPTH SECURITY MODEL                                 |
+---------------------------------------------------------------------------------------------------+
|  [Tier 1: RL Policy]         Probabilistic Proposal (PPO / DQN)                                   |
|            |                                                                                      |
|            v                                                                                      |
|  [Tier 2: Off-Chain Safety]  Deterministic Invariant Engine (Zero Tolerance for Breaches)          |
|            |                                                                                      |
|            v                                                                                      |
|  [Tier 3: Operator Gate]     Human-in-the-Loop Review + 180s Time-To-Live (TTL) Countdown         |
|            |                                                                                      |
|            v                                                                                      |
|  [Tier 4: Client Signer]     Non-Custodial MetaMask Extension (EIP-1193 Hardware / Extension)    |
|            |                                                                                      |
|            v                                                                                      |
|  [Tier 5: EVM Smart Contract] Immutable On-Chain Limits & Pause Circuit Breaker (AgentWallet.sol) |
+---------------------------------------------------------------------------------------------------+
```

> **Implementation Note:** AgentWallet is an active research and engineering system calibrated for the **Base Sepolia Testnet (Chain ID: 84532)**. It is designed for controlled experimental evaluation and does not constitute audited production financial software.

---

## 2. System Architecture

The AgentWallet monorepo is structured across five decoupled, specialized tiers communicating via typed JSON-over-HTTP interfaces, EIP-1193 browser injection, and standard EVM JSON-RPC:

```mermaid
flowchart TB
    subgraph ClientTier ["1. Presentation & Signer Tier (Browser)"]
        UI["React 18 Dashboard<br/>(Verdant Design System / Vite)"]
        MM["MetaMask Browser Signer<br/>(EIP-1193 Non-Custodial Provider)"]
        UI <-->|Request Human Signature| MM
    end

    subgraph BackendTier ["2. Orchestration & Safety Tier (Node.js)"]
        EXPRESS["Express API Server<br/>(Port 4000)"]
        ORCH["Agent Orchestrator<br/>(Lifecycle Manager)"]
        SAFETY["Safety Service<br/>(Deterministic Invariant Engine)"]
        REPO["Repository Adapters<br/>(Dual Mode: PostgreSQL / In-Memory)"]
        EXPRESS --> ORCH
        ORCH --> SAFETY
        ORCH --> REPO
    end

    subgraph RLTier ["3. Statistical Intelligence Tier (Python FastAPI)"]
        FASTAPI["FastAPI Inference Server<br/>(Port 8000)"]
        PPO_MOD["PPO Policy<br/>(Actor-Critic MLP)"]
        DQN_MOD["DQN Q-Network<br/>(Experience Replay + Target Net)"]
        FALLBACK["Deterministic Heuristic<br/>(Zero-Checkpoint Fallback Engine)"]
        ENV["WalletEnv Simulator<br/>(Gymnasium / Box + Discrete)"]
        
        FASTAPI --> PPO_MOD
        FASTAPI --> DQN_MOD
        FASTAPI --> FALLBACK
        ENV -.->|Simulation & Training| PPO_MOD
        ENV -.->|Simulation & Training| DQN_MOD
    end

    subgraph SettlementTier ["4. Settlement & Bytecode Tier (Base Sepolia)"]
        RPC["Base Sepolia Node<br/>(https://sepolia.base.org)"]
        CONTRACT["AgentWallet.sol<br/>(EVM Bytecode Limits & Circuit Breaker)"]
        RPC --> CONTRACT
    end

    subgraph PersistenceTier ["5. Persistence Tier (PostgreSQL / Memory)"]
        PG[("PostgreSQL 16 DB<br/>agentwallet_db")]
    end

    %% Interactions
    UI <-->|REST API Calls| EXPRESS
    MM -->|Broadcast Signed Tx| RPC
    ORCH <-->|Inference & Evaluation| FASTAPI
    ORCH <-->|Query State & Monitor Receipts| RPC
    REPO <-->|Persist Telemetry & Audits| PG
```

### Component Breakdown & Network Topologies

| Tier | Subsystem | Runtime / Technology | Primary Responsibility |
|---|---|---|---|
| **Client** | `frontend/` | React 18, Vite, Tailwind CSS, Lucide | Real-time telemetry, proposal inspection, TTL countdowns, MetaMask trigger. |
| **Signer** | MetaMask | EIP-1193 Extension | Hardware/extension isolated private key storage; cryptographic tx signing. |
| **Orchestrator** | `backend/` | Node.js (ESM), Express 4.19, Ethers.js v6 | State observation, RL dispatch, deterministic validation, calldata preparation. |
| **Safety Engine** | `backend/src/services/safetyService.js` | Pure ECMAScript (Zero ML Dependencies) | Hard mathematical invariant checking against wallet limits and network caps. |
| **Intelligence** | `rl-engine/` | Python 3.10+, FastAPI, Gymnasium, PyTorch/SB3 | Observation vector normalization, policy inference, reward calculation, offline training. |
| **Settlement** | `contracts/` | Solidity 0.8.24, Hardhat | On-chain custody of funds, per-tx caps, daily ceilings, pause circuit breaker. |
| **Persistence** | `database/` | PostgreSQL 16 (or in-memory fallback) | Audit trails for decisions, validations, user approvals, and broadcast receipts. |

---

## 3. The Nine-Stage Execution Pipeline

Every state observation and transaction proposal flows sequentially through **nine deterministic checkpoints**. Failure at any checkpoint terminates or defers execution immediately.

```mermaid
sequenceDiagram
    autonumber
    participant RPC as EVM RPC (Base Sepolia)
    participant Backend as Agent Orchestrator
    participant RL as RL Engine (FastAPI)
    participant Safety as Deterministic Safety Engine
    participant UI as Dashboard UI
    participant MM as MetaMask Signer
    participant Contract as AgentWallet.sol

    Note over RPC,Backend: Phase 1: State Observation
    Backend->>RPC: Query balance, base fee, mempool congestion, contract pause state
    RPC-->>Backend: Raw wallet state telemetry ($S_t$)

    Note over Backend,RL: Phase 2: Inference & Proposal
    Backend->>RL: POST /propose (raw_state, agentType='PPO'|'DQN')
    RL->>RL: StateEncoder.encode() -> Normalized 8D vector
    RL->>RL: Policy inference (PPO Actor-Critic or DQN Q-Net)
    RL-->>Backend: Structured proposal (Action, Amount, Recipient, Rationale)

    Note over Backend,Safety: Phase 3: Off-Chain Guardrail Invariant Check
    Backend->>Safety: validateProposal(proposal, walletState)
    alt Invariant Violated (e.g. Daily limit exceeded or Gas > 45 Gwei)
        Safety-->>Backend: { passed: false, violations: [...] }
        Backend->>UI: Emit REJECTED proposal + Record to Audit DB
    else Invariants Satisfied
        Safety-->>Backend: { passed: true, violations: [] }
    end

    Note over Backend,UI: Phase 4: Human-in-the-Loop Review
    Backend->>UI: Surface proposal with explainable rationale & 180s countdown TTL
    alt Operator Rejects or 180s TTL Expires
        UI->>Backend: POST /proposals/:id/reject or Timeout Expiration
        Backend->>Backend: Mark proposal as REJECTED or EXPIRED
    else Operator Approves
        UI->>Backend: POST /proposals/:id/approve (signerAddress)
        Backend->>Backend: Generate ABI-encoded calldata for executePayment()
        Backend-->>UI: Return { status: 'APPROVED', callData }
    end

    Note over UI,Contract: Phase 5: Cryptographic Signing & Settlement
    UI->>MM: eth_sendTransaction({ to: contractAddress, data: callData })
    MM->>MM: Operator confirms cryptographic signature in extension
    MM->>RPC: Broadcast signed transaction (ECDSA secp256k1)
    RPC-->>UI: Transaction Hash ($T_x$)
    UI->>Backend: POST /api/transactions/track (txHash, decisionId)

    Note over Backend,Contract: Phase 6: Receipt Monitoring & Ledger Persistence
    Backend->>RPC: Monitor block inclusion & receipt.status
    RPC-->>Backend: Block confirmed (receipt.status == 1)
    Backend->>Backend: Update PostgreSQL (tracked_transactions = CONFIRMED)
```

---

## 4. Reinforcement Learning Engine (PPO & DQN)

AgentWallet models treasury operations as a Markov Decision Process (MDP) defined by the tuple $\langle \mathcal{S}, \mathcal{A}, \mathcal{P}, \mathcal{R}, \gamma \rangle$. To study the trade-offs between continuous policy optimization and discrete value estimation, the intelligence layer implements two foundational algorithms on a shared state-action-reward interface.

### 4.1 Proximal Policy Optimization (PPO)

The PPO agent (`rl-engine/app/agents/ppo_agent.py`) uses an on-policy Actor-Critic architecture (`MlpPolicy`). The actor network parameterizes a categorical probability distribution over the discrete action space, while the critic estimates the state-value function $V(s)$.

- **Objective Function:** Clipped surrogate objective to prevent catastrophically large policy updates:
  $$L^{\text{CLIP}}(\theta) = \hat{\mathbb{E}}_t \left[ \min\left( r_t(\theta) \hat{A}_t, \, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon) \hat{A}_t \right) \right]$$
  where $r_t(\theta) = \frac{\pi_\theta(a_t | s_t)}{\pi_{\theta_{\text{old}}}(a_t | s_t)}$ is the probability ratio, and $\hat{A}_t$ is the Generalized Advantage Estimator (GAE).
- **Default Hyperparameters (`rl-engine/configs/ppo.yaml`):**
  - Learning rate: $3 \times 10^{-4}$
  - Discount factor ($\gamma$): $0.99$
  - GAE parameter ($\lambda$): $0.95$
  - Clip range ($\epsilon$): $0.20$
  - Rollout buffer size (`n_steps`): $2048$
  - Minibatch size: $64$
  - Value function coefficient ($c_1$): $0.5$
  - Entropy coefficient ($c_2$): $0.01$

### 4.2 Deep Q-Network (DQN)

The DQN agent (`rl-engine/app/agents/dqn_agent.py`) is an off-policy, value-based algorithm that approximates the optimal action-value function $Q^*(s, a)$.

- **Loss Function:** Mean squared Bellman error minimized using a decoupled target network ($\theta^-$) and experience replay buffer ($\mathcal{D}$):
  $$L(\theta) = \mathbb{E}_{(s, a, r, s') \sim \mathcal{D}} \left[ \left( r + \gamma \max_{a'} Q(s', a'; \theta^-) - Q(s, a; \theta) \right)^2 \right]$$
- **Exploration Schedule:** $\epsilon$-greedy exploration with linear decay from $\epsilon_{\text{start}} = 1.0$ to $\epsilon_{\text{end}} = 0.05$ over the initial $20\%$ of training timesteps.
- **Default Hyperparameters (`rl-engine/configs/dqn.yaml`):**
  - Learning rate: $5 \times 10^{-4}$
  - Replay buffer capacity: $50,000$ transitions
  - Learning start threshold: $1,000$ steps
  - Minibatch size: $64$
  - Target network update interval: $1,000$ steps
  - Discount factor ($\gamma$): $0.99$

### 4.3 PPO vs. DQN: Theoretical & Practical Comparison

| Architectural Dimension | PPO (Actor-Critic) | DQN (Q-Learning) |
|---|---|---|
| **Optimization Strategy** | Policy Gradient (Stochastic Gradient Ascent) | Value Iteration (Temporal Difference Loss) |
| **Sample Efficiency** | Moderate (On-policy rollouts discarded after update) | High (Off-policy transitions reused via replay buffer) |
| **Output Representation** | Categorical policy distribution $\pi(a \mid s)$ + scalar $V(s)$ | Discrete Q-value vector $\vec{Q}(s, \cdot) \in \mathbb{R}^4$ |
| **Variance / Stability** | Low variance due to surrogate clipping & GAE | Sensitive to overestimation bias and hyperparameter tuning |
| **Inference Output** | Selected action, confidence score, policy entropy | Argmax action, confidence proxy, full Q-vector |

### 4.4 Zero-Checkpoint Fallback Engine
To prevent system crashes when trained model weights (`.zip` binaries) are not yet present in `rl-engine/models/`, both `PPOAgent` and `DQNAgent` implement a **deterministic rule-based fallback mode**:
- If daily spending headroom is $< 20\%$, the fallback forces action `0` (`HOLD`) with $92\%$ confidence to prevent limit exhaustion.
- If gas base fee exceeds $40\text{ Gwei}$ (normalized $s_3 > 0.8$), the fallback selects action `3` (`DEFENSIVE_STABILIZE`).
- Under normal gas ($< 25\text{ Gwei}$) with sufficient headroom ($> 50\%$), action `2` (`STANDARD_REBALANCE`) is proposed.
- All fallback inferences are explicitly tagged with `"simulated_inference": true` in API responses to maintain complete transparency.

---

## 5. State, Action, and Reward Formulation

### 5.1 State Observation Space ($S_t \in \mathbb{R}^8$)
The observation vector combines internal wallet solvency constraints with external EVM network telemetry. Raw metrics are transformed by `StateEncoder` (`rl-engine/app/environment/state_encoder.py`) into normalized scalar features:

| Index | Feature Dimension | Raw Source Metric | Transformation / Normalization Formula | Nominal Bounds |
|:---:|---|---|---|:---:|
| $s_0$ | **Normalized Balance** | Contract ETH balance | $\min\left(2.0, \, \max\left(0.0, \, \frac{\text{balance}_{\text{ETH}}}{\text{targetReserve}_{\text{ETH}}}\right)\right)$ (target = 2.0 ETH) | $[0.0, 2.0]$ |
| $s_1$ | **Daily Spent Ratio** | `dailySpent[today]` | $\min\left(1.5, \, \frac{\text{dailySpent}_{\text{ETH}}}{\text{dailyLimit}_{\text{ETH}}}\right)$ (limit = 0.05 ETH) | $[0.0, 1.5]$ |
| $s_2$ | **Remaining Headroom** | Budget capacity | $\max\left(0.0, \, 1.0 - \frac{\text{dailySpent}_{\text{ETH}}}{\text{dailyLimit}_{\text{ETH}}}\right)$ | $[0.0, 1.0]$ |
| $s_3$ | **Normalized Gas Base Fee** | EVM `feeData.gasPrice` | $\min\left(2.0, \, \max\left(0.0, \, \frac{\text{baseFee}_{\text{Gwei}}}{50.0}\right)\right)$ | $[0.0, 2.0]$ |
| $s_4$ | **Mempool Congestion** | Pending pool density | Direct heuristic factor $\in [0.0, 1.0]$ | $[0.0, 1.0]$ |
| $s_5$ | **Observed DEX Slippage** | Pool spread in bps | $\min\left(2.0, \, \max\left(0.0, \, \frac{\text{slippage}_{\text{bps}}}{100.0}\right)\right)$ | $[0.0, 2.0]$ |
| $s_6$ | **Diurnal Gas Phase** | Block timestamp | $\sin\left(2\pi \cdot \frac{\text{timestamp} \pmod{86400}}{86400}\right)$ | $[-1.0, 1.0]$ |
| $s_7$ | **Contract Status** | Smart contract `paused` | $0.0 \text{ if paused else } 1.0$ | $\{0.0, 1.0\}$ |

### 5.2 Action Space ($A$)
AgentWallet defines a discrete action space $|\mathcal{A}| = 4$ mapped directly to financial semantics (`rl-engine/app/environment/action_space.py`):

| Action Index | Identifier | Operational Description | Proposed Amount | Gas Limit | Requires Signature |
|:---:|---|---|:---:|:---:|:---:|
| `0` | `HOLD` | Defer transaction; maintain current reserves. | $0.000\text{ ETH}$ | $0$ | **No** |
| `1` | `MICRO_PAYMENT` | Disburse low-value payment or gas top-up. | $0.005\text{ ETH}$ | $65,000$ | **Yes** |
| `2` | `STANDARD_REBALANCE` | Standard operational disbursement or pool rebalance. | $0.010\text{ ETH}$ | $142,500$ | **Yes** |
| `3` | `DEFENSIVE_STABILIZE` | Hold execution and recommend temporary pause during volatility. | $0.000\text{ ETH}$ | $45,000$ | **Yes** |

### 5.3 Composite Reward Formulation ($R(s, a, s')$)
The scalar reward function (`rl-engine/app/environment/reward_function.py`) penalizes invariant breaches and unnecessary transaction fee burn while rewarding successful liquidity provisioning:

$$R(s, a, s') = R_{\text{utility}}(a, s) - R_{\text{gas}}(a, s) - R_{\text{slippage}}(a, s) - R_{\text{violation}}(s, a)$$

1. **Operational Utility ($R_{\text{utility}}$):**
   - $a = 0$ (`HOLD`): $+0.6$ if base fee $> 30\text{ Gwei}$ (rewarding patience during fee spikes); $+0.1$ otherwise.
   - $a = 1$ (`MICRO_PAYMENT`): $+1.5$ for fulfilling sub-limit transfer demand.
   - $a = 2$ (`STANDARD_REBALANCE`): $+3.0$ for executing standard operational balance.
   - $a = 3$ (`DEFENSIVE_STABILIZE`): $+1.8$ if base fee $> 40\text{ Gwei}$ or slippage $> 40\text{ bps}$; $-0.2$ if invoked during calm market conditions.

2. **Gas Burn Penalty ($R_{\text{gas}}$):** Applied exclusively when transactions require on-chain broadcast:
   $$R_{\text{gas}}(a, s) = 0.4 \times \left( \frac{\text{baseFee}_{\text{Gwei}}}{15.0} \right)^{1.3}$$

3. **Slippage Penalty ($R_{\text{slippage}}$):**
   $$R_{\text{slippage}}(a, s) = 0.3 \times \left( \frac{\text{slippage}_{\text{bps}}}{20.0} \right)$$

4. **Safety Constraint Penalty ($R_{\text{violation}}$):**
   If an action violates single-tx limits, daily caps, or reserve floors, the step terminates with a catastrophic penalty:
   $$R(s, a, s') = -10.0$$

> **Research Transparency:** Simulated environment rewards quantify policy objective optimization within the synthetic Gymnasium simulator. They do **not** represent financial profit, yield, or real-world trading performance.

---

## 6. Deterministic Safety & Guardrail Engine

The off-chain safety engine (`backend/src/services/safetyService.js`) and RL action validator (`rl-engine/app/safety/action_validator.py`) enforce hard mathematical boundaries completely decoupled from neural network weights:

```mermaid
flowchart TD
    PROP["Candidate Proposal from RL Engine"] --> CHK0{"Is Action Index == 0 (HOLD)?"}
    CHK0 -- Yes --> PASS["Validation Passed (No State Modification)"]
    CHK0 -- No --> CHK1{"Is Smart Contract Paused?"}
    
    CHK1 -- Yes --> FAIL["Reject Proposal (Contract Paused)"]
    CHK1 -- No --> CHK2{"Amount <= 0.01 ETH<br/>(Per-Tx Limit)?"}
    
    CHK2 -- No --> FAIL2["Reject Proposal (Exceeds Per-Tx Cap)"]
    CHK2 -- Yes --> CHK3{"DailySpent + Amount <= 0.05 ETH<br/>(Daily Cap)?"}
    
    CHK3 -- No --> FAIL3["Reject Proposal (Exceeds Daily Cap)"]
    CHK3 -- Yes --> CHK4{"Reserve - Amount >= 0.05 ETH<br/>(Reserve Floor)?"}
    
    CHK4 -- No --> FAIL4["Reject Proposal (Breaches Reserve Floor)"]
    CHK4 -- Yes --> CHK5{"Base Fee <= 45 Gwei<br/>(Gas Cap)?"}
    
    CHK5 -- No --> FAIL5["Reject Proposal (Mempool Congestion Spike)"]
    CHK5 -- Yes --> CHK6{"Valid 42-char Hex & Non-Zero Recipient?"}
    
    CHK6 -- No --> FAIL6["Reject Proposal (Malformed Recipient)"]
    CHK6 -- Yes --> PASS
```

### Safety Parameter Guardrails (`shared/constants.js`)
- `MAX_SINGLE_TX_ETH`: $0.01\text{ ETH}$ (matches contract `perTransactionLimit`).
- `MAX_DAILY_SPEND_ETH`: $0.05\text{ ETH}$ (matches contract `dailySpendingLimit`).
- `MAX_GAS_BASE_FEE_GWEI`: $45.0\text{ Gwei}$ (execution deferred if base fee exceeds ceiling).
- `MIN_RESERVE_BALANCE_ETH`: $0.05\text{ ETH}$ (prevents total treasury reserve drain).
- `APPROVAL_TTL_SECONDS`: $180\text{ seconds}$ (proposals automatically expire to prevent execution against stale slippage or gas prices).

---

## 7. Blockchain & Smart Contract Integration

### 7.1 Smart Contract Specification (`AgentWallet.sol`)
The settlement layer is governed by `contracts/src/AgentWallet.sol`, compiled with Solidity `0.8.24` and deployed to the EVM. It holds native treasury funds and enforces spending rules in immutable bytecode.

```solidity
// Core execution entrypoint in contracts/src/AgentWallet.sol
function executePayment(
    address payable recipient,
    uint256 amount
) external onlyAgent whenNotPaused {
    require(recipient != address(0), "AgentWallet: invalid recipient");
    require(recipient != address(this), "AgentWallet: self-transfer disallowed");
    require(amount > 0, "AgentWallet: payment amount must be positive");
    require(amount <= perTransactionLimit, "AgentWallet: per-transaction limit exceeded");
    require(address(this).balance >= amount, "AgentWallet: insufficient wallet balance");

    uint256 today = block.timestamp / 1 days;
    require(
        dailySpent[today] + amount <= dailySpendingLimit,
        "AgentWallet: daily spending limit exceeded"
    );

    // Checks-Effects-Interactions: state recorded prior to external call
    dailySpent[today] += amount;

    (bool success, ) = recipient.call{value: amount}("");
    require(success, "AgentWallet: external payment execution failed");

    emit PaymentExecuted(msg.sender, recipient, amount, today);
}
```

### 7.2 On-Chain Security Features
1. **Access Control (`onlyAgent`, `onlyOwner`):** Only the designated agent operator key can invoke `executePayment`. Only the treasury owner can modify limits or designate agent addresses.
2. **Checks-Effects-Interactions:** State update `dailySpent[today] += amount` occurs **before** the external low-level transfer (`recipient.call{value: amount}("")`), neutralizing reentrancy attacks.
3. **Emergency Circuit Breaker:** The owner can invoke `setPaused(true)` to halt all disbursements instantly. While paused, the owner can invoke `emergencyWithdraw()` to evacuate capital to cold storage.
4. **Calendar Day Indexing:** Cumulative spending is indexed by `block.timestamp / 1 days` (UTC calendar day), ensuring rolling 24-hour limits cannot be manipulated by off-chain clocks.

### 7.3 Network & Deployment Environment
- **Target Network:** Base Sepolia Testnet
- **Chain ID:** `84532`
- **Native Currency:** `ETH`
- **Canonical RPC Endpoint:** `https://sepolia.base.org`
- **Block Explorer:** `https://sepolia.basescan.org`

### 7.4 Deployment Procedures

#### Option A: Hardhat Scripted Deployment
```bash
cd contracts
npx hardhat run scripts/deploy.js --network base_sepolia
```
*The script outputs the contract address and writes full deployment metadata to `contracts/deployments/base_sepolia.json`.*

#### Option B: Remix IDE Deployment Workflow
1. Navigate to [Remix IDE](https://remix.ethereum.org).
2. Copy the contents of `contracts/src/AgentWallet.sol` into the Remix workspace.
3. Compile with Solidity version `0.8.24` and compiler optimizer enabled ($200$ runs).
4. Under **Deploy & Run Transactions**, change Environment to **Injected Provider - MetaMask**.
5. Ensure MetaMask is set to **Base Sepolia (Chain ID 84532)**.
6. Click **Deploy** and confirm the transaction in MetaMask.
7. Copy the deployed contract address and set `AGENT_WALLET_CONTRACT_ADDRESS` and `VITE_CONTRACT_ADDRESS` in `.env`.

---

## 8. Client Dashboard & Verdant Design System

The frontend (`frontend/`) is an institutional-grade financial dashboard engineered with **React 18**, **Vite**, and **Tailwind CSS**. It adheres to the **Verdant Design System**:
- **Cognitive Clarity:** High-contrast numeric typography using `JetBrains Mono` for cryptographic hashes, Gwei figures, and ETH balances.
- **Color Semantics:** Institutional emerald tones (`#059669`, `#047857`) for validated states; amber (`#d97706`) for awaiting signatures; rose (`#ba1a1a`) for emergency halt states.
- **Strict No-Mock Transparency:** When the smart contract is unconfigured, cards explicitly display `"Contract configuration missing"` rather than displaying fabricated balances. Disconnected wallets show `"Not connected"` and `"0.0000 ETH"`.

### Route Structure (`frontend/src/app/router.jsx`)
- `/`: **Overview** — Live treasury balance, pending proposal approval panel, network fee telemetry, recent transactions.
- `/wallet`: **Wallet & Connectivity** — MetaMask EIP-1193 status, chain ID verification, native and testnet token balances.
- `/agent`: **Agent Activity** — Active policy selector, decision rationale inspection, approval/rejection triggers, manual evaluation cycle dispatch.
- `/contracts`: **Smart Contracts** — Bytecode parameter configuration, spending limit adjustment, deposit portal, emergency pause switch.
- `/rl-insights`: **RL Insights & Benchmarks** — PPO vs. DQN architecture breakdowns, value distributions, simulation rollout launcher.
- `/transactions`: **Transaction History** — Complete audit table with modal inspection of block numbers, gas fees, and execution receipts.
- `/settings`: **System Settings** — RPC provider toggles, contract address overrides, backend and RL microservice diagnostic health checks.

---

## 9. Repository Structure

```
AgentWallet/
├── README.md                           # Publication-grade technical documentation
├── LICENSE                             # MIT License
├── package.json                        # Root monorepo orchestration scripts
├── docker-compose.yml                  # Multi-container orchestration (Postgres, RL, Backend, UI)
├── .env.example                        # Template environment configuration
├── .gitignore                          # Monorepo build and dependency exclusions
│
├── contracts/                          # Solidity settlement subsystem
│   ├── src/
│   │   └── AgentWallet.sol             # Core smart contract with EVM spending limits
│   ├── test/
│   │   └── AgentWallet.test.js         # Hardhat unit tests (6 passing tests)
│   ├── scripts/
│   │   └── deploy.js                   # Base Sepolia deployment automation
│   ├── deployments/                    # Network deployment records (contains .gitkeep)
│   ├── hardhat.config.js               # Solidity 0.8.24 compiler configuration
│   └── package.json                    # Contract subsystem dependencies
│
├── backend/                            # Node.js orchestration & verification service
│   ├── src/
│   │   ├── server.js                   # Server bootstrap & port listener
│   │   ├── app.js                      # Express middleware & route registration
│   │   ├── config/
│   │   │   ├── env.js                  # Environment variable resolution & startup checks
│   │   │   ├── database.js             # PostgreSQL connection pool with memory fallback
│   │   │   └── blockchain.js           # Ethers.js provider and contract instance loader
│   │   ├── controllers/                # HTTP request handlers (agent, wallet, rl, tx, contract)
│   │   ├── services/
│   │   │   ├── agentOrchestrator.js    # Nine-stage lifecycle coordinator
│   │   │   ├── safetyService.js        # Deterministic guardrail validation engine
│   │   │   ├── blockchainService.js    # RPC read adapter & executePayment calldata encoder
│   │   │   ├── rlClient.js             # HTTP client communicating with Python FastAPI
│   │   │   └── transactionService.js   # Transaction tracking and async receipt monitor
│   │   ├── repositories/               # Dual persistence adapters (PG with Map fallback)
│   │   ├── middleware/                 # Request body validation & centralized error handler
│   │   └── tests/
│   │       └── health.test.js          # Backend endpoint validation tests
│   ├── Dockerfile                      # Container definition for backend service
│   └── package.json                    # Express, Ethers.js v6, PG dependencies
│
├── rl-engine/                          # Statistical intelligence & simulation microservice
│   ├── app/
│   │   ├── main.py                     # FastAPI application entrypoint
│   │   ├── config.py                   # Service paths and guardrail constants
│   │   ├── api/
│   │   │   ├── routes.py               # Endpoints (/propose, /predict, /evaluate, /health)
│   │   │   └── schemas.py              # Pydantic request and response models
│   │   ├── environment/
│   │   │   ├── wallet_env.py           # Gymnasium simulation environment (WalletEnv)
│   │   │   ├── state_encoder.py        # 8D state vector normalizer
│   │   │   ├── action_space.py         # 4-choice discrete action space definition
│   │   │   ├── reward_function.py      # Composite operational utility & gas reward formula
│   │   │   └── observation_builder.py  # Structured telemetry builder
│   │   ├── agents/
│   │   │   ├── base_agent.py           # Abstract BaseRLAgent class
│   │   │   ├── ppo_agent.py            # PPO Actor-Critic with heuristic fallback
│   │   │   ├── dqn_agent.py            # DQN Q-Network with heuristic fallback
│   │   │   ├── agent_registry.py       # Thread-safe policy registry
│   │   │   └── inference.py            # Decision generation coordinator
│   │   ├── safety/
│   │   │   ├── action_validator.py     # Python deterministic guardrail checker
│   │   │   └── constraints.py          # Safety boundary dataclasses
│   │   ├── training/
│   │   │   ├── train_ppo.py            # PPO learning loop script
│   │   │   ├── train_dqn.py            # DQN learning loop script
│   │   │   ├── callbacks.py            # SafetyAuditCallback for training rollouts
│   │   │   └── checkpoints.py          # Checkpoint serialization utilities
│   │   ├── evaluation/
│   │   │   ├── evaluate_ppo.py         # Standalone PPO evaluation runner
│   │   │   ├── evaluate_dqn.py         # Standalone DQN evaluation runner
│   │   │   ├── compare_agents.py       # PPO vs. DQN side-by-side comparative benchmark
│   │   │   └── metrics.py              # Financial and safety metrics calculations
│   │   └── monitoring/
│   │       └── training_metrics.py     # Rollout telemetry logger
│   ├── configs/
│   │   ├── ppo.yaml                    # PPO hyperparameters & training schedule
│   │   └── dqn.yaml                    # DQN hyperparameters & exploration decay
│   ├── models/
│   │   ├── ppo/                        # Saved PPO checkpoints (contains .gitkeep)
│   │   └── dqn/                        # Saved DQN checkpoints (contains .gitkeep)
│   ├── tests/
│   │   ├── test_env.py                 # WalletEnv initialization and step tests
│   │   ├── test_agents.py              # Agent inference and registry tests
│   │   └── test_safety.py              # Deterministic validator unit tests
│   ├── Dockerfile                      # Container definition for RL engine
│   └── requirements.txt                # FastAPI, Uvicorn, Gymnasium, Torch, Pytest
│
├── frontend/                           # Client dashboard (Verdant Design System)
│   ├── src/
│   │   ├── main.jsx                    # React root entrypoint
│   │   ├── app/
│   │   │   ├── App.jsx                 # Master application layout container
│   │   │   ├── router.jsx              # React Router v6 route configuration
│   │   │   └── providers.jsx           # Context providers
│   │   ├── pages/                      # Page views (Overview, Wallet, Agent, RL, Contracts, etc.)
│   │   ├── components/                 # UI components modularized by domain
│   │   ├── hooks/                      # Custom hooks (useWallet, useAgent, useNetwork)
│   │   ├── services/                   # Frontend HTTP & contract service wrappers
│   │   ├── config/                     # Network constants & contract ABI declarations
│   │   └── styles/                     # Tailwind stylesheets & theme tokens
│   ├── tests/
│   │   └── App.test.jsx                # Component rendering and formatting tests
│   ├── Dockerfile                      # Production build container definition
│   ├── vite.config.js                  # Vite bundler configuration
│   └── package.json                    # React 18, Vite, Ethers.js, Tailwind dependencies
│
├── database/                           # Persistence schemas & seed migrations
│   ├── schema.sql                      # Complete 6-table DDL schema
│   ├── migrations/
│   │   └── 001_initial_schema.sql      # Initial migration
│   └── seeds/
│       └── dev_seed.sql                # Development seed fixtures
│
├── shared/                             # Cross-tier constants & JSON schemas
│   ├── constants.js                    # Network IDs, action spaces, and guardrail limits
│   └── schemas/
│       ├── agent-decision.schema.json  # JSON schema for proposal validation
│       ├── wallet-state.schema.json    # JSON schema for telemetry payloads
│       └── transaction.schema.json     # JSON schema for tracked transaction records
│
├── tests/                              # Cross-tier integration & security tests
│   ├── integration/
│   │   └── test_agent_safety_pipeline.js   # Pipeline safety verification
│   ├── security/
│   │   └── test_authorization_boundary.js # Non-custodial & TTL expiration tests
│   └── e2e/
│       └── test_flow_overview.js          # Full 9-stage lifecycle test
│
└── docs/                               # In-depth architectural & reference guides
    ├── architecture.md
    ├── project-scope.md
    ├── ppo-vs-dqn.md
    ├── state-action-reward.md
    ├── safety-and-authorization.md
    ├── smart-contract-integration.md
    ├── api-documentation.md
    └── testing-and-demo.md
```

---

## 10. Technology Stack

| Layer | Technology | Version | Purpose in Codebase | Implementation Status |
|---|---|---|---|:---:|
| **Smart Contracts** | Solidity | `^0.8.24` | On-chain treasury management and spending limit enforcement | **Implemented** |
| **Contract Tooling** | Hardhat | `^2.22.2` | Contract compilation, testing, and testnet deployment | **Implemented** |
| **Web3 Client** | Ethers.js | `^6.11.1` | JSON-RPC provider, ABI calldata encoding, event listening | **Implemented** |
| **Signer Provider** | MetaMask | EIP-1193 | Client-side cryptographic transaction authorization | **Implemented** |
| **Backend Framework** | Express.js | `^4.19.2` | Orchestration server, REST routing, and middleware | **Implemented** |
| **Backend Runtime** | Node.js (ESM) | `v18+` / `v20+` | Asynchronous I/O runtime for backend and integration tests | **Implemented** |
| **RL Microservice** | FastAPI | `^0.110.0` | High-performance asynchronous REST API for RL inference | **Implemented** |
| **ASGI Server** | Uvicorn | `^0.28.0` | Production HTTP server for Python FastAPI service | **Implemented** |
| **RL Environment** | Gymnasium | `^0.29.1` | Standardized simulated wallet environment (`WalletEnv`) | **Implemented** |
| **Deep Learning** | PyTorch / SB3 | `^2.2.0` | Neural network training loops for PPO and DQN agents | **Implemented** |
| **Validation Models** | Pydantic | `^2.6.4` | Request and response schema validation in Python | **Implemented** |
| **Frontend Framework** | React | `^18.2.0` | Interactive component-based UI for dashboard | **Implemented** |
| **Build Tooling** | Vite | `^5.1.6` | Frontend bundler and hot-module replacement server | **Implemented** |
| **Styling** | Tailwind CSS | `^3.4.1` | Utility-first styling implementing Verdant Design System | **Implemented** |
| **Persistence** | PostgreSQL | `16-alpine` | Relational audit trails for proposals, events, and transactions | **Implemented** *(with in-memory fallback)* |
| **Containerization** | Docker Compose | `3.8` | Multi-service local environment containerization | **Implemented** |

---

## 11. Installation & Environment Setup

### 11.1 System Prerequisites
- **Node.js:** `v18.x`, `v20.x`, or `v22.x` (LTS recommended)
- **npm:** `v9.x` or higher
- **Python:** `3.10`, `3.11`, or `3.12` (Python 3.10–3.11 recommended for PyTorch/Stable-Baselines3 compatibility)
- **MetaMask:** Browser extension installed on Chrome, Brave, or Firefox
- **Docker & Docker Compose:** *(Optional)* For containerized multi-tier execution

### 11.2 Environment Configuration
Clone the repository and instantiate the root `.env` configuration:
```bash
git clone https://github.com/your-username/AgentWallet.git
cd AgentWallet
cp .env.example .env
```

Review and adjust variables in `.env` as required:
```ini
# Backend Service
BACKEND_PORT=4000
BACKEND_HOST=0.0.0.0
NODE_ENV=development

# Database (PostgreSQL) - Optional; falls back to in-memory if DB is offline
DATABASE_URL=postgresql://agentwallet_user:agentwallet_password@localhost:5432/agentwallet_db
DB_HOST=localhost
DB_PORT=5432
DB_USER=agentwallet_user
DB_PASSWORD=agentwallet_password
DB_NAME=agentwallet_db

# Reinforcement Learning Engine
RL_SERVICE_URL=http://localhost:8000
RL_SERVICE_PORT=8000
RL_HOST=0.0.0.0
RL_MODEL_DIR=./rl-engine/models

# Blockchain & Network (Base Sepolia Testnet)
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
BLOCK_EXPLORER_URL=https://sepolia.basescan.org

# Smart Contract Address (Populate after deploying via Remix or Hardhat)
AGENT_WALLET_CONTRACT_ADDRESS=

# Frontend Environment Variables
VITE_API_URL=http://localhost:4000/api
VITE_CHAIN_ID=84532
VITE_RPC_URL=https://sepolia.base.org
VITE_BLOCK_EXPLORER_URL=https://sepolia.basescan.org
VITE_CONTRACT_ADDRESS=
```

### 11.3 Dependency Installation

Install dependencies across all subsystems using native package managers:

```bash
# 1. Install Backend Dependencies
cd backend
npm install
cd ..

# 2. Install Frontend Dependencies
cd frontend
npm install
cd ..

# 3. Install Smart Contracts Dependencies
cd contracts
npm install
cd ..

# 4. Configure Python Virtual Environment & Install RL Engine Dependencies
cd rl-engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

---

## 12. Service Execution Guide

### 12.1 Local Multi-Terminal Execution

#### Terminal 1: Reinforcement Learning Microservice (FastAPI)
```bash
cd rl-engine
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Health check endpoint:* `http://localhost:8000/health`

#### Terminal 2: Orchestration & Safety Backend (Express)
```bash
cd backend
npm start
```
*Health check endpoint:* `http://localhost:4000/health`

#### Terminal 3: React Dashboard Client (Vite)
```bash
cd frontend
npm run dev
```
*Access UI at:* `http://localhost:5173`

---

### 12.2 Containerized Execution (Docker Compose)
To run PostgreSQL, the RL microservice, backend API, and frontend client concurrently:
```bash
docker-compose up --build
```
To stop the services:
```bash
docker-compose down
```

---

### 12.3 Reinforcement Learning Training & Evaluation

The RL engine provides executable training pipelines and evaluation benchmarks within the simulated `WalletEnv`:

#### Train PPO Agent (Actor-Critic)
```bash
cd rl-engine
source venv/bin/activate
python -m app.training.train_ppo
```
*Trains an Actor-Critic policy over 10,000 steps and saves the resulting model checkpoint to `models/ppo/best_model.zip`.*

#### Train DQN Agent (Deep Q-Network)
```bash
cd rl-engine
source venv/bin/activate
python -m app.training.train_dqn
```
*Executes Q-learning with experience replay and saves the checkpoint to `models/dqn/best_model.zip`.*

#### Execute Side-by-Side Comparative Benchmark
```bash
cd rl-engine
source venv/bin/activate
python -m app.evaluation.compare_agents
```
*Evaluates PPO and DQN over identical randomized simulation episodes and prints a comparative summary matrix.*

---

## 13. Testing & Reproducibility

AgentWallet incorporates a comprehensive multi-tier test suite verifying every component from Solidity bytecode to cryptographic boundary enforcement.

### 13.1 Run Complete Test Matrix
To execute all test suites across the monorepo in sequence:
```bash
npm test
```

### 13.2 Verified Subsystem Test Results

| Subsystem | Test Command | Framework | Tests Passed | Focus Area |
|---|---|---|:---:|---|
| **Smart Contracts** | `npm run test:contracts` | Hardhat / Chai | **6 / 6** | Reentrancy resistance, limits, pause logic, unauthorized caller reverts |
| **Backend API** | `npm run test:backend` | Node.js Test Runner | **1 / 1** | App initialization, router mounting, health diagnostics |
| **Frontend UI** | `npm run test:frontend` | Vitest / jsdom | **3 / 3** | UI rendering, address formatting, numeric precision formatting |
| **RL Engine** | `npm run test:rl` | Python `unittest` | **9 / 9** | Gym step dynamics, reward bounds, PPO/DQN fallback, safety validator |
| **Integration & Security** | `npm run test:integration` | Node.js Test Runner | **6 / 6** | E2E 9-stage pipeline, deterministic rejection, 180s TTL, non-custodial boundary |
| **Total Monorepo Suite** | `npm test` | *Multi-framework* | **25 / 25** | **100% Passing Test Suite** |

### 13.3 Subsystem Test Execution Commands
Individual test suites can be executed independently:
```bash
# Run Solidity smart contract tests
npm run test:contracts

# Run backend route tests
npm run test:backend

# Run frontend unit tests
npm run test:frontend

# Run Python RL engine unit tests
npm run test:rl

# Run integration and security boundary tests
npm run test:integration
```

---

## 14. API Reference

### 14.1 Backend Orchestration API (Express - Port 4000)

#### `GET /health`
Returns system health, uptime, and connectivity status for all external dependencies.
- **Response `200 OK`:**
  ```json
  {
    "status": "healthy",
    "service": "AgentWallet-Backend",
    "timestamp": "2026-10-15T11:58:39.123Z",
    "uptime": 128.45,
    "dependencies": {
      "database": "in-memory-fallback",
      "rlEngine": "healthy",
      "evmRpc": "connected"
    }
  }
  ```

#### `GET /api/wallet/state`
Queries live on-chain parameters from the Base Sepolia RPC and configured contract.
- **Query Parameters:** `address` *(optional, EVM hex address)*
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "isConfigured": true,
      "chainId": 84532,
      "blockNumber": 6842109,
      "walletAddress": "0xYourContractAddress",
      "nativeBalanceWei": "1000000000000000000",
      "nativeBalanceEth": 1.0,
      "dailySpentEth": 0.01,
      "dailyLimitEth": 0.05,
      "perTxLimitEth": 0.01,
      "baseFeeGwei": 16.2,
      "mempoolCongestion": 0.28,
      "slippageSpreadBps": 12.0,
      "isContractPaused": false,
      "timestamp": 1776254319
    }
  }
  ```

#### `GET /api/agent/status`
Returns agent orchestrator operational status and active policy model.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "state": "IDLE",
      "isPaused": false,
      "engineMode": "HITL_AUTONOMOUS",
      "activeModel": "PPO",
      "modelVersion": "AgentPolicy_v2.4_PPO",
      "pendingProposalsCount": 0,
      "lastCycleEvaluation": "2026-10-15T11:55:41.000Z"
    }
  }
  ```

#### `POST /api/agent/evaluate`
Manually triggers an observation and proposal generation cycle.
- **Request Body:**
  ```json
  {
    "agentType": "PPO",
    "overrideState": null
  }
  ```
- **Response `200 OK`:** Full proposal payload adhering to `agent-decision.schema.json`.

#### `POST /api/agent/proposals/:id/approve`
Approves a pending proposal and generates ABI-encoded calldata for client MetaMask signing.
- **Path Parameters:** `id` *(UUID string)*
- **Request Body:** `{"signerAddress": "0xUserEVMAddress"}`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "decisionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "status": "APPROVED",
      "callData": {
        "to": "0xContractAddress",
        "calldata": "0x61bc221a000000000000000000000000e592427a0aece92de3edee1f18e0157c05861564000000000000000000000000000000000000000000000000002386f26fc10000",
        "value": "0"
      },
      "approvedAt": 1776254325
    }
  }
  ```

#### `POST /api/agent/proposals/:id/reject`
Rejects a proposal and cancels signature requirements.
- **Request Body:** `{"reason": "Operator rejected due to market volatility"}`

#### `POST /api/agent/toggle-pause`
Toggles off-chain emergency pause, preventing evaluation cycles and proposal creation.

#### `GET /api/contract/config`
Returns contract address, Base Sepolia chain ID, RPC endpoint, and complete contract ABI.

#### `POST /api/transactions/track`
Registers a newly broadcasted transaction hash and initiates background receipt verification.
- **Validation:** Requires `fromAddress` and `toAddress` in body.

---

### 14.2 Intelligence Microservice API (FastAPI - Port 8000)

| HTTP Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Microservice health check and loaded model diagnostics |
| `GET` | `/models` | List registered RL policies (`PPO`, `DQN`) and checkpoint states |
| `POST` | `/models/select?agent_type=PPO` | Switch active policy architecture |
| `POST` | `/predict/ppo` | Run inference on raw 8D vector using PPO Actor-Critic |
| `POST` | `/predict/dqn` | Run inference on raw 8D vector using DQN Q-Network |
| `POST` | `/predict/active` | Run inference using currently active policy |
| `POST` | `/propose` | Ingest raw wallet state and return structured proposal with safety validation |
| `POST` | `/evaluate` | Run multi-episode evaluation rollouts in `WalletEnv` |

---

## 15. Security Architecture & Threat Model

AgentWallet implements a strict non-custodial authorization architecture designed around the principle of **least privilege**:

### 15.1 Custody & Key Isolation
- **Zero Server-Side Custody:** Neither the Express backend nor the FastAPI RL engine ever stores, generates, or accesses private keys or recovery mnemonics.
- **Client-Side Cryptographic Signatures:** Every on-chain mutation requires an explicit ECDSA ($secp256k1$) signature generated within the operator's MetaMask extension.
- **ABI Calldata Verification:** The backend only constructs unsigned transaction calldata. The operator's wallet extension decodes the recipient address and amount before final human approval.

### 15.2 Invariant Guarantees
- **Time-to-Live (TTL) Expiration:** Every decision proposal carries a strict $180\text{-second}$ expiration timestamp. Stale proposals cannot be approved after expiry, protecting against stale slippage and gas price drift.
- **Bytecode Limit Enforcement:** Even if the backend orchestrator or RL engine were completely compromised, the smart contract (`AgentWallet.sol`) enforces hard ceiling checks directly in EVM bytecode:
  - Single transfer cannot exceed `perTransactionLimit` ($0.01\text{ ETH}$).
  - Cumulative 24-hour transfers cannot exceed `dailySpendingLimit` ($0.05\text{ ETH}$).
  - Zero-address and contract self-transfers revert immediately.
- **Emergency Circuit Breaker:** The contract owner can invoke `setPaused(true)` to instantly halt execution. In parallel, the backend supports software-level emergency pausing.

---

## 16. Implementation Status Matrix

| Subsystem | Component / Module | Status | Verification & Evidence |
|---|---|:---:|---|
| **Contracts** | `AgentWallet.sol` | **Implemented** | Core contract code in `contracts/src/`; 6 Hardhat tests passing |
| **Contracts** | Deployment Scripts | **Implemented** | Hardhat deploy script in `contracts/scripts/deploy.js` |
| **Contracts** | Deployment Records | **Unverified** | `contracts/deployments/` contains `.gitkeep`; address must be set in `.env` |
| **Backend** | Agent Orchestrator | **Implemented** | Nine-stage coordinator implemented in `backend/src/services/` |
| **Backend** | Deterministic Safety Engine | **Implemented** | `safetyService.js` enforcing 6 hard invariant checks |
| **Backend** | Blockchain RPC Adapter | **Implemented** | Ethers.js v6 provider, calldata encoding, receipt monitoring |
| **Backend** | Persistence Layer | **Implemented** | Full PostgreSQL DDL in `database/schema.sql`; in-memory Map fallback |
| **Backend** | API Endpoints | **Implemented** | Express routes for health, wallet, agent, RL, contract, tx |
| **RL Engine** | `WalletEnv` Simulation | **Implemented** | Gymnasium environment with dynamics, gas drift, and bounds |
| **RL Engine** | PPO Agent | **Implemented** | Actor-Critic with heuristic fallback when weights are uncheckpointed |
| **RL Engine** | DQN Agent | **Implemented** | Deep Q-Network with heuristic fallback when weights are uncheckpointed |
| **RL Engine** | Pre-Trained Weights | **Planned** | Checkpoint directories contain `.gitkeep`; training scripts provided |
| **RL Engine** | FastAPI Microservice | **Implemented** | Asynchronous endpoints for `/propose`, `/predict`, `/evaluate` |
| **Frontend** | Verdant Design System | **Implemented** | React 18, Tailwind CSS, high-contrast monospace numeric formatting |
| **Frontend** | MetaMask Integration | **Implemented** | EIP-1193 provider connection, account change, chain verification |
| **Frontend** | Proposal Approval Panel | **Implemented** | HITL review interface with 180s countdown TTL timer |
| **Frontend** | Contract Admin & Limits | **Implemented** | Spending limit update and deposit forms in `SmartContracts.jsx` |
| **Testing** | Monorepo Test Matrix | **Implemented** | 25 automated tests passing across contracts, backend, RL, UI, and E2E |

---

## 17. Current Limitations & Technical Roadmap

### 17.1 Current Limitations
1. **Testnet Faucet & Gas Constraints:** Lack of Base Sepolia testnet ETH due to faucet anti-sybil gates prevented live deployment on Remix IDE; the project utilizes local Hardhat nodes and in-memory mock blockchain simulation as documented in [Project Constraints](Project%20Constraints.md).
2. **Model Checkpoint Availability:** Pre-trained neural weights (`.zip` binaries) are not checked into the repository to conserve repository size and avoid unverified benchmark claims. The system relies on its deterministic fallback engine until `train_ppo.py` or `train_dqn.py` is executed locally.
3. **Contract Deployment Artifacts:** No live deployment JSON is stored in `contracts/deployments/`. The system requires deploying via Remix or Hardhat and setting `AGENT_WALLET_CONTRACT_ADDRESS` in `.env`.
4. **Single-Agent Concurrency:** The orchestrator currently tracks one active proposal at a time per session; parallel multi-agent proposal bidding is not yet supported.
5. **Testnet Calibration:** Default spending limits and gas models are calibrated specifically for the Base Sepolia Testnet.

### 17.2 Technical Roadmap
- [ ] **Automated Testnet Relayer:** Implement a gas-station relayer using EIP-2771 meta-transactions for automated execution of approved proposals.
- [ ] **Multi-Asset ERC-20 Support:** Extend `AgentWallet.sol` and the RL state space to manage ERC-20 tokens (e.g., USDC, DAI, WETH) alongside native ETH.
- [ ] **Reproducible Benchmark Checkpoints:** Publish versioned weights trained across 100,000 steps with standardized evaluation seeds.
- [ ] **Formal Verification:** Formally verify `AgentWallet.sol` invariants using Certora or the Slither static analysis framework.
- [ ] **Multi-Signature Treasury Governance:** Integrate Safe (formerly Gnosis Safe) multi-sig compatibility for contract administrative actions.

---

## 18. Documentation Index

For comprehensive architectural specifications and subsystem deep dives, consult the dedicated documentation files:

- [Project Constraints & Environmental Limitations](Project%20Constraints.md) — Base Sepolia faucet restrictions, Remix IDE impact, and local simulation workarounds.
- [System Architecture Specification](docs/architecture.md) — Detailed tier diagrams, data flow models, and component boundaries.
- [Project Scope & System Boundaries](docs/project-scope.md) — Research objectives, operational boundaries, and non-goals.
- [PPO vs. DQN Comparative Analysis](docs/ppo-vs-dqn.md) — Mathematical formulations, loss functions, and benchmark methodology.
- [State, Action, and Reward Design](docs/state-action-reward.md) — Formal MDP definition, observation vector scaling, and reward weights.
- [Safety & Authorization Model](docs/safety-and-authorization.md) — Deterministic guardrail specification and custody boundary isolation.
- [Smart Contract Integration Guide](docs/smart-contract-integration.md) — `AgentWallet.sol` ABI, functions, and Remix IDE deployment guide.
- [API Documentation](docs/api-documentation.md) — Complete endpoint reference for Express backend and FastAPI RL service.
- [Testing & Verification Guide](docs/testing-and-demo.md) — Step-by-step instructions for running test suites and simulated rollouts.

---

## 19. License

This project is open-source software licensed under the [MIT License](LICENSE).
