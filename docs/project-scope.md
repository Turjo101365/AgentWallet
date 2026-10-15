# AgentWallet — Project Scope & Boundaries

> **Status note (Phase 1):** this is design background. No trained PPO/DQN checkpoint exists yet; the engine runs a declared heuristic fallback. Current status: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## 1. Executive Summary

**AgentWallet** is an autonomous AI-powered cryptocurrency wallet management system that unites modern Reinforcement Learning (PPO and DQN), EVM smart contract guardrails, and non-custodial human authorization.

AgentWallet enables autonomous decision support for digital asset treasury management—such as intelligent liquidity rebalancing, gas-aware payment scheduling, and defensive asset stabilization—while strictly upholding a non-custodial, human-in-the-loop cryptographic authorization model.

---

## 2. Mandatory Core Focus Areas

The AgentWallet codebase focuses exclusively on the following capabilities:

1. **AI Agent Wallet Decision Support:**
   Continuous observation of on-chain parameters (balance, daily spent, gas fee, mempool congestion, liquidity spread) and generation of structured, explainable action proposals.

2. **Reinforcement Learning Architectures (PPO & DQN):**
   - **Proximal Policy Optimization (PPO):** Policy-gradient actor-critic method generating action probabilities and value estimates.
   - **Deep Q-Network (DQN):** Value-based deep Q-learning with target networks and experience replay buffer.
   - Discrete, identical action spaces ensuring direct comparability and reproducibility.

3. **RL Simulation, Training, Evaluation & Inference:**
   - Dedicated Gymnasium wallet environment simulation with realistic market/gas dynamics.
   - Offline training pipelines with checkpointing, callbacks, and convergence tracking.
   - Standalone FastAPI inference microservice (`rl-engine`) serving policy decisions via REST.

4. **Solidity Smart Contract Security:**
   - On-chain spending limits: strictly enforced `perTransactionLimit` and `dailySpendingLimit`.
   - Role-based authorization (`onlyOwner`, `onlyAgent`) and emergency kill switches (`paused`, `emergencyWithdraw`).
   - Reentrancy protection via checks-effects-interactions patterns.
   - Remix IDE and Hardhat compilation, deployment, and testing compatibility.

5. **MetaMask & EIP-1193 Non-Custodial Integration:**
   - Zero private key exposure: private keys never touch backend servers or Python environments.
   - Transactions are prepared as deterministic calldata and submitted to MetaMask for explicit user signature.

6. **Deterministic Safety Validation Layer:**
   - Independent validation engine running prior to user presentation.
   - Cryptographic and algorithmic guardrails: allowance ceilings, router destination white-listing, gas price cut-offs, and proposal TTL timers.

7. **Institutional Visual Dashboard:**
   - Modern fintech UI implemented with React, Vite, and Tailwind CSS following the Verdant Protocol design specification (clean slate, emerald `#059669`, mint `#10b981`, Plus Jakarta Sans, and JetBrains Mono).

---

## 3. Explicit Out-of-Scope Items

To preserve architecture integrity, strict boundaries are enforced. The following features are explicitly **prohibited and excluded**:

- ❌ SME Finance Copilot or business accounting features.
- ❌ Invoice factoring, automated SME payroll, or accounts receivable/payable engines.
- ❌ Undercollateralized lending protocols or micro-credit scoring.
- ❌ Traditional commercial insurance underwriting or fiat banking rails.
- ❌ Automated autonomous key custody (the agent must never hold private keys or sign transactions on its own).
- ❌ Fake or mock data passed off as live on-chain data (see the Strict No-Fake-Data Rule).

---

## 4. System Roles & Responsibilities

| Component | Responsibility | Custodial Access |
|---|---|---|
| **RL Engine** (`rl-engine`) | Consumes state observations, computes Q-values / policy distributions, outputs proposed actions and explainable rationale. | **None** (No keys, no funds) |
| **Backend API** (`backend`) | Orchestrates state collection, triggers RL inference, runs deterministic safety checks, records audit trails in PostgreSQL. | **None** (Read-only RPC, no signing keys) |
| **Smart Contract** (`contracts`) | Enforces hard ceilings (`perTransactionLimit`, `dailySpendingLimit`, pause state) directly in EVM bytecode. | **Treasury Funds** (Locked until signed) |
| **Frontend** (`frontend`) | Displays verified telemetry, renders RL reasoning traces, and requests MetaMask user signatures for approved proposals. | **Client-Side Signer** (MetaMask extension) |
