# Implementation Status

> **Current status (2026-10-17).**
> - **Public, contract v1:** the Ethereum Sepolia run of 2026-10-16. Contract `0x8A44…956a6`, 11 transactions, AI-drafted owner-approved and autonomous transfers. Evidence: `evidence/sepolia/`, Deliverable 06.
> - **Local only, contract v2:** on-chain verification of the owner's EIP-712 approvals and task grants, the signed execution deadline, grant run and total counters, and on-chain grant and intent revocation. Tested on local Hardhat chains, including real MetaMask and live gpt-4.1-mini. See [CONTRACT_V2.md](CONTRACT_V2.md).
> - **Public, contract v2 (complete):** Ethereum Sepolia `0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`, 2026-10-17, 12/12 SUCCESS (`evidence/sepolia-v2-full/`):
>   - an AI-drafted transfer executed only with the owner's EIP-712 signature verified on-chain;
>   - an AI-drafted payment executed autonomously under a bounded owner-signed grant;
>   - a second grant revoked on-chain;
>   - pause/unpause, emergency stop and withdrawal.
>
>   It ended paused, with the agent revoked and a zero balance; 26/26 read-only checks passed.
> - **Public, contract v2 run 1 (partial, frozen):** `0x23bA…4458`. Its grant run reverted out of gas because the UTC day changed between gas estimation and inclusion; this is fixed and regression-tested. See [V2_PUBLIC_RUNS.md](V2_PUBLIC_RUNS.md).
> - **Backend fixes for audit findings F1 and F3:** expiry and signature re-verification at execution, for both contract versions.
> - **Swaps:** a contract primitive only (owner-only, unwired). There is no rebalancing.
> - **Docker:** not verified.
> - The sections below are the 2026-10-15 record.

Updated 2026-10-15 after repository reconnaissance and local verification. Test details are in [TEST_RESULTS.md](TEST_RESULTS.md).

## Implemented and locally verified

| Area | Current implementation | Evidence |
|---|---|---|
| Contract | Separate owner and limited agent, allowlist, per-transaction and UTC-day caps, replay protection, pause, emergency withdrawal, ETH and ERC-20 paths | 30 Hardhat tests |
| Authentication and policy | SIWE sessions, owner role from chain, strict input validation, block-pinned risk assessment, simulation, reservations, EIP-712 approvals, audit chain | Backend security, policy, execution and persistence tests |
| Execution | Local-chain agent signing, receipt verification, idempotency, restart recovery | Backend execution tests and 8 end-to-end tests |
| Autonomous tasks | Owner-signed grants; one-time, recurring and conditional scheduling; leases, retries, recovery, circuit breakers, escalation and auto-approval bounds | Backend scheduler tests and local-chain end-to-end test |
| LLM agent | Natural-language tool loop, strict tool validation, persistent conversation history, proposal/task creation and authority boundaries | Scripted provider tests and injected-fetch Anthropic wire test |
| RL timing | Trained PPO and DQN checkpoints loaded for local inference; timing advice constrained by execution deadlines | 21 Python tests and local-chain end-to-end inference |
| Portfolio | Feed-sourced valuation, allocation targets and drift, exposure, spending analytics, balance snapshots | Backend portfolio tests and local-chain end-to-end valuation |
| Frontend | Agent, automation, portfolio, treasury, controls, approval, audit and security pages | 18 component tests and production build |
| Real MetaMask | Connect, add/switch network, SIWE, EIP-712 approval and grant, rejection, pause/unpause, deposit, agent-drafted approval, account and network switching | All 11 rows of the `METAMASK_DEMO.md` checklist pass with the official MetaMask 13.52.0 extension (`npm run test:metamask`, 2026-10-15). Local chains only |

## Implemented but still needs verification

- Live OpenAI-compatible interaction was verified with gpt-4.1-mini; see [LIVE_LLM_VERIFICATION.md](LIVE_LLM_VERIFICATION.md). Anthropic and local model servers still need live verification.
- MetaMask outside the automated checklist:
  - nonce-cache behaviour after a chain restart;
  - choosing a network from MetaMask's own menu (the run switches through a page request);
  - MetaMask Mobile.
- PostgreSQL server mode: persistence tests use PGlite. Docker images and compose have not been built on this host.
- Base Sepolia: deployment script and guards exist, but no public deployment or transaction has been authorized or performed.
- RL performance on real-chain fee distributions: current training and held-out evaluation use synthetic gas data.
- Receipt-drop and deep-reorg recovery branches need direct fault-injection coverage.

## Partial or unavailable

- Portfolio rebalancing is advisory; there is no swap route or executable rebalance path.
- Checkpoint ZIP files are present locally but ignored by Git. The metadata files are untracked. A fresh clone does not contain the trained models.
- The root test command now launches the local Python virtual environment on Windows or Unix. CI and dependency scanning remain to be set up.

## Next engineering priorities

1. Extend the live-provider evaluation to Anthropic and local model servers, including refusal, tool-schema compatibility and representative user commands.
2. Verify Docker and PostgreSQL paths, then add CI gates for the full suite and dependency scanning.
3. Decide how to distribute checkpoint artifacts and evaluate timing against representative Base Sepolia fee histories.
4. Design and security-review a bounded swap/rebalance flow before claiming executable portfolio rebalancing.
5. Prepare Base Sepolia configuration and deployment review; public deployment and transaction broadcast require explicit owner approval.
