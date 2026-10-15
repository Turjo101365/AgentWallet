# Test Results

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

## Regression investigated

The allowlist removal test had reportedly failed only in a full suite. The production snapshot used `provider.getBlock('latest')` immediately after a mined owner transaction. ethers can briefly cache reads by the `latest` alias, leaving the risk engine pinned to an earlier block. The snapshot now fetches a fresh `eth_blockNumber` first and reads by explicit height. The test asserts that creation and approval snapshots include the respective allowlist transaction blocks. The observed runs passed; this change addresses a plausible timing cause, but it is not proof that every prior failure had this cause.

## End-to-end evidence

The local-chain run reported PPO and DQN both available. It verified a signed owner approval followed by an agent transaction with receipt status 1, and a separate signed task grant followed by a confirmed autonomous transaction. It also checked synthetic-feed portfolio valuation, persistence after backend restart and audit-chain verification. Transaction hashes and addresses belong to an ephemeral Hardhat chain.

## Not yet verified

- Real LLM provider responses; no API credentials were supplied.
- Browser and MetaMask extension flows.
- Docker images, compose and a PostgreSQL server.
- Base Sepolia deployment and transactions.
- RL timing performance on representative real-chain fees.
