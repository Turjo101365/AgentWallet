# Backend API

Base URL `http://localhost:4000`.

**Response shape:**
- success: `{ "success": true, "data": … }`
- error: `{ "success": false, "error": { "code", "message", "details?", "requestId" } }`

Request bodies are strict: unknown fields return `400 VALIDATION_FAILED`. Amounts are decimal
strings in token units (`"0.005"`). Returned amounts are integer base-unit strings (`amountWei`)
plus a formatted value.

**Auth levels:**
- **public**: no token
- **session**: `Authorization: Bearer <token>` from sign-in
- **owner**: session whose address equals the contract's on-chain `owner()`

## Public
| Method | Path | Description |
|---|---|---|
| GET | `/health` | 200 `ok` or 503 `degraded`, with database, chain (incl. RPC chain id), executor, RL engine and indexer checks |
| GET | `/api/config` | Chain id, network, contract address, tokens, ABI, executor address, proposal TTL, chain readiness |
| POST | `/api/auth/nonce` | `{address}` → `{message, nonce, expiresAt}`; an EIP-4361 message to sign with `personal_sign` |
| POST | `/api/auth/verify` | `{message, signature}` → `{token, address, role, expiresAt}`. The nonce is single-use |

## Session
| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/session` | Current session and role (`owner` / `viewer`) |
| POST | `/api/auth/logout` | Revokes the session |
| GET | `/api/wallet/state` | Block-pinned on-chain snapshot: per-token balance, caps, spent today, remaining; paused; agent; executor gas balance; off-chain pause |
| GET | `/api/recipients` | Allowlisted recipients (from `RecipientUpdated` events, re-checked on-chain) with labels |
| GET | `/api/proposals?status=A,B&limit=n` | Proposals with execution details; `approvalTypedData` when awaiting approval |
| GET | `/api/proposals/:id` | One proposal |
| GET | `/api/agent/status` | Pause state, RL payee, pending approvals, executor, RL health, indexer status |
| GET | `/api/agent/decisions` | RL decision log |
| GET | `/api/transactions` | Verified history (receipts + indexed contract events) |
| POST | `/api/transactions/track` | `{txHash}`: the backend reads the tx from chain, checks it targets the wallet, and indexes it. No other fields are accepted |
| GET | `/api/audit` | Last 200 audit entries |
| GET | `/api/audit/verify` | Recomputes the hash chain: `{valid, entries, head | brokenAt}` |
| GET | `/api/rl/models` | RL policies and their `policy_source` |

## Owner
| Method | Path | Description |
|---|---|---|
| POST | `/api/proposals` | `{token, recipient, amount, memo?}` → 201 with `status` `AWAITING_APPROVAL` or `POLICY_REJECTED`, plus `policyResult` and `simulation` |
| POST | `/api/proposals/:id/approve` | Header `Idempotency-Key` (16–128 URL-safe chars), body `{signature}` = EIP-712 signature of `approvalTypedData`. Errors: 401 wrong signer/proposal, 409 `INVALID_STATE`, 410 `PROPOSAL_EXPIRED`, 422 `POLICY_FAILED_AT_APPROVAL` / `IDEMPOTENCY_KEY_REUSED` |
| POST | `/api/proposals/:id/reject` | `{reason?}` |
| POST | `/api/agent/pause` / `/api/agent/resume` | `{reason?}`. Persistent off-chain pause; blocks new proposals, approvals and execution |
| PUT | `/api/agent/settings` | `{rlPayee: address | null}`: where RL payment suggestions may go (must also be allowlisted on-chain) |
| POST | `/api/agent/evaluate` | `{agentType?: "PPO"|"DQN"}`. Runs an RL evaluation on live chain state; returns `{decision, proposal|null}`; 503 `RL_UNAVAILABLE` if the engine is down |
| PUT | `/api/recipients/:address/label` | `{label}`. Display label only; allowlisting is an on-chain owner transaction |
| POST | `/api/rl/models/select`, `/api/rl/evaluate` | Choose the active policy; run simulator episodes |

## EIP-712 approval

```js
domain = { name: 'AgentWallet Operator Approval', version: '1', chainId, verifyingContract: <wallet> }
ApproveTransfer(string proposalId, bytes32 intentId, address token, address recipient, uint256 amount, uint256 deadline)
```

`deadline` is the proposal expiry. The backend returns the exact object to sign. Clients must not
build their own.

## Proposal statuses
`POLICY_REJECTED`, `AWAITING_APPROVAL`, `APPROVED`, `SUBMITTED`, `CONFIRMED`, `FAILED`, `REJECTED`, `EXPIRED`.
`CONFIRMED` is only set after the mined receipt is verified (status 1, target, matching `TransferExecuted`).

## RL engine (internal, port 8000)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Status and `policy_sources` |
| GET | `/models` | Agent metadata incl. `load_error` |
| POST | `/models/select?agent_type=` / `/models/reload` | Active policy / reload checkpoints |
| POST | `/predict/{ppo,dqn,active}` | 8-dim observation → action |
| POST | `/propose` | `{raw_state, agent_type?}` → `{agentType, modelVersion, policySource, actionIndex, actionType, suggestedAmountWei, confidence|null, rationale, observationVector}` |
| POST | `/evaluate` | `{agent_type, episodes, seed?}`. Synthetic simulator rewards |
