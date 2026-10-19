# RELAY testing guide

How to validate RELAY (repository name: AgentWallet) **without risking funds and without changing the hosted
environment**. Every automated test below runs against an in-process or local Hardhat chain (chain 31337) and a
local embedded database. None of them touches Ethereum Sepolia, the hosted site, or a paid API, except the opt-in
suites that are clearly marked and skipped by default.

## Contents

1. [Test commands](#test-commands)
2. [Test results (2026-10-19)](#test-results-2026-10-19)
3. [Test inventory](#test-inventory)
   - [A. Smart-contract tests](#a-smart-contract-tests)
   - [B. Backend and policy tests](#b-backend-and-policy-tests)
   - [C. AI orchestration tests](#c-ai-orchestration-tests)
   - [D. Frontend and integration tests](#d-frontend-and-integration-tests)
   - [E. Evidence verification](#e-evidence-verification)
4. [Manual verification checklist for judges](#manual-verification-checklist-for-judges)
5. [What the tests do not prove](#what-the-tests-do-not-prove)

---

## Test commands

Install dependencies first (see [DEPLOYMENT_GUIDE.md §3](DEPLOYMENT_GUIDE.md#3-local-development)). All commands
run from the repository root and come from the root [`package.json`](../package.json).

| Group | Command | Runner | Needs |
|---|---|---|---|
| Smart contracts | `npm run test:contracts` | Hardhat + Mocha/Chai, in-process network | `contracts/` installed |
| Backend | `npm run test:backend` | Compiles contracts, then `node --test --test-concurrency=1 test/` | `contracts/` and `backend/` installed |
| Frontend components | `npm run test:frontend` | Vitest + Testing Library (jsdom) | `frontend/` installed |
| RL engine | `npm run test:rl` | Python `unittest` | Python 3 and `pip install -r rl-engine/requirements.txt` |
| End-to-end | `npm run test:e2e` | `node --test tests/e2e/`; starts a Hardhat node, deploys, starts the backend and RL engine | All of the above |
| Everything | `npm test` | The five suites above, in order | All of the above |

Browser tests (Playwright, Chromium) are separate and run from `frontend/`:

| Command | What it runs | Default |
|---|---|---|
| `npx playwright install chromium` | One-time browser download | — |
| `npm run test:browser --prefix frontend` | `tests/browser/*.spec.js` against a local stack, using a test-only EIP-1193 wallet bridge | Hosted and paid-AI specs skip themselves |
| `npm run test:metamask --prefix frontend` | Real MetaMask extension checklist | Manual setup required; see [METAMASK_DEMO.md](METAMASK_DEMO.md) |

Opt-in suites that are **skipped unless explicitly enabled**, because they cost money or touch a hosted service:

| Suite | Enable with | Why it is off |
|---|---|---|
| `backend/test/live/agent.live.test.js` | `LIVE_LLM=1` + a configured provider | Paid model API |
| `backend/test/treasury.postgres.test.js` | `AW_ISOLATED_PG_URL=postgresql://…` (a disposable database; never production) | Needs a real PostgreSQL server |
| `backend/test/live/treasury.live.test.js`, `treasury.sequence.live.test.js` | `LIVE_TREASURY_LLM=1` | Paid model API |
| `frontend/tests/browser/agent.live.spec.js`, `v2.showcase.live.spec.js` | `LIVE_LLM=1` | Paid model API |
| `frontend/tests/browser/judge.hosted.spec.js` | `JUDGE_BROWSER=1` | Reads the hosted site and Sepolia RPC |
| `frontend/tests/browser/judge.hosted.readonly.spec.js` | `QA_HOSTED_READONLY=1` + URLs | Reads the hosted site |
| `frontend/tests/browser/judge.live-hosted.spec.js` | Explicit approval flags | Hosted, uses paid AI |

## Test results (2026-10-19)

**Environment:** Windows 11 Home, Node.js 20.19.5, npm 10.8.2, Python 3.14.6, 8 GB RAM. Repository at `cd078f7`
(`origin/main`) plus documentation-only changes. `TEMP`/`TMP` pointed at a D: drive folder because C: was full.
Run between 07:21 and 07:49 UTC on 2026-10-19. No network access to Sepolia, the hosted site or a model API was used by
these suites.

| Suite | Command | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| Smart contracts | `npm run test:contracts` | **53** | 0 | 0 | |
| Backend | `npm run test:backend` | **233** | 0 | 2 | 235 tests in 35 suites. Skipped by design: the paid live-AI suites (`LIVE_LLM`, `LIVE_TREASURY_LLM`) and the real-PostgreSQL suite (`AW_ISOLATED_PG_URL`); see the opt-in table |
| Frontend components | `npx vitest run --pool=forks --poolOptions.forks.singleFork=true` (in `frontend/`) | **71** | 0 | 0 | 10 files. Run with one worker; see below |
| RL engine | `npm run test:rl` | **25** | 0 | 0 | |
| End-to-end | `npm run test:e2e` | **8** | 0 | 0 | Includes a real local agent transfer, an autonomous scheduled payment and RL inference |
| Browser (Playwright) | — | — | — | — | **Not run** on 2026-10-19 (memory limits on this machine); see FINAL_QA_VERIFICATION.md for the last recorded run |
| Live AI, hosted, real PostgreSQL | — | — | — | — | **Not run**: paid API, hosted services or a disposable PostgreSQL server required |

**Failed attempts, reported for completeness.** The final numbers above are from clean re-runs; nothing in the code
was changed between attempts.

1. First attempt (07:04–07:19 UTC): contracts passed 53/53. The backend suite failed 5 tests with
   `ENOSPC: no space left on device` because the C: drive had 0 bytes free and the tests write temporary databases to
   `%TEMP%`. The remaining suites could not write their logs. Re-run with `TEMP` on D:.
2. Second attempt (07:21–07:44 UTC): contracts, backend and RL passed. The frontend runner crashed with
   `FATAL ERROR: Committing semi space failed … JavaScript heap out of memory` at a 29 MB heap. That means Windows could
   not commit memory (about 1.6 GB of commit was free), not that a test failed. The e2e backend exited with
   `Fatal startup error: unreachable`, a PGlite WebAssembly trap under the same memory pressure (listed in
   [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md#environment)).
3. Retries: the frontend passed 71/71 with a single worker (07:44 UTC). e2e failed the same way at 07:45, then passed
   8/8 at 07:48 once about 2.5 GB of commit was free.

On a machine with normal free memory and disk, `npm test` is expected to run all five suites in one go; that was not
observed on this machine on 2026-10-19.

## Test inventory

IDs are assigned in this guide for reference. Counts are the number of `it(...)` / `test(...)` cases in each file.
The "Evidence" column refers to the 2026-10-19 run above unless stated otherwise.

### A. Smart-contract tests

Files: [`contracts/test/AgentWallet.test.js`](../contracts/test/AgentWallet.test.js) (v1 rules, still enforced by v2),
[`AgentWallet.v2.test.js`](../contracts/test/AgentWallet.v2.test.js) (on-chain owner authorization),
[`AgentWallet.swap.test.js`](../contracts/test/AgentWallet.swap.test.js) (owner-only swaps).
Type: unit / adversarial, Hardhat in-process network. Command: `npm run test:contracts`.

| ID | Scenario | Expected behavior | Test (file › case) |
|---|---|---|---|
| SC-01 | Valid authorized transfer | Allowlisted recipient receives ETH; `TransferExecuted` emitted | AgentWallet.test › "transfers to an allowlisted recipient and emits TransferExecuted" |
| SC-02 | Valid owner-signed transfer (v2) | Executes once with the owner's EIP-712 signature | v2 › "executes an approval at most once" |
| SC-03 | Invalid signature | Signatures by the agent, a stranger or zero are rejected (`InvalidOwnerSignature`) | v2 › "rejects approvals signed by the agent, a stranger, or the zero signature" |
| SC-04 | Tampered approval | Any field changed after signing is rejected | v2 › "rejects any field substituted after the owner signed" |
| SC-05 | Cross-chain / cross-contract replay | A signature for another chain or contract is rejected | v2 › "rejects a signature made for another chain or another wallet contract" |
| SC-06 | Replay attempt | Same intent cannot execute twice (`IntentAlreadyExecuted`) | AgentWallet.test › "rejects zero amount, zero intent and replayed intents"; v2 › "executes an approval at most once" |
| SC-07 | Expired approval | Signed deadline enforced on-chain, inclusive | v2 › "enforces the signed deadline on-chain (inclusive), never later" |
| SC-08 | Unauthorized caller | Only the agent can execute; only the owner can manage settings | AgentWallet.test › "only the owner can manage agent, recipients, policies, pause and withdrawals"; "the owner key cannot move funds through the agent path" |
| SC-09 | Recipient not allowlisted | Non-allowlisted, removed, zero or self recipients rejected | AgentWallet.test › "rejects non-allowlisted, removed, zero or self recipients" |
| SC-10 | Per-transaction limit | Exact boundary passes, one wei over fails | AgentWallet.test › "enforces the per-transaction cap at the exact boundary" |
| SC-11 | Daily spending limit | Cap enforced, resets on the next UTC day; randomized sequences never exceed it | AgentWallet.test › "enforces the daily cap and resets it on the next UTC day"; "keeps spend within the daily cap under a randomized sequence of attempts" |
| SC-12 | Grant exhaustion | Runs stop at `maxRuns` or `maxTotal` (`GrantExhausted`) | v2 › "runs a grant up to maxRuns…"; "enforces maxTotal when maxRuns is unused" |
| SC-13 | Grant revocation, expiry, tampering, unbounded grant | All refused | v2 › "refuses unbounded, expired, revoked, tampered and replayed grant runs" |
| SC-14 | Compromised agent key | Can do at most what the remaining grant allows, within caps | v2 › "a compromised agent can at most use what the grant still allows, within the caps" |
| SC-15 | Paused contract | Pause blocks agent transfers but not deposits or owner withdrawals | AgentWallet.test › "pause blocks agent transfers but not deposits or owner withdrawals" |
| SC-16 | Emergency stop | Pauses and revokes the agent atomically | AgentWallet.test › "emergencyStop pauses and revokes the agent atomically" |
| SC-17 | Ownership changes | Agent can never accept ownership; previous owner's approvals and grants are void | AgentWallet.test › "uses two-step ownership…"; v2 › "voids the previous owner's approvals…", "voids grants signed by a previous owner" |
| SC-18 | Re-entrancy | Malicious agent + recipient contract cannot re-enter | AgentWallet.test › "blocks re-entrancy from a malicious agent+recipient contract" |
| SC-19 | Owner cancels a signed intent | Only the owner can cancel an unexecuted intent | v2 › "lets only the owner cancel a signed, unexecuted intent" |
| SC-20 | Pre-signature simulation | `simulateTransfer` always reverts and never moves funds | v2 › "simulateTransfer exercises the real send but always reverts…" |
| SC-21 | Backend/contract digest compatibility; ERC-1271 owners | Digests match what the backend asks owners to sign | v2 › "computes exactly the digests the backend asks owners to sign"; "accepts an ERC-1271 smart-contract owner…" |
| SC-22 | ERC-20 handling | Token limits independent of ETH; non-standard tokens handled | AgentWallet.test › "ERC-20 transfers" group (6 cases) |
| SC-23 | Owner-only swaps (local only) | Router allowlist, slippage, expiry, replay and caps enforced | AgentWallet.swap.test (5 cases) |

### B. Backend and policy tests

Directory: [`backend/test/`](../backend/test/). Runner: `node --test`. Command: `npm run test:backend`.
Chains are local Hardhat; the database is embedded PGlite. One suite needs a real PostgreSQL server (BE-08).

| ID | Component | Scenario | Expected behavior | Type | Source |
|---|---|---|---|---|---|
| BE-01 | Policy engine | Transfer inside every limit; inclusive per-tx cap; daily cap counts on-chain spend + in-flight reservations | Pass / exact boundaries | Unit | `unit.policy.test.js` (17) |
| BE-02 | Policy engine | Reserve floor: balance must cover amount + reservations + floor | `BALANCE_AND_RESERVE` fails below the floor | Unit | `unit.policy.test.js` |
| BE-03 | Policy engine | Pause (off- and on-chain), disabled token, foreign agent, missing executor, gas cap | Fail closed with a named check | Unit | `unit.policy.test.js` |
| BE-04 | Network guards | Only 31337 / 84532 / 11155111; public Hardhat keys refused; public executor needs opt-in | Start-up refused otherwise | Unit | `unit.policy.test.js` |
| BE-05 | Treasury math | Overdue → priority → date ordering; combined payments never cross the reserve; no negative available | Deterministic plan | Unit | `treasury.math.test.js` (3) |
| BE-06 | Treasury | Plan pays A, defers B at the exact-wei reserve boundary; insufficient treasury defers and rejects | Fits / Defer | Integration | `treasury.scenario.test.js` (16) |
| BE-07 | Treasury | Owner-only writes, versioned edits, concurrent approvals cannot deplete the reserve, reserve change invalidates pending proposals, chain failure fails closed | No reserve breach | Integration | `treasury.integration.test.js` (16) |
| BE-08 | Treasury on real PostgreSQL | Row locks, two app instances, two executors, restarts, confirmations | No double spend, no duplicate nonce | Integration | `treasury.postgres.test.js` (11): **skipped unless `AW_ISOLATED_PG_URL` points at a disposable PostgreSQL database**; `treasury.persistence.test.js` (1) runs on PGlite |
| BE-09 | Execution | Approved transfer executes and is confirmed from the receipt; idempotency keys; concurrent approvals → one execution | Exactly-once | Integration | `api.execution.test.js` (12) |
| BE-10 | Execution | Recipient removed after creation, over-cap, expired, rejected proposals | Refused before signing | Integration | `api.execution.test.js` |
| BE-11 | Authorization failures | Unauthenticated writes, non-owner approval (even with own signature), malformed input, SIWE nonce reuse, CORS, safe errors | 401 / 403 / 400 with no side effects | Security | `api.security.test.js` (16) |
| BE-12 | Authorization at execution | Signed deadline passed while executor was down; DB-tampered approval or grant; grant expired or cancelled; previous owner | Never executed (fixes F1, F3) | Regression | `authorization.regression.test.js` (11) |
| BE-13 | Disabled execution | Judge mode pins the evidence contract with no signer; operator routes blocked; risk preview creates no proposal | No signing path | Integration | `judge.test.js` (15) |
| BE-14 | Disabled execution (demo) | Invalid invite, explore-only session, execution switch off, zero ceilings | Draft allowed, confirm refused | Integration | `demo.wallet.test.js` (15), `treasury.production-semantics.test.js` (5) |
| BE-15 | Demo admission | One-use invites, concurrency, rollback on failure, restart | Exactly one session | Integration | `demo.entry.test.js` (7) |
| BE-16 | Scheduler / bounded autonomy | Grant runs, escalation above the auto-approval limit, unauthorized intents, duplicate scheduler, crash recovery, circuit breaker | Exactly-once, escalate when unsure | Integration | `scheduler.test.js` (14) |
| BE-17 | Gas handling | UTC day-boundary guard; gas limit above cap refused | Nothing sent when unsafe | Regression | `gas.dayboundary.test.js` (3) |
| BE-18 | Persistence | Idempotent migrations, compare-and-set transitions, append-only hash-chained audit log detects tampering | Data integrity | Integration | `db.persistence.test.js` (7), `api.restart.test.js` (1) |
| BE-19 | Key handling | Encrypted keystore, wrong password fails start-up, one credential source only, no credential = executor disabled | Fail closed | Unit | `unit.signer.test.js` (4), `config.profile.test.js` (2) |
| BE-20 | Indexer | Respects the RPC block-range limit | All events indexed | Integration | `indexer.range.test.js` (3) |
| BE-21 | Public-run tooling | Role separation, budgets, frozen targets, deploy gate reset, evidence collector | Refuses unsafe runs | Integration (local rehearsal) | `base-sepolia.run.test.js` (11), `deploy.gate.test.js` (3), `evidence.collector.test.js` (4) |
| BE-22 | Asset management (not wired to the UI) | Swap preparation and bounds | Rejects invalid input | Integration | `assetManagement.test.js` (4) |

Invalid request handling is covered throughout: strict zod schemas reject client-supplied wallet state, malformed
amounts and addresses (BE-11), and unknown or malformed tool input (C below).

### C. AI orchestration tests

These tests use a **scripted or stubbed model** (`backend/test/helpers/scriptedLlm.js`, `stubOpenAi.js`), so they
test RELAY's handling of model output, not the model's quality. **They do not show that a real model's answers are
correct.** Real-model checks are in the opt-in live suites; their recorded results are in
[LIVE_LLM_VERIFICATION.md](LIVE_LLM_VERIFICATION.md).

| ID | Scenario | Expected behavior | Source |
|---|---|---|---|
| AI-01 | Tool sequencing: "send 0.005 ETH to my approved supplier" | Allowlist lookup → plan → proposal → owner approval → confirmed transfer | `agent.chat.test.js` |
| AI-02 | Schema validation | Provider receives strict tool schemas; malformed tool input has no side effects | `agent.chat.test.js`, `llm.providers.test.js` |
| AI-03 | Plan-first rule | Action tools before `record_plan` are refused and reported as not applied | `agent.chat.test.js`, `treasury.production-semantics.test.js` |
| AI-04 | Policy boundary: invented recipient | Non-allowlisted recipient rejected by trusted code; no proposal | `agent.chat.test.js` |
| AI-05 | Prompt injection | Instructions inside a recipient label or obligation description cannot redirect funds or invoke overrides | `agent.chat.test.js`, `treasury.integration.test.js` |
| AI-06 | Clarification | Missing parameters → question instead of a guess; a clarification blocks every action in the batch | `agent.chat.test.js` |
| AI-07 | Scope limits | Agent can tighten policy or stop automation, never loosen; demo and public assistants cannot reach tools outside their allowlist | `agent.chat.test.js`, `demo.wallet.test.js`, `judge.test.js` |
| AI-08 | Model-supplied amount override | Rejected by the treasury tool schema | `treasury.integration.test.js` |
| AI-09 | AI claims to have paid | Changes nothing; only a confirmed receipt marks payment | `treasury.scenario.test.js` |
| AI-10 | Error handling | Refusal, truncation, malformed/duplicate/contradictory tool calls, HTTP errors, timeouts, invalid JSON fail closed without leaking credentials | `llm.providers.test.js` (6), `agent.chat.test.js` |
| AI-11 | Budgets | Per-session and shared daily AI quotas; concurrency and failure never unlock execution | `demo.wallet.test.js`, `judge.test.js` |

### D. Frontend and integration tests

**Component tests** (Vitest, jsdom; `npm run test:frontend`), in [`frontend/tests/`](../frontend/tests/):

| ID | Area | Scenario | Source |
|---|---|---|---|
| FE-01 | Signing | Signs the exact backend typed data with a stable Idempotency-Key; refuses on the wrong network | `criticalFlows.test.jsx` (13) |
| FE-02 | Honest status | Never shows success for a hash without a receipt; local receipts labelled SIMULATED | `criticalFlows.test.jsx`, `consumerUx.test.jsx` (10) |
| FE-03 | Roles | Viewers cannot approve; admin controls hidden when the server denies admin | `criticalFlows.test.jsx`, `adminStabilization.test.jsx` (4) |
| FE-04 | Demo entry | Exactly one session request under StrictMode and double clicks; forged or expired stored sessions refused | `demoEntry.test.jsx` (8), `judgeEntry.test.jsx` (4) |
| FE-05 | Treasury UI | Real amounts, reserve-lowering second confirmation, guests cannot edit, preparation never executes | `treasuryManager.test.jsx` (10) |
| FE-06 | v2 authorization UI | On-chain grant revocation, signed deadline shown and never extended | `v2Authorization.test.jsx` (8) |
| FE-07 | Automation and agent UI | Grant signing, stop-all, loosening confirmation, honest "AI unavailable" | `phase2Flows.test.jsx` (6) |
| FE-08 | Wallet errors | MetaMask error shapes (-32002, nested 4902, "could not coalesce") | `metamaskCompat.test.jsx` (5) |
| FE-09 | Cold start | Bounded retries of reads only; no retry of quota, auth or validation failures | `coldStart.test.js` (3) |

**Browser tests** (Playwright, `frontend/tests/browser/`, local stack, test-only wallet bridge): `wallet.spec.js`
(4 flows: SIWE, approve/reject, mined transfer, pause/unpause, grants, v2 revocation) and
`judge.treasury.local.spec.js` (3 flows: invites, full local judge journey, explore mode). **Not re-run on 2026-10-19**;
the last recorded result is in [FINAL_QA_VERIFICATION.md](FINAL_QA_VERIFICATION.md).

**End-to-end** ([`tests/e2e/local-chain.e2e.test.js`](../tests/e2e/local-chain.e2e.test.js), 8 cases): health, SIWE owner
role, proposal → EIP-712 approval → executor → verified receipt, indexed history, RL inference, an autonomous
scheduled payment, portfolio valuation, restart persistence with audit-chain verification.

**RL engine** (`rl-engine/tests/`, 25 cases): environment, model registry, API and a historical-fee replay.

### E. Evidence verification

You can check the historical Sepolia transactions yourself without any key or account.

1. **On Etherscan.** Open a link from [README › Real on-chain transaction evidence](../README.md#11-real-on-chain-transaction-evidence), for example the
   [owner-approved transfer](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e)
   and the [autonomous transfer](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e). Check:
   - **Status:** Success.
   - **To:** the contract `0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`.
   - **From:** the agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` (transfers) or the owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` (admin actions).
   - **Logs:** `TransferExecuted` (and `GrantRunExecuted` for the autonomous run).
   - **Contract page:** final state paused, agent `0x0`, balance 0.
2. **With the repository's verifier (all 38 recorded hashes).** Read-only; uses public RPCs and no keys. Run from the
   repository root after `npm ci --prefix backend`:

   ```bash
   node scripts/verify/verify-receipts.cjs
   ```

   It re-fetches every hash in [`evidence/reverification-2026-10-19/verified-receipts.json`](../evidence/reverification-2026-10-19/verified-receipts.json),
   compares status and block with the recorded values, checks a second RPC, and reads the evidence contract's current
   state. Result on 2026-10-19: 38/38 match. Pass `--rpc URL --rpc2 URL` if a public endpoint rate-limits.
3. **Recorded v2 checks.** [`evidence/sepolia-v2-full/public-verify.json`](../evidence/sepolia-v2-full/public-verify.json)
   holds 26 read-only checks (including negative probes) from public chain data, and `MANIFEST.json` holds SHA-256 hashes of
   every evidence file.
4. **Direct RPC check.** Any Sepolia endpoint works:

   ```bash
   curl -s -X POST -H 'content-type: application/json' \
     --data '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e"]}' \
     https://sepolia.drpc.org
   ```

   `"status":"0x1"` means success.

`verify-owner-approval.mjs` and `verify-audit-chain.mjs` need the team's run database (`backend/data/`), which is not in
Git, so judges cannot run them from a fresh clone.

## Manual verification checklist for judges

Use the hosted site read-only. **Do not attempt payments: hosted execution is disabled, and no step below needs it.**

| # | What to inspect | Where | What you should see |
|---|---|---|---|
| 1 | Public evidence dashboard | <https://agentwallet-judge.vercel.app/evidence> | Live read of contract `0x3C93…582F`: paused, agent revoked, balance 0, current block. The first load after idle can take about a minute. |
| 2 | Receipts | `/evidence/receipts` | 12 historical v2 transactions, each linking to Etherscan |
| 3 | Policy engine without a wallet | `/evidence/ai` → *Read-only transfer assessment* | The form is pre-filled with 0.0001 ETH to the evidence recipient. *Assess transfer risk* lists each named policy check and why execution is blocked. Creates no proposal, signature or transaction |
| 4 | AI assistant (optional) | `/evidence/ai` → *AI evidence assistant* | Real `gpt-4.1-mini` answer using read-only tools. Rate-limited (3 per IP per hour, shared daily quota) |
| 5 | Dashboard | `/` → enter the demo wallet (explore) | Balance, contract-enforced limits, emergency-control state, execution-disabled notice |
| 6 | Treasury interface | `/treasury` | Balance, protected reserve, spendable funds, plan and forecast |
| 7 | Proposals | `/proposals` | Proposal cards with their policy checks and an authorization label |
| 8 | Audit history | `/audit` | "Chain valid" with the number of hash-linked entries |
| 9 | Execution evidence | [evidence/sepolia-v2-full/EVIDENCE.md](../evidence/sepolia-v2-full/EVIDENCE.md) | The AI tool log behind each on-chain transfer |
| 10 | Etherscan receipts | Section E above | Status Success, correct contract, sender and events |

<p align="center">
  <img src="assets/screenshots/evidence-ai.png" alt="The public AI and risk analysis page with the read-only transfer assessment form and the gpt-4.1-mini evidence assistant" width="820"><br>
  <em>Checklist items 3 and 4: the wallet-free assessment form and the read-only AI assistant on the live site (captured 2026-10-19).</em>
</p>

For a full hands-on run, including signing and executing transfers, use the local stack
([DEPLOYMENT_GUIDE.md §3](DEPLOYMENT_GUIDE.md#3-local-development)); it uses free local test ETH only.

## What the tests do not prove

- **Model quality.** Automated AI tests use scripted models. Real-model behaviour was sampled (19 live cases, see
  [LIVE_LLM_VERIFICATION.md](LIVE_LLM_VERIFICATION.md)) but is not guaranteed.
- **Mainnet behaviour.** Everything is local or Sepolia.
- **Hosted behaviour today.** Local suites do not exercise Render, Neon or Vercel. The hosted state was checked
  separately by read-only requests ([PRODUCTION_SAFETY_STATUS.md](PRODUCTION_SAFETY_STATUS.md)).
- **Docker.** The Compose stack has never been built.
- **Security audit.** Passing tests are not an audit; see [SECURITY_SELF_ASSESSMENT.md](SECURITY_SELF_ASSESSMENT.md).
