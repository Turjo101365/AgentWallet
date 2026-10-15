# AgentWallet — API Documentation

This document describes the REST APIs exposed by the Backend Orchestrator (`http://localhost:4000`) and the RL Engine Microservice (`http://localhost:8000`).

---

## 1. Backend Orchestration API (Port 4000)

### 1.1 Health & Diagnostics
#### `GET /health`
Returns backend service uptime, database connectivity, and RL engine status.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-15T04:50:00.000Z",
  "uptime": 124.5,
  "services": {
    "database": "connected",
    "rlEngine": "available",
    "rpcNode": "connected"
  }
}
```

---

### 1.2 Wallet State & Telemetry
#### `GET /api/wallet/state`
Returns the real-time observed on-chain state of the wallet and connected smart contract.

**Query Parameters:**
- `address` (optional): Override target wallet address. Defaults to configured contract.

**Response (200 OK):**
```json
{
  "chainId": 84532,
  "blockNumber": 6842109,
  "walletAddress": "0x71C8412eD33ef08083a216F669B78D8210D3498B",
  "nativeBalanceWei": "14842000000000000000",
  "nativeBalanceEth": 14.842,
  "dailySpentEth": 0.0035,
  "dailyLimitEth": 0.05,
  "perTxLimitEth": 0.01,
  "baseFeeGwei": 14.2,
  "mempoolCongestion": 0.28,
  "slippageSpreadBps": 12.0,
  "isContractPaused": false,
  "timestamp": 1792039800
}
```

---

### 1.3 Agent & Decision Lifecycle
#### `GET /api/agent/status`
Returns current operational mode, active policy, and execution lock.

**Response (200 OK):**
```json
{
  "state": "IDLE",
  "engineMode": "HITL_AUTONOMOUS",
  "activeModel": "PPO",
  "modelVersion": "AgentPolicy_v2.4_PPO",
  "pendingProposalsCount": 0,
  "lastCycleEvaluation": "2026-10-15T04:48:00.000Z"
}
```

#### `POST /api/agent/evaluate`
Triggers an observation-inference-validation cycle using the active RL agent.

**Request Body:**
```json
{
  "agentType": "PPO",
  "overrideState": null
}
```

**Response (200 OK):**
```json
{
  "decisionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "agentType": "PPO",
  "modelVersion": "AgentPolicy_v2.4_PPO",
  "actionIndex": 2,
  "actionType": "STANDARD_REBALANCE",
  "proposedParameters": {
    "recipient": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    "amountEth": 0.01,
    "maxSlippageBps": 30,
    "gasLimit": 142500
  },
  "confidenceScore": 0.948,
  "rationale": "Slippage spread exceeds threshold theta=0.82; rebalancing reserve asset to lock yield.",
  "deterministicValidation": {
    "passed": true,
    "violations": [],
    "dailyLimitRemainingEth": 0.0465,
    "validatedAt": 1792039810
  },
  "authorization": {
    "status": "AWAITING_APPROVAL",
    "ttlSeconds": 180,
    "expiresAt": 1792039990,
    "signatureRequired": true
  },
  "createdAt": 1792039810
}
```

#### `POST /api/agent/proposals/:id/approve`
Records human authorization of a proposal and prepares call data for MetaMask.

**Response (200 OK):**
```json
{
  "decisionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "APPROVED",
  "contractCall": {
    "to": "0xContractAddress...",
    "method": "executePayment(address,uint256)",
    "args": ["0xE592427A0AEce92De3Edee1F18E0157C05861564", "10000000000000000"],
    "calldata": "0x4146bf38..."
  }
}
```

#### `POST /api/agent/proposals/:id/reject`
Rejects the proposal and records rejection reason.

---

### 1.4 Transactions
#### `GET /api/transactions`
Retrieves verified transactions from PostgreSQL audit table.

#### `POST /api/transactions/track`
Submits a newly broadcasted transaction hash from MetaMask for backend receipt monitoring.

---

## 2. RL Engine Microservice API (Port 8000)

### 2.1 Health & Models
#### `GET /health`
Returns PyTorch / Gymnasium availability and loaded agent registry status.

#### `GET /models`
Lists available model checkpoints for PPO and DQN, along with training epochs and timestamps.

### 2.2 Inference
#### `POST /predict/ppo`
Computes action probabilities and sampled action from state observation vector.

**Request Body:**
```json
{
  "observation": [0.74, 0.07, 0.93, 0.28, 0.15, 0.12, 0.85, 1.0]
}
```

**Response (200 OK):**
```json
{
  "agent": "PPO",
  "action": 2,
  "action_name": "STANDARD_REBALANCE",
  "confidence": 0.948,
  "probabilities": [0.02, 0.03, 0.948, 0.002],
  "value_estimate": 4.12
}
```

#### `POST /predict/dqn`
Computes Q-values for all discrete actions and selects $\arg\max_a Q(s, a)$.

**Response (200 OK):**
```json
{
  "agent": "DQN",
  "action": 2,
  "action_name": "STANDARD_REBALANCE",
  "confidence": 0.912,
  "q_values": [-0.15, 1.82, 4.35, -2.10]
}
```
