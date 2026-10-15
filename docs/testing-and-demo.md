# Testing & Verification Guide

This document outlines the testing strategy, test commands, and simulation procedures across all tiers of AgentWallet.

---

## 1. Testing Framework Matrix

| Subsystem | Framework | Focus Area | Command |
|---|---|---|---|
| **Contracts** | Hardhat + Chai | EVM limits, reentrancy, pause logic, access controls | `cd contracts && npm test` |
| **Backend** | Node Test Runner / Jest | Routing, safety validation, RPC adapters | `cd backend && npm test` |
| **RL Engine** | Pytest | Gym env dynamics, reward math, inference bounds | `cd rl-engine && pytest` |
| **Frontend** | Vitest + React Testing Library | UI components, MetaMask state, proposal reviews | `cd frontend && npm test` |
| **Integration** | Mocha / Node | End-to-end multi-tier pipeline validation | `npm run test:integration` |

---

## 2. Hardhat Contract Unit Tests

The contract suite verifies the core security guarantees:

```bash
cd contracts
npm install
npx hardhat test
```

### Verified Test Cases
1. `should set deployer as owner and default agent`
2. `should accept deposits and increment balance`
3. `should allow agent to execute payment within limits`
4. `should revert if payment exceeds perTransactionLimit`
5. `should revert if cumulative payments exceed dailySpendingLimit`
6. `should revert unauthorized callers attempting executePayment`
7. `should prevent payments when paused and allow emergency withdrawal`

---

## 3. RL Engine Tests

Verify environment observation bounds, reward calculations, and deterministic action constraints:

```bash
cd rl-engine
pip install -r requirements.txt
pytest tests/ -v
```

### Verified Test Cases
1. `test_wallet_env_step_and_observation_space`: Confirms 8-dimensional observation vector and bounds.
2. `test_reward_penalizes_high_gas`: Confirms penalty scaling during gas congestion.
3. `test_safety_validator_rejects_over_limit`: Asserts that `action_validator` blocks proposals exceeding bounds.

---

## 4. Backend Orchestration Tests

```bash
cd backend
npm install
npm test
```

Verifies:
- `health.routes.js` health checks and dependencies.
- `safetyService.js` rejecting illegal proposals.
- Express error handlers formatting consistent JSON error envelopes.

---

## 5. Base Sepolia EVM Deployment

To test transactions on Base Sepolia:

1. Fund your testnet wallet using the official Base Sepolia faucet (e.g. `https://faucets.chain.link/base-sepolia` or Coinbase faucet).
2. Deploy `AgentWallet.sol` via Remix IDE or Hardhat:
   ```bash
   cd contracts
   npx hardhat run scripts/deploy.js --network baseSepolia
   ```
3. Update `.env` with the deployed contract address and `CHAIN_ID=84532`.
4. Connect MetaMask switched to Base Sepolia (Chain ID: 84532).

---

## 6. Demo Simulation Mode

Per the **Strict No-Fake-Data Rule**, when no live blockchain connection or trained checkpoint is active, AgentWallet enters **Simulation Mode**:
- Marked with a high-visibility badge: `[SIMULATION ENGINE ACTIVE]`.
- All simulated actions are explicitly flagged as synthetic benchmarks and never saved as live blockchain receipts.
- Live tabs display `Not connected` or `No transactions recorded` until genuine on-chain interactions occur.
