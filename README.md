# AgentWallet

A policy-bounded on-chain treasury agent for the 2026 International FinTech Competition.

AgentWallet lets an automated agent move funds from a smart-contract wallet, but only:
- to recipients the owner allowlisted on-chain;
- in assets the owner enabled;
- within per-transaction and daily caps enforced by the contract;
- after an owner EIP-712 approval or within a bounded owner-signed task grant.

The backend checks every transfer against live chain state and simulates it before anything is
signed, and only marks it confirmed after the receipt is verified.

> **Status: Phase 2 implemented and locally tested; external integrations remain to verify.**
>
> 160 automated tests pass, including a full-stack end-to-end run on a local chain. The LLM
> agent, autonomous scheduler, trained PPO/DQN timing policies and portfolio analytics are present.
> Real LLM interaction, browser/MetaMask flows, Docker and Base Sepolia remain unverified. See
> [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## How authority is split

| Role | Key | Power |
|---|---|---|
| Owner | Your wallet (MetaMask); never sent to the backend | Limits, allowlist, agent, pause, withdrawals, per-transfer approval and bounded task grants |
| Agent | Backend executor key | Only `executeTransfer`, inside the contract's limits, each intent once |
| LLM planner | Configured model provider | Reads data and drafts proposals/tasks; cannot sign, approve or bypass policy |
| RL timing advisor | Python service | Advises execution timing inside an authorized window; cannot choose recipient or amount |

## Repository

| Path | What |
|---|---|
| `contracts/` | `AgentWallet.sol` (OpenZeppelin 5), Hardhat tests (30), deploy script, local chain |
| `backend/` | Express API: auth, risk, LLM tools, scheduler, executor, portfolio, indexer, audit (83 tests) |
| `frontend/` | React/Vite console: agent, automation, portfolio, approvals and owner controls (18 tests) |
| `rl-engine/` | FastAPI timing service with trained PPO and DQN checkpoints (21 tests) |
| `database/migrations/` | PostgreSQL schema (also runs on embedded PGlite) |
| `shared/abi/` | ABI exported from the compiled contract |
| `tests/e2e/` | Full-stack local-chain test (8) |
| `docs/` | Architecture, security findings, test results, status, limitations, API |

## Quick start (local chain)

```bash
cd contracts && npm ci && cd ../backend && npm ci && cd ../frontend && npm ci && cd ..
cp backend/.env.example backend/.env
npm run chain            # terminal 1
npm run deploy:local     # once the chain is up
npm run dev:backend      # terminal 2
npm run dev:frontend     # terminal 3  ->  http://localhost:5173
```

Optional RL engine and the full demo script: [docs/testing-and-demo.md](docs/testing-and-demo.md).

## Tests

```bash
npm test   # contracts, backend, frontend, RL, e2e
```

Latest results and the local-chain transaction evidence: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Documentation
- [Architecture](docs/ARCHITECTURE.md)
- [Security findings](docs/SECURITY_FINDINGS.md) — every audit finding with its fix and test
- [Safety and authorization model](docs/safety-and-authorization.md)
- [Smart contract](docs/smart-contract-integration.md)
- [API](docs/api-documentation.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Project constraints (testnet faucet)](Project%20Constraints.md)
- Background: [PPO vs DQN](docs/ppo-vs-dqn.md), [state/action/reward design](docs/state-action-reward.md)

## Safety notes
- The backend accepts only chain 31337 (local) and 84532 (Base Sepolia). Every mainnet chain id is refused.
- The publicly known Hardhat keys are refused on Base Sepolia. A public-network executor key also
  requires `ALLOW_PUBLIC_TESTNET_EXECUTION=true`.
- Public deployment requires `CONFIRM_PUBLIC_DEPLOY=yes` and must be explicitly approved.

## License
MIT
