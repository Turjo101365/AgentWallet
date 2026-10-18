# Treasury Manager verification — 2026-10-17

> Initial implementation snapshot. Superseded for release decisions by
> [TREASURY_RELEASE_READINESS.md](TREASURY_RELEASE_READINESS.md), which records the
> complete regression reruns, real GPT-4.1-mini calls, isolated PostgreSQL tests,
> discovered concurrency regressions and their fixes. The statements below about
> unverified AI/PostgreSQL and no paid API calls describe the earlier run only.

These results describe **local changes**, not a deployed Treasury Manager release.
No public-chain transaction, production database change, paid API call, secret
change, commit or push was performed for this feature.

## Results

| Check | Result |
|---|---|
| Initial complete backend regression | 197 passed, 2 failed, 0 skipped (199 tests) |
| Affected backend suites after fixing both failures | **37 passed, 0 failed, 0 skipped** |
| Treasury + demo authorization suites after reserve-confirmation review | **30 passed, 0 failed, 0 skipped** |
| Latest treasury integration run after final tool/error-data changes | **15 passed, 0 failed, 0 skipped** |
| Complete frontend regression after changes | **58 passed, 0 failed** |
| Production frontend build | **Passed**; pre-existing large-bundle warning remains |
| Styled local browser workflow | **Passed** at 1440, 768 and 390px; no JS errors or page overflow |
| Git whitespace check | **Passed** |
| Live GPT-4.1-mini treasury tool behavior | **Not verified** |
| Hosted PostgreSQL/Neon locking and persistence for migration 006 | **Not verified** |
| New treasury flow on public Sepolia | **Not verified / not attempted** |

The two initial backend failures were the existing public-run **local rehearsals**:
they observed CONFIRMED before the newly introduced gate was cleared, so their
immediate policy update received TREASURY_BUSY. Finalization now clears the settled
gate before publishing the terminal proposal state. Both rehearsals passed in the
37-test rerun. There are no remaining known failing checks in the exercised suites;
the entire ten-minute backend suite was not repeated after those targeted fixes.

The 37-test rerun comprises 11 existing Base Sepolia run-script tests, 15 treasury
integration tests, 10 exact-arithmetic/planning tests, and 1 restart-persistence
test. Its testnet-named rehearsals use isolated **local chains**.

Three initial frontend failures were stale assertions for previously renamed
“Save policy” / raw provider-unavailable text. They now assert “Save safeguards”
and the existing safe unavailable state; the double-confirmation assertions remain.
Ten new Treasury UI tests are included in the final 58-test result. Lowering either
an owner or admin-managed reserve preserves the explicit second confirmation.

An early browser harness invocation used the wrong working directory for Tailwind
and was not counted as visual evidence. The corrected, styled invocation found a
390px local-mode header overflow; wrapping the header controls fixed it. The final
styled workflow passed. Early integration attempts were also terminated by Windows
memory exhaustion; after unused apps were closed, all reported final runs completed.

## Targeted coverage

- Exact wei arithmetic, zero/boundary balances and reserves, amounts beyond normal
  floating-point precision, commitments, no negative available-to-spend value.
- Overdue / priority / due-time ordering, deterministic ties, insufficient funds,
  cap/allowlist deferrals and no invented deposits.
- SIWE owner checks, no-session/outsider denial, strict schemas, invite-only demo
  writes, session isolation and admin-only shared reserve changes.
- Obligation edits, optimistic version conflicts, cancellation and immutable
  preparation; concurrent/repeated preparation and interrupted-link recovery
  produce the same single proposal.
- Existing owner-signature execution, real local receipt, paid-ledger status and
  rejected second bill; no execution from preparation alone.
- Reserve changes before manual/TASK execution; a genuine signed task grant still
  fails preflight after the reserve is raised.
- Concurrent approvals do not spend below reserve; unknown hashed transactions
  remain committed and hold the gate; policy edits reject unsettled sends.
- Missing critical gate state fails closed. An injected commit-acknowledgement
  failure causes **no broadcast**, retaining the uncertain hash reservation.
- Trusted tool data, model amount-override rejection, no approval/execution tool,
  untrusted-description handling and AI-prepared proposals labelled AGENT.
- Existing full regression coverage includes v1/v2 authorization tampering,
  expired/revoked approvals/grants, failed receipts, scheduler retries and recovery,
  API security, demo quotas, personal wallet ownership and provider error handling.

## Browser scenario and evidence

`scripts/treasury-local-smoke.mjs` starts Hardhat 31337, deploys the test fixture,
creates a memory database, and starts a local backend and Vite frontend. It injects
an explicitly test-only wallet interface backed by a **public Hardhat development
account**, never a funded private key. No live model is called.

The browser sets a 0.0002 ETH reserve against 0.0004 ETH of local funds, records two
supplier bills, observes the urgent-first plan, verifies the AI prompt handoff,
prepares/signs the 0.0001 ETH payment through the existing Payments UI, verifies its
real local receipt and PAID status, then observes the 0.0002 ETH bill rejected by
BALANCE_AND_RESERVE. The second bill is never sent.

Artifacts are in ignored `work/`: `treasury-browser.json`,
`treasury-local-1440.png`, `treasury-local-768.png`, `treasury-local-390.png`,
`treasury-final-backend.log`, `treasury-final-security.log`, `treasury-latest-integration.log`,
`treasury-frontend-regression.json`, and `treasury-production-build.log`.
Local transaction hashes are not Sepolia evidence and have no public Etherscan receipt.

## Reproduce

Install the existing dependencies and compile the existing contract artifacts first.
The following commands execute local tests only; no production environment file or
credential change is needed. In a memory-constrained Windows session, close unused
apps and run suites sequentially.

```powershell
cd D:\AgentWallet\backend
node --max-old-space-size=384 --wasm-num-compilation-tasks=1 --test --test-concurrency=1 test/base-sepolia.run.test.js test/treasury.integration.test.js test/treasury.math.test.js test/treasury.persistence.test.js

cd D:\AgentWallet\frontend
npx vitest run --pool=forks --maxWorkers=1 --minWorkers=1

cd D:\AgentWallet
node --max-old-space-size=384 --wasm-num-compilation-tasks=1 scripts/treasury-local-smoke.mjs
```

The browser script requires ports 4207 and 5184 to be free and Playwright Chromium
already installed. It writes only ignored local smoke artifacts. The browser's
owner transaction submission is disabled; typed approval is supported solely for
the isolated local payment executed by the existing backend.

Production build uses the existing public API URL and judge mode, without a secret:

```powershell
cd D:\AgentWallet\frontend
$env:VITE_API_URL='https://agentwallet-judge-api.onrender.com/api'
$env:VITE_APP_MODE='judge'
npm run build
```

## Release boundary

**IMPLEMENTED AND TESTED:** local financial workflow, safeguards, UI and integration.

**IMPLEMENTED BUT NOT VERIFIED:** actual hosted pg transaction-lock behavior,
production migration/persistence, live GPT-4.1-mini treasury planning and this
feature's bounded Sepolia receipt. Approval is still required before deployment or
public-chain demonstration. No new secret, hosting tier or contract is introduced.

**NOT IMPLEMENTED:** contract-enforced reserve, trading, consolidated future-grant
forecast or dependable unattended scheduling. See `AI_TREASURY_MANAGER.md` for
security assumptions, file responsibilities, demo steps and rollout/rollback checks.
