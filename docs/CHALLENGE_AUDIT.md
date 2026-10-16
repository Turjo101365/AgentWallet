# FinTechathon "Autonomous On-chain Wallet": completeness audit

**Date:** 2026-10-16. **Scope:** the repository as it stands, uncommitted work included. **Method:** code reading, test runs on 2026-10-16, the Ethereum Sepolia evidence in `evidence/sepolia/`, and a read-only re-check of the deployed contract over the public RPC (bytecode functions, `paused()`, `agent()`).

## Status labels

The labels are strict.

| Label | Meaning |
|---|---|
| **Public** | Demonstrated on Ethereum Sepolia, with transaction hashes, receipts and an explorer record. |
| **Public (off-chain)** | Happened during the recorded public run, but leaves no on-chain artifact. Shown in the recording, screenshots and audit log only. |
| **Local** | Implemented and covered by automated tests or demos on a local Hardhat chain. Not public evidence. |
| **Implemented** | Code exists but is not exercised end to end. |
| **Partial** | Some of it exists; a named piece is missing. |
| **Missing** | Not built. |

No local test result is presented as public evidence.

### Test baseline (run 2026-10-16, after the UI redesign)

| Suite | Result |
|---|---|
| Contracts (Hardhat) | 35 passing |
| Backend (`node --test`) | 118/118. One full run hit a single failure in the timing-sensitive "daily-limit reservations stop concurrent approvals" test; it passed 3/3 in isolation and in a full rerun. Pre-existing; no backend code changed. |
| Frontend (vitest) | 24/24 |
| Browser (Playwright, real UI, local chain, test wallet bridge) | 3 passed, 1 skipped (the live-LLM spec, which needs a key) |
| End-to-end (local chain) | 8/8 |

---

## 1. Completeness matrix

### 1.1 AI agent

| Capability | Status | Evidence |
|---|---|---|
| Natural-language instructions turned into a plan and typed tool calls | **Public** | `evidence/sepolia/EVIDENCE.md`, "AI agent execution log": gpt-4.1-mini drafted both public transfers |
| The agent cannot sign or approve; actions are proposals or inactive tasks | **Public** | `0x2c83a855…2e37fb` needed the owner's EIP-712 signature; the task needed a signed grant |
| Invented recipient refused; prompt injection in a label cannot redirect funds; clarification instead of guessing | **Local** | `backend/test/agent.chat.test.js` |
| Agent may tighten policy and stop automation, never loosen | **Local** | `agent.chat.test.js` ("can tighten policy … cannot loosen anything") |
| Real-model behaviour beyond the two demo instructions | **Partial** | `docs/LIVE_LLM_VERIFICATION.md` (live gpt-4.1-mini suite). No broader eval set |
| Over-cap AI draft rejected by policy | **Public (off-chain)** | 0.0003 ETH draft rejected (PER_TX_LIMIT, BALANCE_AND_RESERVE): `evidence/sepolia/screenshots/08*`, audit log. Nothing was sent |

### 1.2 Autonomous on-chain execution

| Capability | Status | Evidence |
|---|---|---|
| Scheduler executes a transfer under an owner-signed task grant with no per-transfer signature | **Public** | `0xedeb6b97…e3cec3`, `approval_kind = TASK_GRANT` (`EVIDENCE.md`) |
| Runs above the auto-approval limit escalate to the owner | **Local** | `backend/test/scheduler.test.js` |
| Recurring, conditional (gas, balance) and RL-timed runs | **Local** | `scheduler.test.js`, `tests/e2e/local-chain.e2e.test.js` |
| Exactly-once execution: leases, duplicate invocation, crash recovery | **Local** | `scheduler.test.js`, `api.restart.test.js` |
| Circuit breaker and hourly autonomous outflow cap | **Local** | `scheduler.test.js` |
| RL (PPO/DQN) execution timing | **Local**, synthetic | Trained on a synthetic gas process only (`docs/KNOWN_LIMITATIONS.md`). Not used in the public run |

### 1.3 Asset management

| Capability | Status | Evidence |
|---|---|---|
| On-chain balances, caps and remaining allowance | **Public** | Sepolia contract; read-only screenshot `docs/ui-redesign/screenshots/public-sepolia/` |
| Deposit and owner withdrawal | **Public** | `0xe593d6d3…968ba1`, `0x6c8fb074…a5cff5` |
| Multi-asset (ERC-20) treasury | **Local** | mUSDC test token on Hardhat only; the public run is ETH only |
| USD valuation, allocation targets, drift, spending analytics | **Local** | `local-mock-feed (synthetic)` prices only; no feeds are configured on Sepolia |
| Swaps and rebalancing | **Partial** | `executeSwap` (owner-only, router allowlist, minOut, deadline ≤ 30 min, caps) is in the contract and in the **deployed** Sepolia bytecode (verified 2026-10-16). Tested with a mock router in `contracts/test/AgentWallet.swap.test.js`. `backend/src/services/assetManagementService.js` prepares swaps but is **not wired** into routes, agent tools or UI. No router is allowlisted on Sepolia |
| Autonomous rebalancing | **Missing** | `executeSwap` is `onlyOwner`, so the agent key cannot swap |

### 1.4 Transaction execution

| Capability | Status | Evidence |
|---|---|---|
| Deterministic intent IDs, replay protection, simulation before broadcast | **Public** | Proposal intent IDs and pre-flight results in the public run; `executedIntents` on-chain |
| Receipt-verified status (CONFIRMED only after a mined receipt) | **Public** | `EVIDENCE.md`, replayed on-chain checks |
| Idempotent approval (Idempotency-Key) | **Local** | `api.security.test.js` |
| Gas budgeting with a price floor (fixes attempt 1) | **Public** | Attempt 2 succeeded; `evidence/sepolia-attempt-1/ATTEMPT_NOTES.md` |
| Real MetaMask signing | **Local** | `docs/METAMASK_DEMO.md` §5, MetaMask 13.52.0, all 11 checklist rows. The public run used a **test-only EIP-1193 bridge** |

### 1.5 Risk control

| Capability | Status | Evidence |
|---|---|---|
| On-chain allowlist, per-transaction and daily caps | **Public** | All agent transfers were checked against them (`EVIDENCE.md`, table columns) |
| Backend policy engine: 14 block-pinned checks, reservations, reserve floor, gas cap | **Public (off-chain)** | Rejection screenshot 08; checks are shown on each proposal |
| Concurrent approvals cannot over-commit the daily cap | **Local** | `api.execution.test.js` |
| USD aggregate limit that fails closed on stale prices | **Local** | `scheduler.test.js` / portfolio tests |
| Pause, unpause, emergency stop (pause plus revoke agent) | **Public** | `0x2a2eeb50…`, `0x00b0dc31…`, `0xfe627133…`. Read-only check today: `paused() = true`, `agent() = 0x0` |
| Policy loosening needs explicit owner confirmation | **Local** | `scheduler.test.js` ("loosening requires console confirmation"), UI "I understand, apply it" |
| Behavioural anomaly detection (velocity, new-recipient cooling-off) | **Missing** | Only static caps and an hourly autonomous cap exist |

### 1.6 Security and compliance

| Capability | Status | Evidence |
|---|---|---|
| Owner/agent key separation; owner key never reaches the backend | **Public** | Owner, agent and deployer are distinct addresses in `EVIDENCE.md` |
| SIWE sessions, owner role read from chain, strict schemas, CORS | **Local** (SIWE used in the public run via the bridge) | `api.security.test.js` |
| Hash-chained, append-only audit log | **Public (off-chain)** | 22 entries valid after the public run. The log lives in the backend database; it is **not anchored on-chain** |
| Secret hygiene in evidence | **Public** | `secretScan` in `scripts/sepolia-demo.mjs`; `MANIFEST.json` SHA-256 |
| Self-assessment and threat model | **Implemented** | `docs/SECURITY_SELF_ASSESSMENT.md` (R1–R18). No external audit |
| Dependency vulnerabilities | **Partial** | Contracts and backend: 0. Frontend production: 2 moderate. Frontend dev tooling: 2 critical, 6 high (R6, R8), still open |
| Compliance (address screening, travel rule, KYC) | **Missing** | Allowlist only. No sanctions screening. The project explicitly excludes fiat and banking rails |
| Deployment gate for public chains | **Public** | `CONFIRM_PUBLIC_DEPLOY` is currently `no`; `backend/test/deploy.gate.test.js` |

### 1.7 Innovation and interaction

| Capability | Status | Evidence |
|---|---|---|
| Natural-language treasury operations with visible plan, tool calls and resulting actions | **Public** | Recording `evidence/sepolia/recordings/agentwallet-demo.mp4` (old UI) |
| Redesigned console: bento command deck, AI command center, risk meters, kill switches, live audit rail | **Local**, plus read-only public screenshots | `docs/ui-redesign/screenshots/` (section 6). Not yet in a recording |
| Explicit LOCAL SIMULATION vs PUBLIC TESTNET distinction | **Local** and read-only public | Banner, top-bar pill, per-transaction explorer chips vs "local chain · not public" |
| RL-based timing as a differentiator | **Local**, synthetic | See 1.2 |

### 1.8 Ambitious-idea potential

| Idea | Status |
|---|---|
| Policy-bounded rebalancing | **Partial**: contract primitive deployed, orchestration missing (section 3) |
| Others in section 3 | **Missing** |

---

## 2. Gap analysis, by judging impact

1. **Asset management is the weakest area.** Publicly the treasury is ETH only, with no valuation and no swap. The swap primitive is already deployed, but nothing uses it.
2. **The public recording shows the old UI.** The redesign is only in screenshots.
3. **The public contract is now emergency-stopped** (paused, agent revoked). Any new public demonstration needs owner transactions: unpause, set agent, possibly re-fund. That is a reason to decide carefully whether new public evidence is worth it.
4. **Audit integrity is off-chain only.** Judges can verify transactions but not the audit chain.
5. **Stale documentation contradicts current evidence.**
   - `docs/KNOWN_LIMITATIONS.md` still says "No real model was exercised", "Not browser-tested" and "Not deployed".
   - `docs/IMPLEMENTATION_STATUS.md` cites 30 contract tests and 18 component tests (now 35 and 24).
   - `docs/project-scope.md` names the superseded "Verdant Protocol" visual spec.
6. **Frontend dev-tooling vulnerabilities (R6, R8)** remain open.
7. **The public run used a test wallet bridge.** Real-MetaMask behaviour is local only. This is already disclosed honestly; it only needs to stay visible.

---

## 3. Ambitious features

### 3.1 Evaluation: autonomous policy-bounded treasury rebalancing

**Value.** High. It turns "asset management" from view-only into an active, bounded treasury. This is the area where AgentWallet is weakest.

**Differentiation.** Medium-high. "AI rebalancer" pitches are common. *Policy-bounded* rebalancing is less common: the contract fixes the router, slippage floor, deadline and caps, and the AI only proposes. That restraint is the selling point.

There are two very different variants.

| | **A1. AI-proposed, owner-approved rebalancing** | **A2. Fully autonomous rebalancing** |
|---|---|---|
| Contract | **No change, no redeploy.** `executeSwap` and `setSwapRouter` are in the deployed bytecode | **New contract version required.** The agent cannot call `executeSwap` (`onlyOwner`). Redeploy, new tests, new review |
| Who signs the swap | Owner, in the wallet (MetaMask or bridge) | Agent key, under a signed "rebalance grant" |
| Integrations | Uniswap V3 SwapRouter02 and QuoterV2 on Sepolia (addresses must be verified before use). Two ERC-20s with a pool (WETH plus a test stablecoin) | Same, plus an on-chain price reference (Chainlink on Sepolia, or a TWAP), so a compromised backend cannot set a bad `amountOutMinimum` |
| Backend work | Wire `assetManagementService` into routes; an agent tool `propose_rebalance` (drift → quote → minOut from a bounded slippage); risk checks (drift threshold, max swap per day, slippage ≤ configured bps); audit entries | Everything in A1, plus grant type, scheduler path, oracle check, MEV and sandwich considerations, failure handling |
| UI | Rebalance proposal card: drift, quote, minOut, router, deadline; "Sign swap" | Same, plus grant management |
| Tests | Local with a mock router (exists) plus a forked or Sepolia quote test; policy tests for slippage, deadline, caps and router allowlist; UI tests | All of A1, plus contract tests for the agent swap path, oracle deviation, replay, and a property test showing caps hold across transfer and swap |
| Safety within the timeline | **Safe.** It reuses audited-by-tests contract code; the owner stays in the loop | **Not safe to ship for this submission.** It adds new on-chain authority for the agent key over a price-sensitive operation, and needs a review it cannot get in time |
| Existing Sepolia evidence sufficient? | For the core challenge, yes. For rebalancing, no: no swap has happened publicly | No |
| New public transactions | About 7–9 owner transactions, each needing your explicit authorization. Gas on Sepolia was about 22 wei at the time of writing, so cost is negligible against the remaining ~0.06 SepETH. The transactions: wrap SepETH → WETH; transfer WETH to the contract; `setTokenPolicy` for WETH and the stablecoin; `setSwapRouter`; `unpause`; `executeSwap`; optionally `setAgent` to restore transfers. The test stablecoin must come from a faucet; the contract cannot wrap ETH itself | A fresh deployment plus all of the A1 setup |

**Main risks for A1:**
- Sepolia Uniswap pools are thin and their prices are arbitrary. The demo proves the mechanism and the enforcement, not price quality; say so on screen.
- Faucet availability for a test stablecoin.
- The deployed contract is paused, so `unpause` is required, and `setAgent` too if agent transfers should work again.

### 3.2 Alternatives, ranked

Scores: 1 is low and 5 is high. For security risk, 5 means the *lowest* risk.

| Rank | Feature | Innovation | Feasibility | Judge impact | Security risk | Dev time |
|---|---|---|---|---|---|---|
| 1 | **A1: AI-proposed, owner-approved rebalancing on the deployed contract** | 4 | 4 | 5 (closes the weakest area) | 4 | ~2–3 days, plus a public run if authorized |
| 2 | **Agentic pay-per-use (HTTP 402-style).** A local paid API answers `402 Payment Required`; the agent pays the allowlisted merchant through `executeTransfer` under a budget grant, then retries with the receipt | 5 (machine payments) | 4 (no contract change; reuses grants and caps) | 4 | 4 (merchant must be allowlisted; the budget is the grant) | ~2 days local; 1–2 public transactions to demonstrate |
| 3 | **On-chain audit anchoring plus behavioural guard.** Periodically commit the audit hash-chain head in a 0-value transaction or event, so judges can verify the log against the chain. Add deterministic anomaly rules: new-recipient cooling-off, velocity spike, off-hours. Each produces a plain-language risk explanation in the UI | 3 | 5 | 3–4 (strong "trust" story) | 5 | ~1–1.5 days; anchoring needs a small public transaction each time |

**Rejected for this timeline:**
- A2, full autonomy for swaps: see above.
- ERC-4337 session keys and multi-owner (2-of-N) approval: both need a contract redeploy and a new security review.

### 3.3 Recommendation and execution plan

**Recommendation.** Ship the current product as the mandatory core; it is complete and publicly evidenced. Then add **A1** as the single ambitious feature. If time remains, add **#3 (audit anchoring)** because it is cheap and strengthens trust. Do **not** build A2.

Nothing below has been implemented. Each phase needs your go-ahead; every public step needs your explicit authorization.

1. **Local (no public transactions).**
   - Wire `assetManagementService` (routes plus validation).
   - Add a `propose_rebalance` agent tool that cannot execute.
   - Add risk checks: drift ≥ threshold, slippage ≤ configured bps, per-day swap cap, router on the allowlist.
   - Add the rebalance proposal card and the owner "Sign swap" flow.
   - Tests: backend unit and route tests, the existing mock-router contract tests, a UI component test, and a Playwright flow on Hardhat with the mock router.
2. **Read-only Sepolia preparation (no transactions).**
   - Verify the SwapRouter02 and QuoterV2 addresses and pool existence over RPC.
   - Quote a WETH → stablecoin swap.
   - Write the transaction plan with gas estimates, as was done for the transfer run.
3. **Public run (only with your written authorization).**
   - The 7–9 owner transactions listed above, recorded with the same evidence pipeline (`collect-evidence`, explorer proof, manifest).
   - Afterwards, close the gate.
4. **Docs.** Evidence section, honest limits (testnet liquidity, owner-signed rather than autonomous).

---

## 4. Mandatory core vs optional bonus

The challenge brief text is not in this repository. This split is the team's **inference from the eight areas** and must be checked against the official rubric.

| Area | Inferred class | State |
|---|---|---|
| AI agent | Mandatory | Met, public |
| Autonomous on-chain execution | Mandatory | Met, public (one autonomous transfer) |
| Transaction execution | Mandatory | Met, public |
| Risk control | Mandatory | Met, public (caps, allowlist, pause, emergency stop; rejection off-chain) |
| Security and compliance | Mandatory (security) / partial (compliance) | Security met; compliance limited to the allowlist |
| Asset management | Mandatory in a "wallet" challenge | **Weakest area.** Balances, deposit and withdraw are public; swaps, multi-asset and valuation are local or partial |
| Innovation and interaction | Judged quality | Redesign done locally; NL agent public |
| Ambitious idea | Optional bonus | Not started; recommendation above |

---

## 5. Exact remaining work for submission

**Must do:**

1. **Review the UI redesign; you commit it** (files listed in section 6). Nothing is committed.
2. **You merge to `main`** and push. The current branch is `master`.
3. **Upload the git-ignored videos** (`evidence/sepolia/recordings/raw/*.webm`, `recordings/agentwallet-demo.mp4`) and link them from the README and the submission. SHA-256 values are in `MANIFEST.json`.
4. **Refresh stale docs:** `KNOWN_LIMITATIONS.md`, `IMPLEMENTATION_STATUS.md` (test counts, live LLM, browser tests, Sepolia deployment), and `project-scope.md` (visual spec). Add a README "Evidence" section pointing to `evidence/sepolia/RUN_NOTES.md` and this audit.
5. **Optional but recommended: a new walkthrough video of the redesigned UI** against the public contract in **read-only viewer mode**. It needs no transactions; `docs/ui-redesign/screenshots/public-sepolia/` was produced this way. It shows the new UI with real public data without touching the chain.
6. **Write the submission text:** problem, architecture, what is public vs local (this file's labels), honest limits.

**Should do:**

7. Fix or document the frontend dev-tooling advisories (R6, R8). Run `npm audit` again and record the result.
8. Decide on the ambitious feature (section 3.3).

**Must not do without explicit authorization:** broadcast, redeploy, open the deployment gate, commit or push.

---

## 6. UI redesign record

- **What changed:** frontend only, presentation only. No backend, contract, policy or transaction logic changed. All test-bound labels and selectors are preserved; the suites in the baseline table pass.
- **Design system:**
  - Dark frame with a rounded neutral canvas.
  - White and pastel bento cards (mint, lilac, butter, sky, blush), each with a deep same-hue ink for AA contrast.
  - Faculty Glyphic display headings at 44–76 px; Fustat body text; JetBrains Mono tabular numbers.
  - Pill navigation with tooltips, a single responsive nav, and restrained motion that honours `prefers-reduced-motion`.
- **Network distinction:**
  - Sky "PUBLIC TESTNET" pill and banner when the backend reports `isPublicNetwork`.
  - Hatched butter "LOCAL SIMULATION" pill and banner otherwise.
  - Each transaction shows either an explorer chip or "local chain · not public".
- **Overview (command deck), all from existing APIs:**
  - Contract treasury.
  - Four stat tiles: awaiting approvals, confirmed agent transfers, audit-chain validity, gas runway.
  - AI command center: model status, instruction box handed to the agent page via router state (not the URL), recent conversations.
  - Risk engine: daily-cap meters, per-tx cap, auto-approval, reserve floor, recent policy decisions.
  - Autonomous operations: task grants, scheduler tick.
  - Owner approvals: the full proposal cards.
  - Verified transactions and a kill-switch summary linking to emergency controls.
  - Live audit rail.
- **Fixes:**
  - Sub-gwei gas prices displayed as "0 gwei"; now shown in wei.
  - The gas runway is shown compactly.
- **Screenshots:**
  - `docs/ui-redesign/screenshots/local-simulation/`: every page, desktop 1440 and mobile 390. Real data from a local Hardhat chain with a stub LLM, seeded only through the API and EIP-712 signatures with Hardhat dev keys.
  - `docs/ui-redesign/screenshots/public-sepolia/`: Overview, Transactions and Controls on the deployed Sepolia contract. Taken read-only: executor disabled, no backend `.env` loaded, a throwaway unfunded **viewer** wallet, and a bridge that refuses every signing and sending method except the SIWE sign-in. No transaction was sent.
