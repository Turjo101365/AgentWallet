# AgentWallet

A policy-bounded on-chain treasury agent for the 2026 International FinTech Competition.

AgentWallet lets an automated agent move funds from a smart-contract wallet, but only:
- to recipients the owner allowlisted on-chain;
- in assets the owner enabled;
- within per-transaction and daily caps enforced by the contract;
- after an owner EIP-712 approval or within a bounded owner-signed task grant.

The backend checks every transfer against live chain state and simulates it before anything is
signed, and only marks it confirmed after the receipt is verified.

> **Status (2026-10-16): executed on a public testnet.** AgentWallet ran on **Ethereum Sepolia**: contract
> [`0x8A44716Efabb6Ce401291B91D4427149CaF956a6`](https://sepolia.etherscan.io/address/0x8A44716Efabb6Ce401291B91D4427149CaF956a6),
> 11 transactions, all successful. They include a gpt-4.1-mini-drafted transfer approved by the owner (EIP-712) and a
> gpt-4.1-mini-drafted transfer executed **autonomously** under an owner-signed task grant. Evidence:
> [submission/06-execution-evidence/EXECUTION_EVIDENCE.md](submission/06-execution-evidence/EXECUTION_EVIDENCE.md).
>
> Tests (clean sequential run, 2026-10-17, local chains):
> - contracts 53;
> - backend 145;
> - frontend 32 + 4 browser flows;
> - end-to-end 8;
> - RL 25;
> - real MetaMask 13.52.0 checklist 11/11;
> - live gpt-4.1-mini safety suite 19/19.
>
> Public signing used a test-only wallet bridge; MetaMask was verified on a local chain. Docker and Base Sepolia execution are not verified. Submission package: [submission/SUBMISSION_CHECKLIST.md](submission/SUBMISSION_CHECKLIST.md).

> **Contract v2 (2026-10-17).** The public run above used contract **v1**: there, the owner's
> EIP-712 approval and task grants are verified by the backend, and the contract trusts the agent key within its caps
> and allowlist. **v2** verifies the owner's signature, the signed execution deadline and the grant bounds
> **on-chain**, and adds on-chain grant and intent revocation. It has a **complete public run on Ethereum Sepolia**: contract
> [`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`](https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F), 12/12 transactions SUCCESS. It covers:
> - an AI-drafted transfer executed only with the owner's signature verified on-chain;
> - an autonomous transfer under a bounded owner-signed grant;
> - on-chain revocation of a second grant;
> - pause/unpause, emergency stop and withdrawal, ending paused with the agent revoked and a zero balance.
>
> 26/26 read-only checks from public chain data. An earlier partial v2 run (`0x23bA…4458`) stopped when its grant run ran out of
> gas at 00:00 UTC; that was fixed and is documented. Details: [docs/V2_PUBLIC_RUNS.md](docs/V2_PUBLIC_RUNS.md), evidence:
> `evidence/sepolia-v2-full/`. The backend works with both versions. Details:
> [docs/CONTRACT_V2.md](docs/CONTRACT_V2.md).

## AI Treasury Manager (local implementation)

Current verification, release gates and rollback: [Treasury release-readiness report](docs/TREASURY_RELEASE_READINESS.md).

The Treasury workspace adds protected ETH reserves, scoped upcoming obligations,
deterministic payment planning and forecasts, and preparation through the existing
authorization/receipt pipeline. It is not yet deployed. See
[AI Treasury Manager](docs/AI_TREASURY_MANAGER.md) for calculations, security boundaries,
verification status and the judge demonstration.

## How authority is split

| Role | Key | Power |
|---|---|---|
| Owner | Your wallet (MetaMask); never sent to the backend | Limits, allowlist, agent, pause, withdrawals, per-transfer approval and bounded task grants |
| Agent | Backend executor key | v1: only `executeTransfer`, inside the contract's limits, each intent once. v2: additionally only with the owner's signature or grant, verified on-chain |
| LLM planner | Configured model provider | Reads data and drafts proposals/tasks; cannot sign, approve or bypass policy |
| RL timing advisor | Python service | Advises execution timing inside an authorized window; cannot choose recipient or amount |

## Repository

| Path | What |
|---|---|
| `contracts/` | `AgentWallet.sol` v2 (OpenZeppelin 5), frozen v1 in `legacy/`, Hardhat tests (53), deploy script, local chain |
| `backend/` | Express API: auth, risk, LLM tools, scheduler, executor, portfolio, indexer, audit (145 tests) |
| `frontend/` | React/Vite console: command deck, AI agent, automation, portfolio, approvals, risk and emergency controls (32 tests + 4 Playwright flows + real-MetaMask checklist) |
| `rl-engine/` | FastAPI timing service with trained PPO and DQN checkpoints, advisory only (25 tests) |
| `database/migrations/` | PostgreSQL schema (also runs on embedded PGlite) |
| `shared/abi/` | ABI exported from the compiled contract |
| `tests/e2e/` | Full-stack local-chain test (8) |
| `docs/` | Architecture, security findings, test results, status, limitations, API |
| `evidence/sepolia/` | Public Ethereum Sepolia run: receipts, AI-agent logs, timeline, screenshots, manifest (videos uploaded separately) |
| `submission/` | FinTechathon deliverables 01–06, scoring readiness, and read-only verification tools |

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

## Public testnet (Ethereum Sepolia): contract v1

The public run is **complete**: contract **v1** at `0x8A44716Efabb6Ce401291B91D4427149CaF956a6`, 11 transactions, 2026-10-16. Its run target is now **frozen**: the script refuses to execute it again, so the v1 deployment record, database and `evidence/sepolia/` can never be overwritten.

Anyone can re-check it read-only:

```bash
node submission/tools/verify-receipts.mjs        # 11/11 receipts, plus deployed bytecode == frozen v1 (public RPC, no keys)
node submission/tools/verify-owner-approval.mjs  # owner EIP-712 signature -> executed transfer (needs the team's run database)
```

Contract **v2**: the full Sepolia run is complete (`evidence/sepolia-v2-full/`, 12/12), and the earlier partial run is frozen (`evidence/sepolia-v2/`). See [docs/V2_PUBLIC_RUNS.md](docs/V2_PUBLIC_RUNS.md). Both targets now refuse to run again.

## Tests

```bash
npm test   # contracts, backend, frontend, RL, e2e
```

Latest results and the local-chain transaction evidence: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Documentation
- [Public judge hosting readiness](docs/HOSTING_READINESS.md), [Vercel/Render deployment plan](docs/HOSTING_DEPLOYMENT.md), and [judge quick start](docs/JUDGE_QUICK_START.md) — prepared for review; hosting is not yet deployed
- [Architecture](docs/architecture.md)
- [Contract v1 vs v2](docs/CONTRACT_V2.md)
- [Security findings](docs/SECURITY_FINDINGS.md) — every audit finding with its fix and test
- [Safety and authorization model](docs/safety-and-authorization.md)
- [Smart contract](docs/smart-contract-integration.md)
- [API](docs/api-documentation.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Security self-assessment](docs/SECURITY_SELF_ASSESSMENT.md)
- [Public run notes](evidence/sepolia/RUN_NOTES.md) and [organizer guidance](docs/ORGANIZER_GUIDANCE.md)
- [Project constraints (testnet faucet)](Project%20Constraints.md)
- Background: [PPO vs DQN](docs/ppo-vs-dqn.md), [state/action/reward design](docs/state-action-reward.md)

## Safety notes
- The backend accepts only chain 31337 (local), 84532 (Base Sepolia) and 11155111 (Ethereum Sepolia). Every mainnet chain id is refused.
- The publicly known Hardhat keys are refused on public networks. A public-network executor key also
  requires `ALLOW_PUBLIC_TESTNET_EXECUTION=true`.
- Public deployment requires `CONFIRM_PUBLIC_DEPLOY=yes` and must be explicitly approved.

## License
MIT
