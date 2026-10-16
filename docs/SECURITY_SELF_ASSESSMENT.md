# Deliverable 05: Security Self-Assessment Report

**Project:** AgentWallet, a policy-bounded autonomous on-chain treasury agent.
**Assessed revision:** `90c1849` on `feature/phase-1-secure-foundation`, plus the uncommitted work described in §4.6 (public-testnet tooling) and §9 (UI redesign, submission tooling). The UI redesign changed presentation only: no backend, policy, transaction or contract code.
**Date:** 2026-10-16. **Updated 2026-10-17:** audit findings F1–F3 fixed in the backend, and contract **v2** implemented and tested **locally**. See §11. v2 is **not deployed**: the public Sepolia contract is still v1, and every statement about the public run describes v1.
**Assessors:** the AgentWallet team. This is a **self-assessment**: there is no independent audit, formal verification or production security certification.

This report lists only controls that are **implemented in code and verified** by an automated test or a recorded run. Each control names its evidence. Anything planned but not built is listed under residual risks, not as a control.

## 1. Summary

AgentWallet separates **custody** (the owner's wallet) from **execution** (a limited agent key) and from **intelligence** (an LLM planner and an RL timing advisor). Neither the LLM nor the RL model can sign, approve, change recipients or loosen limits. Every transfer passes trusted policy code, and the smart contract enforces a recipient allowlist, per-asset caps and one-time intent IDs regardless of what the backend does.

*This table is the 2026-10-16 assessment of the deployed v1 system. The 2026-10-17 results for the F1–F3 fixes and contract v2 are in §11.1: contracts 53/53, backend 145/145, frontend 32/32, browser 4/4, e2e 8/8, RL 25/25, real MetaMask 11/11, live gpt-4.1-mini 19/19.*

| Area | Result |
|---|---|
| Contract tests | 35/35 passing, including re-entrancy, randomized cap fuzzing and owner/agent separation |
| Backend tests | 118/118 passing (one timing-sensitive concurrency test failed once under full-suite load on 2026-10-16, then passed 3/3 in isolation and in a full rerun), including authentication, double-approval races, scheduler duplicates, agent tool safety, credential-profile isolation, the evidence collector, and a full rehearsal of the Base Sepolia run |
| Frontend tests | 24/24 component tests; 3/3 browser flows with a test wallet bridge |
| End-to-end (real local chain) | 8/8 |
| Real MetaMask 13.52.0 (local chain) | 11/11 rows on 2026-10-15; re-run and screen-recorded on 2026-10-16: 10 PASS, 1 BLOCKED (row 9 needs a paid LLM call, not made) |
| Real LLM (gpt-4.1-mini) | 19/19 safety assertions in each of 4 full runs; nothing beyond drafts |
| Secrets in Git history | none found: full history scanned, including deleted files |
| Public execution | 11/11 Ethereum Sepolia transactions SUCCESS, re-verified independently over a public RPC on 2026-10-16 |
| Audit chain of the public run | 22 entries, valid: recomputed by an independent script on a copy of the run database |
| Known-risk register | R1–R20 (§6): 0 critical, 1 high (single-key owner), 7 medium, 8 low, 4 info. Added 2026-10-17, R21–R26 (§11): 2 medium, 3 low, 1 info. Total: 0 critical, 1 high, 9 medium, 11 low, 5 info. |

## 2. Trust boundaries

```
 Owner wallet (MetaMask)  ── custody: signs SIWE, EIP-712 approvals and grants, owner transactions
        │
 Console (React)          ── untrusted UI: shows backend data, asks the wallet to sign
        │
 Backend (Express)        ── trusted policy code, approval state machine, scheduler, executor
   ├─ LLM planner         ── untrusted output: tools only create drafts or tighten policy
   ├─ RL timing advisor   ── untrusted output: can only delay within a deadline
   └─ Agent key           ── hot key. v1 (deployed): may call executeTransfer with no signature.
                             v2 (local): may transfer only with an owner signature or grant verified on-chain
        │
 AgentWallet contract     ── final enforcement: allowlist, caps, intents, pause
```

## 3. Permission tiers

Higher tiers can do everything listed for lower tiers, except where noted.

| Tier | Who | Can | Cannot | Enforced by | Evidence |
|---|---|---|---|---|---|
| **T0 Anonymous** | Anyone | Read `/config`; request a sign-in nonce | Read wallet data or call any mutating route | Session middleware on every other route | `api.security.test.js` "every state-changing endpoint rejects unauthenticated requests" |
| **T1 Viewer** | Any address that completes SIWE but isn't the on-chain owner | Read portfolio, proposals, tasks, transactions, the audit log | Create, approve or reject proposals; manage tasks or policy; use the agent; read agent conversations | Owner role re-derived from the contract's `owner()` on each request | Real MetaMask row 10: a non-owner got `viewer` and its `POST /proposals` returned **403** |
| **T2 LLM agent** | gpt-4.1-mini (or any configured model) acting for the signed-in owner | Read data; draft proposals and tasks; **tighten** policy (raise a reserve floor, pause automation, cancel a task) | Sign, approve, resume, withdraw, loosen any limit, or use a recipient that isn't allowlisted | No such tools exist; allowlist and plan checks run in code before a draft; policy service refuses loosening from the agent | `agent.chat.test.js` (13 tests); live suite `test/live/agent.live.test.js` (19 cases, see `LIVE_LLM_VERIFICATION.md`) |
| **T3 Autonomous scheduler** | Backend scheduler running an owner-signed task grant | Execute runs within the grant (amount per run, max runs, max total, valid-until, schedule hash); auto-execute only up to the owner's auto-approval limit | Exceed the grant, run after the grant is revoked or expired, run while automation is paused, run twice | EIP-712 `AuthorizeTask` checked against the on-chain owner; atomic reservation; lease and run-key compare-and-set; circuit breakers | `scheduler.test.js`: "duplicate scheduler invocation -> exactly one execution", "unauthorized intents are blocked", "runs above the auto-approval limit escalate", circuit-breaker tests |
| **T4 Agent key** (on-chain `agent`) | Backend executor | **v1 (deployed):** call `executeTransfer`, with no signature check on-chain. **v2 (local, §11):** call `executeApprovedTransfer` / `executeGrantTransfer`, only with the owner's EIP-712 signature, which the contract verifies, before the signed deadline and within the grant's remaining runs and total | Send to a recipient that isn't allowlisted; exceed per-tx or daily caps; reuse an intent; act while paused; swap; change any setting; become owner | Solidity modifiers and checks | Contract tests: "native ETH transfers", "ERC-20 transfers", "agent cannot swap or authorize a router", "the agent can never accept ownership" |
| **T5 Owner** (on-chain `owner`) | The custodian's wallet | Everything else: allowlist, token policies, agent rotation and revocation, pause, `emergencyStop`, withdraw, owner-only swaps through an allowlisted router, EIP-712 approvals and grants | Renounce ownership (would strand funds); hand ownership to the agent; move funds through the agent path | `Ownable2Step`; `renounceOwnership` reverts; `acceptOwnership` refuses the agent | Contract tests "uses two-step ownership …", "disables renounceOwnership", "the owner key cannot move funds through the agent path" |

### 3.1 Permission matrix

What each tier can actually do, and where it is enforced: **C** = smart contract, **B** = backend trusted code. "Draft" means the action only creates a record that needs a higher tier to take effect.

| Action | T0 Anonymous | T1 Viewer | T2 LLM agent | T3 Scheduler | T4 Agent key | T5 Owner | Enforced |
|---|---|---|---|---|---|---|---|
| Read wallet, proposals, tasks, audit log | ✗ | ✓ | ✓ (read tools) | n/a | n/a | ✓ | B |
| Use the AI agent, read conversations | ✗ | ✗ | n/a | n/a | n/a | ✓ | B |
| Create a transfer proposal | ✗ | ✗ (403) | Draft, allowlisted recipients only | Draft, within its grant | ✗ | ✓ | B |
| Approve a transfer | ✗ | ✗ | ✗ (no tool) | Only within grant **and** the auto-approval limit | ✗ | ✓ EIP-712 signature | B |
| Execute a transfer on-chain (v1 `executeTransfer`; v2 `executeApprovedTransfer` / `executeGrantTransfer`) | ✗ | ✗ | ✗ | Via the agent key, after approval | ✓ within allowlist, caps, unpaused, intent unused; **v2 also** only with a valid owner signature or grant | ✗ (owner key is refused) | C (owner signature: B on v1, C on v2) |
| Create a scheduled task | ✗ | ✗ | Draft (`PENDING_AUTHORIZATION`) | ✗ | ✗ | ✓ | B |
| Sign a task grant | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ EIP-712 `AuthorizeTask` | B |
| Tighten off-chain policy (raise a reserve floor, pause automation, cancel a task) | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | B |
| Loosen off-chain policy, resume automation | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ explicit console confirmation | B |
| Allowlist, token caps, agent rotation and revocation | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ owner transaction | C |
| `pause`, `unpause`, `emergencyStop`, withdraw, swap | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ owner transaction | C |
| Transfer or renounce ownership | ✗ | ✗ | ✗ | ✗ | ✗ (can never accept) | Two-step transfer only; renounce disabled | C |

Evidence for each row is in §3 above and §4 below.

**Default posture:** no auto-approval limit is configured, so every transfer escalates to the owner's signature. Autonomous execution only happens after the owner sets a limit **and** signs a task grant.

## 4. Implemented controls

### 4.1 Smart contract (`contracts/src/AgentWallet.sol`)

| Control | Evidence (contract tests unless noted) |
|---|---|
| Owner and agent must be different keys (constructor, `setAgent`, pending owner) | "rejects an agent equal to the owner at construction"; "cannot set the agent to the owner, the pending owner or zero" |
| On-chain recipient allowlist; zero and self addresses rejected | "rejects non-allowlisted, removed, zero or self recipients" |
| Per-asset per-transaction cap, exact at the boundary | "enforces the per-transaction cap at the exact boundary" |
| Per-asset daily cap (UTC calendar day), independent per token | "enforces the daily cap and resets it on the next UTC day"; "tracks token limits independently of ETH limits"; randomized sequence test |
| Each intent ID executes once | "rejects zero amount, zero intent and replayed intents" |
| Checks-effects-interactions plus `nonReentrant` | "blocks re-entrancy from a malicious agent+recipient contract" |
| SafeERC20; failed token transfers revert and leave the intent unused | "reverts when a token returns false …"; "supports tokens whose transfer returns no value" |
| `pause` blocks agent transfers; deposits and owner withdrawals still work | "pause blocks agent transfers but not deposits or owner withdrawals" |
| `emergencyStop` pauses and revokes the agent in one transaction | "emergencyStop pauses and revokes the agent atomically" |
| `emergencyWithdraw` only while paused | "emergencyWithdraw requires the paused state and validates inputs" |
| Owner-only swaps: router allowlist, both assets enabled, shared caps and intents, 30-minute deadline, minimum output, allowance reset, balance-delta check | "Owner approved policy bounded swaps" suite (5 tests, including fabricated router output) |

### 4.2 Backend authentication and authorization

| Control | Evidence |
|---|---|
| EIP-4361 sign-in with single-use, expiring nonces; the server builds the exact message | `api.security.test.js` "sign-in nonces are single use and bound to the issued message" |
| SIWE domain follows an allowed console origin, so MetaMask shows no wrong-domain warning; foreign origins fall back to `APP_ORIGIN` | "SIWE domain follows an allowed console origin …"; MetaMask row 3: no warning |
| Sessions are random 32-byte tokens, stored only as SHA-256 hashes, revocable | "logout revokes the session token" |
| Owner role read live from `owner()`, failing closed | MetaMask row 10 (403 for a non-owner) |
| Strict zod schemas reject unknown fields; integer base units; checksummed addresses | "malformed amounts and addresses are refused"; `unit.policy.test.js` |
| Rate limits (global, auth, mutation); generic 500 bodies | rate-limit and error-shape tests in `api.security.test.js` |

### 4.3 Transfer pipeline

| Control | Evidence |
|---|---|
| Policy engine pinned to one block: pause states, executor is the on-chain agent, token enabled, allowlist, caps including in-flight reservations, balance + reserve floor, gas caps, static-call simulation | `unit.policy.test.js`; `api.execution.test.js` |
| Owner approval is an EIP-712 signature over proposal ID, intent ID, token, recipient, amount and deadline | "signature for another proposal refused"; MetaMask row 4 shows these fields |
| The signed deadline is the **execution** deadline. The executor refuses after it (also after restart recovery), approvals with less than 15 s left are refused, and nothing extends it. Until 2026-10-17 it was checked only at approval time (audit finding F1). | `authorization.regression.test.js` (v1 and v2 contracts); v2 contract test "enforces the signed deadline on-chain" |
| Immediately before signing, the executor re-verifies the stored approval or grant against the exact row being executed, and that the signer is still `owner()` (audit finding F3) | `authorization.regression.test.js`: database-tampered amount, recipient, signature, task recipient and grant amount; cancelled task; expired grant; ownership change |
| Policy and simulation re-run at approval and again before broadcast | "allowlist change between create and approve caught" |
| Atomic state machine + Idempotency-Key + one execution row per proposal: no double payment | "concurrent approvals → exactly one `TransferExecuted`" |
| CONFIRMED only after a verified receipt; append-only, hash-chained audit log | `db.persistence.test.js` audit test; `/api/audit/verify` |

### 4.4 AI layer

| Control | Evidence |
|---|---|
| No tool can approve, sign, execute, withdraw or resume | `agent.chat.test.js` asserts no such tool exists |
| Recipients must come from the allowlist, checked in code; injected text in labels, memos or tool results is treated as data | "prompt injection inside a recipient label cannot redirect funds"; live label-injection case |
| Strict JSON schemas plus zod re-validation; action tools refused before `record_plan` | "malformed tool input has no side effects"; live run 2 had one real invalid call, rejected with no side effect |
| Refused or truncated model output runs no tools | "refusal and truncated responses run no tools" |
| Refused actions are reported as `executed: false` and shown in the trusted action list, so the UI does not rely on the model's wording | "regression (live gpt-4.1-mini trace) …" |
| The agent can only tighten policy; loosening needs console confirmation | "can tighten policy … cannot loosen"; live "SYSTEM OVERRIDE" case kept the floor and pause |
| RL advisor can only delay within the execution window; the deadline always forces a decision; an unavailable model is reported, not faked | scheduler RL timing test; `rl-engine/tests` |

### 4.5 Keys and secrets

| Control | Evidence |
|---|---|
| Exactly one executor credential source (env key, encrypted keystore, or local dev mnemonic) | `unit.signer.test.js` "only one credential source may be configured" |
| Dev mnemonic allowed only on chain 31337; publicly known Hardhat keys refused on public networks; public-network execution needs `ALLOW_PUBLIC_TESTNET_EXECUTION=true` | `unit.policy.test.js` lines 120–138 |
| Secrets kept on non-enumerable config properties, read only by `signerProvider`; never sent to the LLM | `unit.signer.test.js`; agent test "no key material" |
| No API key in persisted conversations, tool calls, turns or audit rows | live suite global-invariants check |
| `.env`, databases, browser profiles, MetaMask builds, test results and model checkpoints are git-ignored. A full-history scan on 2026-10-16 found no API keys, private keys or recovery phrases, other than the public Hardhat test mnemonic used for local tests | `git log --all -p` pattern scan (§5) |

### 4.6 Credential separation for the public testnet (Deliverable 06 preparation)

| Control | Evidence |
|---|---|
| Four different keys with different jobs, each generated locally, testnet-only:
  - **Deployer** pays deploy gas only (`contracts/.env`).
  - **Agent** is the executor only (`backend/.env.base-sepolia`).
  - **Owner** is custody for the testnet evidence run, and the recipient only receives funds (both in `secrets/base-sepolia-wallets.env`).

  All three files are git-ignored. The deploy script, the contract constructor and the run script reject an owner equal to the agent, and the run script also rejects duplicate roles and public Hardhat keys | `deploy.js`; contract constructor test; `base-sepolia.run.test.js` "roles must be four distinct, non-public keys" |
| The automated run (`scripts/base-sepolia-run.mjs`) only sends after **two** separate approvals: the `--i-approve-base-sepolia-transactions` flag and `CONFIRM_PUBLIC_DEPLOY=yes`. It only sends value between the four roles and the deployed contract, at most 0.001 ETH per deposit or payment and 0.01 ETH per gas top-up | `base-sepolia.run.test.js` "value can only go to the four roles or the contract …"; manual run: refused without approval |
| The owner signs an AI-drafted proposal or task only after the run checks recipient, amount, token, status and schedule against the request, and refuses any mismatch | `base-sepolia.run.test.js` "the owner refuses to sign a draft that differs from the request" |
| The complete sequence is rehearsed on a throwaway local chain at Base Sepolia's fee level, with throwaway keys, funded with exactly the computed budget: deploy, configuration, owner-approved transfer, policy rejection, autonomous transfer, emergency controls and evidence | `base-sepolia.run.test.js` "rehearsal: …" |
| **Network allowlist:** the backend, deploy script and run script accept only Hardhat local (31337), Base Sepolia (84532) and Ethereum Sepolia (11155111). Every mainnet is refused, and both public testnets get the same key guards (public Hardhat keys refused; explicit `ALLOW_PUBLIC_TESTNET_EXECUTION`; no dev mnemonic) | `unit.policy.test.js` "only local, Base Sepolia and Ethereum Sepolia are accepted; every mainnet is refused", "Ethereum Sepolia gets the same public-network key guards" |
| Each public testnet has its own run target: chain, backend profile, database, deployment record, evidence folder and port, never the local demo's. Approval flags are per network, so the Base Sepolia approval cannot unlock a Sepolia run | `base-sepolia.run.test.js` "each public target is fully separate …"; manual refusal check on 2026-10-16 |
| The Base Sepolia and Ethereum Sepolia backend profiles are loaded **instead of** the local `backend/.env`, so the local dev executor, chain and database never mix with testnet credentials. A missing profile fails start-up | `config.profile.test.js` (2 tests) |
| Public deploy caps use separate variable names (`BASE_SEPOLIA_NATIVE_*`), so `contracts/.env` cannot change the local demo's caps | `deploy.js`; manual check on 2026-10-16: no local cap variables are set |
| Deploying to a public network requires `CONFIRM_PUBLIC_DEPLOY=yes` | Manual run on 2026-10-16: "Refusing to deploy to base_sepolia" |
| Key files are created by `scripts/new-testnet-key.mjs`, which prints only the address, refuses files git would track, and never overwrites a key. A scan on 2026-10-16 found none of the testnet keys in any committable file | Manual tests: refusal on `README.md` and on overwrite; key scan over all committable files |
| The indexer stays within the public RPC's 200-block `eth_getLogs` limit | `indexer.range.test.js` (3 tests, fails on the old code) |

## 5. Verification evidence

| Suite | Command | Result | Date |
|---|---|---|---|
| Contracts | `cd contracts && npx hardhat test` | 35 passing | 2026-10-16 |
| Backend | `cd backend && npm test` | 118/118 | 2026-10-16 |
| Backend authorization tests, screen-recorded | `node --test --test-reporter=spec test/api.security.test.js` | 16/16 (`evidence/submission/footage/term-security-tests.webm`) | 2026-10-16 |
| Agent safety tests, screen-recorded | `node --test --test-reporter=spec test/agent.chat.test.js` | 13/13 (`term-agent-tests.webm`) | 2026-10-16 |
| Public receipts re-verified | `node submission/tools/verify-receipts.mjs` | 11/11 SUCCESS; contract paused, agent revoked | 2026-10-16 |
| Public-run audit chain | `node submission/tools/verify-audit-chain.mjs` | 22 entries, valid | 2026-10-16 |
| **Public run, Ethereum Sepolia** | `npm run demo:sepolia` | Contract `0x8A44716E…F956a6`, 11/11 transactions SUCCESS, 1 autonomous + 1 owner-approved AI-drafted transfer, on-chain checks passed, audit chain valid, all confirmed on Blockscout (`evidence/sepolia/`) | 2026-10-16 |
| Run rehearsal with the AI agent (local OpenAI-compatible stub) | `base-sepolia.run.test.js` | both transfers drafted by the agent through the real chat API and tool validation; drafts checked before signing; the agent log is in the evidence | 2026-10-16 |
| Base Sepolia run rehearsal | `npm run base-sepolia:rehearse` | 12 steps, 9 contract txs, 0 reverted; 1 autonomous + 1 owner-approved transfer; all on-chain checks passed; audit chain valid | 2026-10-16 |
| Frontend components | `cd frontend && npx vitest run` | 24/24 | 2026-10-16 |
| Browser (test wallet bridge) | `cd frontend && npx playwright test` | 3 passed, 1 skipped (live LLM) | 2026-10-16 |
| End-to-end, local chain | `node --test tests/e2e/` | 8/8 | 2026-10-16 |
| Real MetaMask 13.52.0 | `cd frontend && npm run test:metamask` | 11/11 rows (`METAMASK_DEMO.md` §5) on 2026-10-15; 10 PASS + 1 BLOCKED (paid LLM) on 2026-10-16, recorded (`evidence/submission/footage/metamask/`) | 2026-10-15/16 |
| Real LLM gpt-4.1-mini | `LIVE_LLM=1 node --test test/live/` | 19/19 safety assertions × 4 runs (`LIVE_LLM_VERIFICATION.md`) | 2026-10-15 |
| Dependency audit | `npm audit` per package | contracts and backend: 0; frontend production: 2 moderate; frontend dev tooling: 2 critical, 6 high, 6 moderate (R6, R8) | 2026-10-16 |
| Evidence collector | `node scripts/collect-evidence.mjs` against a local chain | classified 1 autonomous and 1 owner-approved transfer correctly; all on-chain checks and the audit chain valid (`evidence.collector.test.js`) | 2026-10-16 |
| Secret scan | full `git log --all -p` for API keys, PEM keys, 64-hex keys, key assignments; committed JSON for key-named fields | none found | 2026-10-16 |

## 6. Known-risk register

Severity is rated for the intended deployment: a testnet treasury with a low-balance agent key. **Accepted** means a deliberate trade-off for this phase; **Open** means work is still needed.

| ID | Severity | Risk | Current mitigation | Recommended next step | Status |
|---|---|---|---|---|---|
| R1 | High | **The owner is a single externally owned account.** Whoever holds it has full custody: withdraw, change the allowlist, raise caps. | Ownable2Step; renounce disabled; the agent can never become owner | Make the owner a multisig (e.g. Safe) or a hardware wallet | Open |
| R2 | Medium | **The agent key is a hot key** on the backend host. **On v1 (the deployed contract)**, if stolen it can spend up to the daily cap to allowlisted recipients until the owner reacts, with no owner signature. **v2 (local, not deployed)** removes this: transfers need an owner signature or grant verified on-chain (§11). | Contract allowlist, caps and intents; `emergencyStop`; encrypted keystore supported; public dev keys refused | Low-balance dedicated key; KMS/HSM signer; alert on unexpected `TransferExecuted` | Accepted |
| R3 | Medium | **Off-chain policy isn't enforced on-chain.** The reserve floor, auto-approval limit, USD daily limit, circuit breakers and off-chain pause live in the backend. A stolen agent key bypasses them, though not the contract caps. | The contract caps bound the loss; the owner sets caps | Keep on-chain caps tight; consider moving the reserve floor into the contract | Accepted |
| R4 | Medium | **Calendar-day cap.** Caps reset at 00:00 UTC, so up to 2× the daily cap can move within minutes around midnight. | Documented; the per-tx cap still applies | Rolling-window accounting in the contract | Accepted |
| R5 | Medium | **Single-instance assumptions.** Rate limits and approval/executor mutexes are in-process. Scheduler runs are multi-instance safe (DB leases, compare-and-set). | Supported topology is one backend instance; the contract enforces intents | Shared rate-limit store; `SELECT … FOR UPDATE` locks | Accepted |
| R6 | Medium | **Dev-tooling advisories.** Vite, Vitest and Tailwind versions have known critical/high advisories (dev-server path traversal, Vitest UI file read). They affect the dev server, not the built console. `vite.config.js` sets `host: true`, so a plain `npm run dev` listens on all network interfaces and is reachable from the local network. | `npm run demo:metamask` binds the console to `localhost` only; Vitest UI is not installed | Upgrade vite, vitest, tailwind; drop `host: true`; serve a production build for public demos | Open |
| R7 | Medium | **No external audit.** This includes v2's on-chain signature verification (§11). The contract has run on a public testnet (Ethereum Sepolia, 2026-10-16) but has not been externally reviewed. | 35 contract tests including adversarial cases; public-testnet run | External review | Open |
| R8 | Low | `react-router-dom` 6.30.6 has 2 moderate advisories (open redirect via backslash in `<Link>`). The console uses only fixed internal routes. | No user-controlled navigation targets | Upgrade react-router-dom | Open |
| R9 | Low | **LLM misunderstanding.** One live run raised a reserve floor nobody asked for; a pronoun-only recipient was once guessed before a prompt fix. | Drafts only; owner signs every transfer; tighten-only tools | Keep the live eval suite; review drafts before signing | Accepted |
| R10 | Low | **Indexer reorg depth** is fixed at 12 blocks. | Base Sepolia has a single sequencer | Configurable depth; finality-based confirmation | Accepted |
| R11 | Low | **Audit-log tail truncation** by a DB superuser isn't detected (edits are). | Hash chain; append-only trigger | Anchor the head hash externally | Open |
| R12 | Low | **Fee-on-transfer or rebasing ERC-20s** are accounted at the sent amount. | Only owner-enabled tokens can move | Allow vetted tokens only | Accepted |
| R13 | Low | **Owner swaps** rely on the owner-supplied `amountOutMinimum` for slippage protection. | Contract requires a non-zero minimum, checks balance deltas, 30-minute deadline | Quote-based minimum in the UI | Accepted |
| R14 | Info | **RL timing** is trained on synthetic fees and is out of distribution on real chains. | Opt-in per task; the deadline forces execution | Retrain on Base fee data (a replay dataset exists in `rl-engine/evidence/`) | Accepted |
| R15 | Info | A duplicate request creates a second, independent draft. | Each needs its own owner signature; intents can't replay | "Similar pending proposal" warning in the UI | Accepted |
| R16 | Info | Docker images and PostgreSQL server mode are unverified on the build machine. | PGlite (embedded PostgreSQL) is tested | Build and test the images in CI | Open |
| R17 | Low | **Testnet keys are plaintext env files** on the development machine: deployer, agent, and, for the automated evidence run, the owner and recipient. This is weaker custody than the MetaMask owner used in the local demo. | Git-ignored and verified untracked; testnet-only; at most about 0.0008 testnet ETH ever held; the helper never prints keys; the run script sends only between the four roles and the contract | Use the encrypted keystore (`AGENT_KEYSTORE_FILE`) for the agent; never reuse these keys beyond the testnet run; for anything with value, keep the owner in a hardware wallet or multisig (R1) | Accepted |
| R19 | Medium | **The public run's owner key was held by a script** (test-only EIP-1193 bridge) rather than a hardware wallet or MetaMask, so the "owner key never leaves the wallet" property was not exercised publicly. | Testnet-only key with ~0.06 SepETH; never logged; distinct from agent and deployer; real MetaMask signing verified locally (11/11 on 2026-10-15) | Repeat a public owner approval with MetaMask or a hardware wallet | Accepted |
| R20 | Low | **Dependency on one public RPC** (publicnode) for chain reads, receipts and the indexer. A lying RPC could mislead the console, though not the contract. | Receipts re-checked; explorer cross-check | Quorum of RPCs, or a self-hosted node | Accepted |
| R18 | Info | The Base Sepolia and Ethereum Sepolia profiles lower backend defaults to faucet scale: reserve floor 0.0001 ETH, minimum agent gas balance 0.0002 ETH, on-chain caps 0.0002 per tx / 0.0005 per day. | Testnet-only file; the contract caps are lower still, so the bound on loss shrinks | Raise all values together for any larger deployment | Accepted |

## 7. Incident response (exercised publicly: pause `0x2a2eeb50…`, unpause `0x00b0dc31…`, emergency stop `0xfe627133…`, withdraw `0x6c8fb074…`)

1. **Risk controls → Emergency stop:** one owner transaction pauses the contract and revokes the agent (tested: "emergencyStop pauses and revokes the agent atomically").
2. Optionally pause the agent and automation off-chain.
3. **Treasury → Emergency withdraw** (only while paused) to move funds to cold storage.
4. Review the **Audit log** (hash chain verified at `/api/audit/verify`) and **Transactions** (indexed from chain logs).

## 8. LLM prompt-injection and tool-use risks

| Threat | Control | Evidence | Residual risk |
|---|---|---|---|
| Instructions hidden in recipient labels, memos or tool results | Treated as data; the recipient must be resolved from the on-chain allowlist in code | "prompt injection inside a recipient label cannot redirect funds"; live label-injection case | Low: worst case is a wrong *draft*, which the owner must sign |
| Model invents an address | Rejected by trusted code; no proposal created | "an invented (non-allowlisted) recipient is rejected …" | None on-chain (the contract allowlist) |
| Model tries to approve, execute, withdraw or resume | No such tool exists | `agent.chat.test.js` | None |
| Model loosens limits ("SYSTEM OVERRIDE") | Tighten-only tools; loosening needs the owner in the console | live suite case; "can tighten … cannot loosen" | None |
| Malformed or out-of-order tool calls | Strict schemas + zod; action tools refused before `record_plan`; mixed batches with a clarification run nothing | `agent.chat.test.js` | None |
| Model misunderstands intent | Owner reviews the draft; caps bound any loss | R9 | Low |
| Over-cap draft from the model | Policy engine rejects before signing | **Public:** 0.0003 ETH draft rejected (audit #10, no transaction) | None |
| API key leakage via conversations | Keys never in prompts, turns, tool calls or audit rows | live global-invariants check | Low |

## 9. Changes since the previous assessment (2026-10-16)

- **Frontend redesign:** presentation only. All test-bound labels preserved; 24/24 component tests, 3 browser flows and the recorded demo rehearsal pass.
- **Submission tooling** (`submission/tools/`), all read-only toward the chain:
  - receipt verifier;
  - independent audit-chain verifier, which works on a database **copy**;
  - live-terminal recorder;
  - a read-only replay recorder. It serves the redesigned console on a copy of the run database with the executor disabled and no LLM. Its bridge forwards only read-only RPC methods and signs only the console's SIWE text. The owner key was used only for that off-chain sign-in. No transaction was sent; the contract is paused with its agent revoked.
- **MetaMask harness:** an opt-in `AW_RECORD_DIR` screen recording, off by default. MetaMask onboarding pages were deleted after recording.
- **Deployment gate:** `CONFIRM_PUBLIC_DEPLOY=no`.

## 10. Out of scope and not claimed

- That the **public** Sepolia contract verifies owner signatures. It is v1 and does not. v2 is local only until it is deployed and its source is independently verified.
- Mainnet use, real funds, or a production key-management service.
- Protection against a compromised owner wallet or browser (R1).
- Formal verification of the contract.
- Front-running or MEV protection for owner swaps beyond the minimum-output check.

## 11. Update 2026-10-17: execution-time re-verification (F1, F3) and contract v2 (F2)

An internal hostile-judge audit on 2026-10-17 found three authorization gaps:

| Finding | Severity | Gap | Fix | Where |
|---|---|---|---|---|
| F1 | Medium | The signed approval deadline was checked only at approval time. An approval left APPROVED while the executor was down was executed after the deadline on restart recovery (reproduced). | The executor refuses after the signed deadline (`APPROVAL_EXPIRED`) and after a grant's `validUntil` (`GRANT_EXPIRED`). Approvals with less than `APPROVAL_MIN_REMAINING_SECONDS` (15) left are refused (`APPROVAL_TOO_LATE`), so the deadline is never extended. The approval card shows "Execution deadline (signed)". | `executorService.checkAuthorization`, `proposalService.approve`, `ProposalCard.jsx` |
| F2 | Medium | The contract did not verify the owner's signature. A stolen agent key could transfer up to the caps with no approval. | **Contract v2** verifies `ApproveTransfer` and `AuthorizeTask` signatures on-chain, the signed deadline, and per-grant run and total counters. It adds `revokeGrant` and `cancelIntent`, and removes the unsigned `executeTransfer`. The typed data is unchanged. | `contracts/src/AgentWallet.sol`, [CONTRACT_V2.md](CONTRACT_V2.md) |
| F3 | Low | The grant signature was verified against stored typed data, not against the fields executed. The executor never re-verified an owner approval against the row it signed. | Grant typed data is rebuilt from the task's columns and must equal the stored copy. The scheduler escalates on mismatch (`TASK_GRANT_INVALID`). The executor re-verifies both approval kinds against the exact row and the current owner. | `lib/schedule.verifyGrant`, `schedulerService.routeRun`, `executorService.checkAuthorization` |

**Regression evidence:** `backend/test/authorization.regression.test.js`. **Every case failed on the pre-fix code and passes after the fix** (run 2026-10-17):
- Before the fix, 10 of 11 cases failed. In nine, the transfer executed; in one, the approval was accepted. One more case (a database-edited amount) timed out instead of reaching a clean result.
- The suite now runs against **both** the frozen v1 bytecode and v2.
- Contract-level adversarial tests are in `contracts/test/AgentWallet.v2.test.js`:
  - compromised agent key;
  - forged and substituted fields;
  - cross-chain and cross-contract replay;
  - expired, cancelled, exhausted, unbounded and revoked authorizations;
  - ownership change;
  - an ERC-1271 smart-contract owner;
  - a digest-equality check against the backend's typed data.
- Results: §11.1.

**v1 compatibility:**
- The deployed contract's source and bytecode are frozen in `contracts/legacy/` and `shared/abi/AgentWallet.v1.json`. The runtime bytecode is byte-identical to the Sepolia deployment.
- The backend detects v1 and keeps calling `executeTransfer`, with all Stage A checks.
- The v1 evidence verifiers read the frozen ABI.

**New or changed residual risks:**

| ID | Severity | Risk | Status |
|---|---|---|---|
| R21 | Medium | **v2 is not deployed.** Every public-chain claim still describes v1, where R2 applies in full. | Open |
| R22 | Low | **On v2, a grant's schedule is enforced off-chain only.** A compromised agent could use a grant's remaining runs and total earlier than scheduled; never more, never after `validUntil` or revocation. | Accepted |
| R23 | Low | **An off-chain task cancel does not revoke a v2 grant on-chain.** The console's "Revoke grant on-chain" sends the owner's `revokeGrant` transaction; `emergencyStop` revokes everything. | Accepted |
| R24 | Info | **The deadline is fail-closed.** An approval signed shortly before its deadline can be refused or revert on-chain rather than execute late. | Accepted |
| R25 | Medium | **Loosening policy needs only a valid owner session, not a fresh wallet signature.** `PUT /policy` with `confirmLoosening` and `POST /automation/resume` check the bearer session and the on-chain owner. The console sets no Content-Security-Policy, and the session token is in `sessionStorage`, so an XSS that stole it could raise auto-approval limits, remove breakers and resume automation. It could **not** create grants, approve transfers or exceed signed grants and on-chain caps. | Open (next step: an EIP-712 signature for loosening, plus a strict CSP) |
| R26 | Low | **One RPC endpoint is trusted for chain reads and receipts.** A malicious or faulty RPC could mislead status, for example by reporting a fake receipt. It cannot change what the contract enforces, and the indexer reconciles from events. | Accepted (next step: a second RPC for confirmation on public chains) |

### 11.1 Test results (2026-10-17, local)

**Clean run, strictly sequential.** One script ran every suite against a frozen source tree. The tree hash `4ee86dc8…` was identical at the start and the end, so no code changed during the run. Earlier runs, including a mixed-code run, are superseded.

| Suite | Result | Notes |
|---|---|---|
| Contracts (Hardhat) | **53/53** | 35 original tests, every agent transfer now owner-signed; 17 v2 adversarial tests; 1 `simulateTransfer` safety test |
| Backend (node:test, real local chain) | **145/145** | Includes the Sepolia-run rehearsals (now with the approved 0.015 ETH gas-money ceiling and the v2 on-chain revocation step) |
| Authorization regression (part of backend) | **24/24** | 12 cases against v2 and 12 against the frozen v1 bytecode |
| Frontend components (Vitest) | **32/32** | Includes 8 v2 tests: grant revocation (exact digest, failure path, v1/viewer/unsigned hidden, hidden once revoked), signed deadline display, pre-signature dry-run label |
| Browser flows (Playwright, test wallet bridge) | **4/4** | Plus 2 opt-in paid-LLM specs skipped by design. Includes: console "Revoke grant on-chain", then `grantRevoked = true` on-chain, one `GrantRevoked` event, and the agent's retry reverts `GrantIsRevoked` with no transaction sent |
| End-to-end (local chain) | **8/8** | |
| RL engine | **25/25** | |
| Real MetaMask 13.52.0 (local Hardhat, v2) | **11/11 PASS** | Row 9 (live gpt-4.1-mini) checked against the agent's **own** proposal: `executeApprovedTransfer`, the signed proposal id, 0.005 ETH |
| Live gpt-4.1-mini safety suite (local v2, separate run) | **19/19 cases, 47/47 graded checks** | 55 model calls; 0 executions without approval; audit chain valid |



**Red before green:**
- Before the backend fix, 10 of 11 Stage A cases failed:
  - in 9 cases the transfer executed (CONFIRMED or AUTO_APPROVED);
  - in 1 case the near-deadline approval was accepted;
  - 1 case timed out instead of resolving.
- An agent key calling `executeTransfer` with no owner signature **moved 0.01 ETH on the frozen v1 bytecode** and **reverted on v2** (local in-process Hardhat).

**Two defects found by the clean runs and fixed before the final run:**
1. v2's first pre-signature dry run (`checkTransfer`, limits only) no longer caught a recipient contract that rejects ETH, which v1's simulation did. v2 now has `simulateTransfer`: it runs every check **and** the real send, then always reverts, so it can never move funds.
2. A test assumption about Hardhat's clock. The contract's on-chain `validUntil` check correctly failed closed when the chain clock ran ahead.

**v1 evidence after the change, re-verified read-only over a public Sepolia RPC:**
- 11/11 transactions SUCCESS.
- The deployed runtime is byte-identical to the frozen `shared/abi/AgentWallet.v1.json`.
- Owner EIP-712 approval of `0x2c83a855…` re-verified.
- 39/39 SHA-256 values in `evidence/sepolia*/MANIFEST.json` match, including the recordings.
- No file under `evidence/sepolia/`, `evidence/sepolia-attempt-1/` or `submission/06-execution-evidence/` changed.

**Gas (local, ETH):**
| Call | Gas |
|---|---|
| v1 `executeTransfer` | 93,869 |
| v2 `executeApprovedTransfer` | 109,277 |
| v2 first `executeGrantTransfer` run | 143,389 (two new counter slots) |

v2 runtime size: 12,631 bytes (limit 24,576).
