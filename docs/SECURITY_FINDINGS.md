# Security Findings

Tracks every finding from the 2026-10-15 read-only audit, plus findings discovered during Phase 1.
Status: **FIXED (verified)** means a test that would fail without the fix exists and passes.

## Audit findings

| ID | Severity | Finding (baseline `f887ccf`) | Status | Fix | Evidence (test) |
|---|---|---|---|---|---|
| C1 | Critical | Unauthenticated API accepted client `overrideState` / `defaultRecipient`; forged state passed the validator | FIXED (verified) | SIWE sessions on every mutating route; owner role from on-chain `owner()`; strict zod schemas reject unknown keys; wallet state only from `chainService.getSnapshot()`; RL never supplies recipients | `api.security.test.js`: "every state-changing endpoint rejects unauthenticated requests", "client-supplied wallet state and recipients are rejected"; `api.rl-recovery.test.js`: "malformed RL response (including an injected recipient) is rejected" |
| C2 | Critical | Approve ignored status and never re-validated; UI kept approved proposals approvable (double payment) | FIXED (verified) | Atomic compare-and-set state machine; EIP-712 approval bound to the exact transfer; policy and simulation re-run at approval and again pre-flight; Idempotency-Key; unique execution row; on-chain intent ids | `api.execution.test.js`: concurrent approvals → exactly one `TransferExecuted`; replayed and reused keys; rejected/policy-rejected never approvable; signature for another proposal refused; allowlist change between create and approve caught |
| H1 | High | Hardcoded recipient `0xE592…1564` and amount `0.01` fallbacks in the money path | FIXED (verified) | All fallbacks removed; missing or invalid parameters fail with 400; frontend signs only backend typed data | `api.security.test.js`: "malformed amounts and addresses are refused"; repo grep shows no `0xE592` in source |
| H2 | High | No recipient allowlist | FIXED (verified) | `isRecipientAllowed` on-chain, enforced in `executeTransfer`; also checked by the policy engine | Contract test "rejects non-allowlisted, removed, zero or self recipients"; backend test "policy rejects … non-allowlisted recipients" |
| H3 | High | Unauthenticated pause toggle; anyone could resume | FIXED (verified) | Explicit owner-only `/agent/pause` and `/agent/resume`, persisted and audited; on-chain `pause`/`emergencyStop` | `api.security.test.js`: "off-chain pause blocks proposals … resume is owner-only and audited" |
| H4 | High | Postgres mode returned snake_case rows → TTL bypass and hardcoded recipient after restart | FIXED (verified) | Row mappers for every table; expiry enforced in SQL | `db.persistence.test.js` (restart round-trip, expiry); E2E restart test |
| H5 | High | Fabricated agent output: offline proposal with `passed:true`, constant confidences, invented benchmark table and seed metrics | FIXED (verified) | Offline path removed (503 `RL_UNAVAILABLE`); RL reports `policySource`, `confidence: null` for heuristics; ComparisonChart and seed metrics deleted | `api.rl-recovery.test.js`: "an RL outage returns 503 and fabricates nothing"; `rl-engine/tests/test_agents.py` |
| H6 | High | Owner and agent were the same key by default; one key controlled everything | FIXED (verified) | Constructor and `setAgent` reject owner/pending owner; agent cannot accept ownership; renounce disabled; owner uses Ownable2Step | Contract tests in "deployment and roles" |
| M1 | Medium | Zero-address/non-hex recipients passed validation | FIXED (verified) | `ethers.getAddress` checksum normalization; zero, wallet and executor rejected | `unit.policy.test.js`; `api.security.test.js` |
| M2 | Medium | Negative/NaN amounts passed; float ETH math; `||` treated 0 limits as defaults | FIXED (verified) | Integer base units (BigInt) end to end; strict decimal parser | `unit.policy.test.js` "parseAmount uses exact integer units" |
| M3 | Medium | No chain-id check before signing; local Hardhat used 84532 | FIXED (verified) | Local chain is 31337; backend verifies RPC chain id; frontend `getSigner()` re-checks the chain right before each signature; EIP-712 domain includes chainId | `criticalFlows.test.jsx` "does not sign when the wallet is on the wrong network"; `unit.policy.test.js` chain guards |
| M4 | Medium | Agent inputs partly invented (constant congestion/slippage) | PARTIAL | Congestion = real block gas utilization; slippage is sent as 0 with `slippageObserved:false` (no DEX integrated) | `api.rl-recovery.test.js` observation test |
| M5 | Medium | Tracking trusted client metadata; never reached the backend | FIXED (verified) | `/transactions/track` accepts only a hash and reads everything from the chain; history comes from receipts and indexed logs | `api.security.test.js` "transaction tracking ignores client metadata" |
| M6 | Medium | No rate limiting; raw internal error messages | FIXED (verified) | express-rate-limit (global, auth, mutation); generic 500 bodies with a request id | `api.security.test.js` rate-limit and error-shape tests |
| M7 | Medium | RL engine CORS `*` with credentials | FIXED | CORS middleware removed; binds to 127.0.0.1 by default | Code: `rl-engine/app/main.py` (no test) |
| L1 | Low | Docs claimed a rolling 24h window | FIXED | Contract NatSpec and docs say UTC calendar day | — |
| L2 | Low | Backend Docker image could not import `shared/`; frontend Dockerfile missing | FIXED, UNVERIFIED | Root build context; new Dockerfiles | Docker is not installed on the dev machine |

## Found during Phase 1

| ID | Severity | Finding | Status | Evidence |
|---|---|---|---|---|
| P1-1 | High | Zod 4 `.default('false')` on a transformed boolean returned the string `'false'` (truthy). That would have enabled `ALLOW_PUBLIC_TESTNET_EXECUTION` and `TRUST_PROXY` silently | FIXED (verified) | `unit.policy.test.js` "a public-network executor key requires explicit opt-in" failed before the fix |
| P1-2 | Medium | Daily reservation double-counted mined-but-not-yet-confirmed transfers, falsely rejecting valid approvals (fail-safe, but wrong) | FIXED (verified) | `api.execution.test.js` "daily-limit reservations …" |
| P1-3 | Low | The jsonb key reordering would break audit hash verification | FIXED (verified) | `db.persistence.test.js` audit test (nested objects) |

## Open findings

| ID | Severity | Finding | Mitigation / plan |
|---|---|---|---|
| O1 | Medium | Rate limiting and the approval mutex are in-process; several backend instances would need a shared store and DB-level locking (`SELECT … FOR UPDATE`) | Single instance is the supported topology in Phase 1; the contract still enforces caps |
| O2 | Medium | The executor key is a hot key in an env var. Its blast radius is capped by the contract (allowlist + caps + revocation), but anyone who reads it can spend up to the daily cap to allowlisted recipients | Use a low-balance dedicated key; Phase 3: KMS/HSM signer |
| O3 | Medium | Indexer reorg handling rewinds a fixed 12 blocks; deeper reorgs are not handled | Acceptable on Base Sepolia (L2 sequencer); revisit for mainnet-like use |
| O4 | Low | A DB superuser can disable the append-only trigger. The hash chain detects edits but not truncation of the tail | Periodically anchor the head hash externally (Phase 3) |
| O5 | Low | `npm audit` has not been run in this environment | Run in CI (Phase 3) |
| O6 | Low | Fee-on-transfer / rebasing ERC-20s: the contract accounts for the sent amount, not the received amount | Only allow vetted tokens (owner-controlled policy) |
| O7 | Info | SIWE domain/URI binding relies on the server-built message; the wallet shows the domain to the user, but the backend does not verify the browser origin of the verify call beyond CORS | Acceptable: the signature is bound to the nonce issued for that address |

## Phase 2: autonomy and AI threat surface

| ID | Severity | Threat / finding | Status | Control | Evidence (test) |
|---|---|---|---|---|---|
| P2-1 | Critical | LLM tool output could move funds | MITIGATED (verified) | No tool approves, signs, withdraws or resumes. Transfers need the owner's EIP-712 signature; tasks need an owner-signed grant | `agent.chat.test.js` "cannot loosen anything" (asserts no such tool exists); approval flow test |
| P2-2 | High | Prompt injection (labels, memos, tool results) redirects a payment | MITIGATED (verified) | Recipients must be on the on-chain allowlist, checked in code before a proposal is created, then by policy and the contract | `agent.chat.test.js` "prompt injection inside a recipient label cannot redirect funds" |
| P2-3 | High | Model invents or alters an address | MITIGATED (verified) | Same allowlist check; the tool returns REJECTED and no proposal is created | "an invented (non-allowlisted) recipient is rejected" |
| P2-4 | High | Malformed or extra tool arguments | MITIGATED (verified) | Strict JSON schemas sent to the provider plus zod re-validation; failures return a tool error with no side effects | "malformed tool input has no side effects" |
| P2-5 | Medium | Actions taken without a stated plan | MITIGATED (verified) | Action tools rejected until `record_plan` is called in the turn | same test |
| P2-6 | Medium | Refused or truncated model output executes partial tool calls | MITIGATED (verified) | `stop_reason` checked before any tool runs | "refusal and truncated responses run no tools" |
| P2-7 | High | Agent loosens risk policy | MITIGATED (verified) | `policySettings.update` refuses loosening unless `allowLoosening` (console only, explicit `confirmLoosening`) | "can tighten policy … cannot loosen"; scheduler test "loosening requires console confirmation" |
| P2-8 | Critical | Scheduler double-executes a run (two instances, retries, crash) | MITIGATED (verified) | Lease CAS + `run_key` + claim CAS on status/attempt + proposal state machine + on-chain `executedIntents` | `scheduler.test.js` "duplicate scheduler invocation -> exactly one execution"; restart recovery test |
| P2-9 | High | A task runs without owner authority, or past its bounds | MITIGATED (verified) | EIP-712 grant verified against the signed-in on-chain owner; runs reserved atomically against maxRuns/maxTotal; validUntil enforced; re-verified (owner unchanged) per run | "unauthorized intents are blocked …"; grant-exhausted path |
| P2-10 | High | Autonomous runs above an acceptable size | MITIGATED (verified) | Per-token auto-approval limit (absent = always escalate) plus contract caps | "runs above the auto-approval limit escalate" |
| P2-11 | Medium | Runaway automation | MITIGATED (verified) | Circuit breakers: consecutive failures pause the task; the rolling-hour autonomous outflow cap pauses automation | two circuit-breaker tests |
| P2-12 | Medium | Stale or missing prices used for USD limits | MITIGATED (verified) | USD daily limit fails closed when any involved price is missing or stale | "fails closed when prices are stale" |
| P2-13 | Medium | Payments to contracts with unexpected receive logic | MITIGATED (verified) | Contract recipients blocked unless explicitly allowed; simulation still runs | "contract recipients are blocked unless explicitly allowed" |
| P2-14 | High | Signing secret leaks through config, logs, DB or the LLM | MITIGATED (verified) | Secrets on non-enumerable properties, read only by `signerProvider`; encrypted keystore supported; nothing key-related is in any tool | `unit.signer.test.js`; agent test "no key material" in provider requests |
| P2-15 | Medium | RL model overrides safety, or fabricates advice | MITIGATED (verified) | RL can only defer within the window; the deadline is deterministic; policy runs regardless; an unavailable model is reported as unavailable | RL timing scheduler test; `rl-engine/tests/test_registry.py`, `test_api.py` |
| P2-16 | Medium | RL timing out of distribution on real chains | OPEN | Opt-in per task; the deadline always forces execution; E2E shows PPO at P(WAIT)=0.99998 on Hardhat's decaying fees | E2E evidence; see KNOWN_LIMITATIONS |
| P2-17 | Medium | Agent conversations visible to other addresses | MITIGATED (verified) | Conversations are owner-only and checked against the session address | route guards (owner); `agentChat.conversation` |

### Found while building Phase 2
| ID | Severity | Finding | Status |
|---|---|---|---|
| P2-B1 | High | The scheduler run claim compared status but not the attempt, so two instances could both claim a run | FIXED (verified): `CLAIMED` state + CAS on attempt; duplicate-invocation test |
| P2-B2 | Medium | A refactor left `now` undefined in run routing, so every run stuck in CLAIMED | FIXED (verified) by the scheduler tests |
| P2-B3 | Low | With `useRlTiming` and a window shorter than two gas-sampling steps, the model could never be consulted (silent no-op) | FIXED (verified): creation now fails with `WINDOW_TOO_SHORT_FOR_RL` |
| P2-B4 | Info | The backend crashed at start-up under memory pressure ("Fatal process out of memory: Zone") while compiling PGlite's WASM; the machine had 588 MB free | ENVIRONMENT: not reproducible with free memory; use PostgreSQL (`DATABASE_URL`) on constrained hosts |
| P2-B5 | Medium | A snapshot requested via the `latest` alias could briefly reuse a pre-change block after a mined allowlist or limit update | FIXED (locally verified): resolve a fresh block height through `eth_blockNumber`, then pin every policy read to that explicit height; the allowlist test asserts both update blocks are visible |
