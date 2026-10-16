# Test Results

> **Update 2026-10-17 (contract v2 and audit fixes F1–F3, local only).** A clean sequential run on a frozen tree gave:
>
> | Suite | Result |
> |---|---|
> | Contracts | 53/53 |
> | Backend | 145/145 |
> | Frontend | 32/32 |
> | Browser | 4/4 |
> | End-to-end | 8/8 |
> | RL | 25/25 |
> | Real MetaMask (local Hardhat, v2) | 11/11 |
> | Live gpt-4.1-mini | 19/19 (47/47 graded checks) |
>
> Details and red-before-green evidence: [SECURITY_SELF_ASSESSMENT.md §11](SECURITY_SELF_ASSESSMENT.md) and
> [CONTRACT_V2.md](CONTRACT_V2.md). The sections below are the earlier record and describe v1.

Recorded 2026-10-15 on Windows, branch `feature/phase-1-secure-foundation`, with the uncommitted Phase 1 and Phase 2 working tree preserved.

| Suite | Command | Result | Coverage |
|---|---|---|---|
| Contract | `npm run test:contracts` | 30 passed | Roles, caps, allowlist, replay, ERC-20 behavior, pause and adversarial paths |
| Backend | `cd backend && npm test` | 83 passed, 0 failed | Security, approvals, execution, agent, scheduler, portfolio, persistence, recovery and policy |
| Frontend | `npm run test:frontend` | 18 passed | Critical wallet and Phase 2 component flows |
| RL | `npm run test:rl` | 21 passed | Timing environment, registry and API |
| End-to-end | `npm run test:e2e` | 8 passed | Local Hardhat chain, backend, real RL process, signed grant, autonomous transaction, portfolio and restart |
| Frontend build | `npm run build:frontend` | Passed | Vite production build; 568 kB JavaScript chunk warning |

**Total: 160 tests passed across the five suites.** The backend suite passed 83/83 both before and after the snapshot change, including the previously reported intermittent allowlist test. The targeted test also passed after the final receipt-block assertions were added.

## Re-run after the MetaMask compatibility fixes (2026-10-15, later)

| Suite | Command | Result |
|---|---|---|
| Contract | `cd contracts && npm test` | 35 passing |
| Backend | `cd backend && npm test` | 96 passed, 0 failed |
| Frontend | `cd frontend && npx vitest run` | 24 passed (includes `metamaskCompat.test.jsx`) |
| Browser (EIP-1193 bridge) | `cd frontend && npx playwright test` | 3 passed, 1 skipped (`agent.live.spec.js` needs `LIVE_LLM=1`) |
| End-to-end | `node --test tests/e2e/` | 8 passed |
| Frontend build | `cd frontend && npx vite build` | Passed (same chunk-size warning) |

| Real MetaMask extension | `cd frontend && LIVE_LLM=1 npm run test:metamask` | 1 passed (6.7 min): **all 11 checklist rows PASS** |

The real-extension run used:
- the official MetaMask 13.52.0 Chrome build, checksum-verified;
- Playwright Chromium 156 with a throwaway profile, and Playwright 1.64.1 without Synpress;
- its own local chains (31337 and 1338), backend and console;
- the live gpt-4.1-mini for row 9.

Every approval and rejection was clicked in MetaMask's own confirmation window. Evidence for each row (what MetaMask showed, tx hashes, blocks, 403 for the viewer) is in `docs/METAMASK_DEMO.md` §5. No application defects were found, so no application code changed for this run.

## Regression investigated

The allowlist removal test had reportedly failed only in a full suite. The production snapshot used `provider.getBlock('latest')` immediately after a mined owner transaction. ethers can briefly cache reads by the `latest` alias, leaving the risk engine pinned to an earlier block. The snapshot now fetches a fresh `eth_blockNumber` first and reads by explicit height. The test asserts that creation and approval snapshots include the respective allowlist transaction blocks. The observed runs passed; this change addresses a plausible timing cause, but it is not proof that every prior failure had this cause.

## End-to-end evidence

The local-chain run reported PPO and DQN both available. It verified a signed owner approval followed by an agent transaction with receipt status 1, and a separate signed task grant followed by a confirmed autonomous transaction. It also checked synthetic-feed portfolio valuation, persistence after backend restart and audit-chain verification. Transaction hashes and addresses belong to an ephemeral Hardhat chain.

## Not yet verified

- Live Anthropic and local model-server responses. Live gpt-4.1-mini results are recorded in [LIVE_LLM_VERIFICATION.md](LIVE_LLM_VERIFICATION.md).
- MetaMask beyond the automated checklist:
  - its nonce cache after a chain restart;
  - picking a network from MetaMask's own menu (row 11 switches through a page request);
  - MetaMask Mobile.
- Docker images, compose and a PostgreSQL server.
- Base Sepolia deployment and transactions.
- RL timing performance on representative real-chain fees.
