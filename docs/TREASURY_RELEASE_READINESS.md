# AI Treasury Manager — release-readiness verification

Verification began 2026-10-17 (Asia/Dhaka). These are local working-tree results
on `feature/ai-treasury-manager`, based on commit
`89783bbf715fb8b9848febc48751b21707bbd7c0`. The feature and verification fixes
remain uncommitted. Nothing was pushed, deployed or sent to a public blockchain.
Production database data, hosting settings, secrets and contracts were not changed.
Final full backend run completed **2026-10-18 at 12:45:25 Asia/Dhaka**, exit code 0.

## Decision

**GO for controlled deployment verification, after explicit approval.** The local
release candidate has no remaining failing checks in the exercised suites. No new
product features were added during verification.

Keep Treasury execution disabled during the deployment/migration checks. Actual
Neon pooling/TLS, hosted persistence/restart, HTTPS/CORS/SIWE and the new public
Sepolia Treasury flow remain **UNVERIFIED**. Clear those hosted gates, then obtain
approval for the exact single bounded Sepolia payment described below. Public judge
Treasury payments require successful hosted evidence; local results do not clear
that final release gate. Nothing in this recommendation authorizes a push,
deployment, production-secret change or public transaction.

## Results and evidence

| Check | Actual result | Local artifact |
|---|---|---|
| Entire backend, first release-readiness run | **204 passed, 0 failed, 0 skipped**; 822.03 seconds | `work/release-backend-full.log` |
| Entire backend, final working tree | **205 passed, 0 failed, 1 skipped test**; 206 tests, 31 suites; 840.63 seconds; exit 0 | `work/release-backend-final.log` |
| Entire frontend Vitest suite | **58 passed, 0 failed** | `work/release-frontend-full.json` |
| Default complete Playwright suite against final fixes | **4 passed, 0 failed, 6 opt-in tests skipped**; 27.4 seconds | `work/release-browser-full.log`, `frontend/test-results/browser-results.json` |
| Real isolated PostgreSQL integration | **11 passed, 0 failed, 0 skipped**; 48.16 seconds | `work/release-postgres-tests.log` |
| Demo/admin/personal authorization suite after fixture correction | **15 passed, 0 failed, 0 skipped**; 44.49 seconds | `work/release-demo-auth-final.log` |
| PostgreSQL server restart | **PASS**: all six migrations, exact obligation amount, unresolved gate and lock acquisition persist | `work/release-pg-server-restart.json` |
| Actual GPT-4.1-mini treasury tools | **1 passed, 0 failed**; two user turns, five provider requests | `work/release-live-ai.log`, `work/release-treasury-live.json` |
| Complete Treasury browser demonstration | **PASS**, widths 1440/768/390; zero page errors or horizontal overflow | `work/release-treasury-demo.log`, `work/treasury-browser.json`, `work/treasury-local-*.png` |
| Production frontend build | **PASS**; 660.67 kB main JavaScript chunk, existing >500 kB warning | `work/release-production-build.log` |
| Hosted Neon endpoint/TLS/pooler and Render restart | **UNVERIFIED** for this release; no production connection attempted | Requires separately approved hosted smoke test |
| Public Sepolia Treasury payment / real MetaMask approval | **UNVERIFIED** for this release; no public transaction attempted | Requires separately approved controlled test |

`work/` is ignored. Logs and downloaded PostgreSQL binaries/data are local evidence,
not release assets. No secret values are needed in a report or frontend variable.
Opt-in tests are separate from the default suite; they must not be counted as
default-suite passes. Public-chain reads, hosted smoke tests and broader paid-model
showcases are not implied by a successful local browser run.
The final backend TAP count includes one skipped live Treasury test; the broader
`LIVE_LLM` suite and isolated PostgreSQL suite are also opt-in skipped registrations
in that default invocation. The Treasury live test and PostgreSQL suite were each
run separately and passed as listed above. The broader live-model showcase and real
MetaMask extension suite were not rerun and remain **UNVERIFIED for this release**.
`git diff --check` passed (exit 0); Windows line-ending conversion warnings do not
represent whitespace errors.

## Regressions resolved

1. **Concurrent PostgreSQL audit appends could fork the hash chain.** The old mutex
   covered one process only. Audit append transactions now acquire a schema-scoped
   PostgreSQL transaction advisory lock (key 707; treasury uses 706). Twelve
   concurrent appends from two independent application instances preserve a valid
   chain. PGlite retains its existing process mutex.
2. **A lost checked-out PostgreSQL connection could crash Node.** Every pooled
   client now has an error-event listener. Failed queries/COMMIT still reject;
   no broadcast follows a failed commit. The isolated test terminates the actual
   locked database connection after signing/persistence but before COMMIT, verifies
   zero agent nonce change and no committed hash, then recovers exactly one payment.
3. Browser tests referenced labels from before the existing UI refinement. Tests
   now locate the verified-receipt card, the actual execution hash and the renamed
   recipient/unavailable/decline labels. Receipt, destination, amount, rejection, history,
   real local grant revocation and unchanged-nonce checks remain required.
4. **A confirmation racing a pinned policy snapshot could escape reservations.**
   An independent deterministic test found that a payment
   confirmed after the snapshot could disappear from APPROVED/SUBMITTED rows before
   its outflow was reflected in the older snapshot. Reservation candidates now
   also include confirmed executions newer than the snapshot; the block-pinned
   on-chain intent check avoids double counting. Deterministic PGlite and PostgreSQL
   tests retain an old snapshot across a real confirmed payment and require the
   next payment to be blocked.
5. **Receipt settlement could ignore configured confirmation depth.** An actual
   PostgreSQL/local-chain test requiring two confirmations reproduced gate release
   after just one mined block. Gate release, gate takeover and receipt finalization
   now require the configured confirmation depth. The test verifies that another
   send remains blocked at one confirmation and recovery settles exactly once
   after the second block. This prevents an early receipt from being presented as
   a settled payment during takeover/recovery.
6. **The old daily-reservation test assumed execution never freed capacity.**
   Diagnostics on the intermittent five-versus-four approval failure showed that
   some background execution attempts correctly failed `TREASURY_BUSY`, freeing
   their reservations before later approvals. The test now holds dispatch while
   making approvals concurrently, requires exactly the available capacity to be
   approved, then genuinely executes every accepted payment sequentially and checks
   exact on-chain spend. Failed/superseded runs remain recorded and are not counted
   as successful full runs. The snapshot race above is covered independently.
7. **Rapid local fixture deployments could reuse a cached pending nonce.** The
   complete run exposed `NONCE_EXPIRED` before the personal-wallet SIWE test reached
   its assertions: two deploy helpers reused the same funded development account
   inside ethers' short cache window. The local test-chain provider now disables
   RPC caching. Production providers and signers are unchanged.
8. **The browser wallet bridge forgot permission after a dev-server reload.**
   A captured trace showed a Vite disconnect/reload, followed by the test wallet
   reporting itself disconnected despite a valid SIWE session. The test bridge now
   preserves its site permission/network in sessionStorage across reloads, as an
   injected wallet does, while every test still starts in a fresh disconnected
   context. The automation case also verifies the actual task-creation HTTP 201
   response. Service logs are retained in ignored `work/` for diagnosis. No product
   authentication/session behavior was changed for this test-harness correction.

Early PostgreSQL test-harness failures were corrected: a double-close, a receipt
timeout below provider polling time, a concurrency setup blocked before execution,
and immediate reads of the provider's cached null receipt after local mining.
These early failures are not counted as passing runs.
An intermediate overlapping regression run also aborted inside PGlite while
Windows had approximately 600 MiB free physical memory. Its log is preserved as
`work/release-backend-before-test-isolation.log`. It is not accepted as a passing
run; the final full backend verification runs alone with test concurrency one.
A later session interruption stopped a clean partial run before its TAP footer;
`work/release-backend-session-interrupted.log` preserves that output. The process
was confirmed stopped before restarting the complete backend suite. An interrupted
run is not counted as a completed pass.

## Isolated database verification

Used **PostgreSQL 17.11**, official EDB Windows binaries, listening only on
`127.0.0.1:45432`, disposable database `aw_release`, random schemas `aw_rel_*`.
The fixture role has no production access. The temporary local cluster uses trust
authentication for local fixtures only; this is not a hosted database configuration.
No `DATABASE_URL` from production or another environment was used. The opt-in test
refuses non-loopback hosts and any database name other than `aw_release`.

The eleven tests verify:

- Existing migrations 001–005, sentinel data, additive 006, repeat migration and
  reconnect persistence. Migration 006 does not alter historical contract evidence.
- Two connection pools contend for the treasury advisory transaction lock; rollback
  releases it and rolls back writes made on that transaction's connection.
- Audit append serialization across two application instances.
- Concurrent authorized payments cannot deplete the protected reserve.
- A broadcast pending transaction and its durable gate survive application close /
  recreation. Reserve changes and another send are blocked until a real local
  receipt settles the pending payment, once.
- Two application instances retry contention, confirm both affordable payments
  exactly once, use distinct nonces and retain a valid audit chain.
- A one-block receipt retains a gate configured for two confirmations; another
  payment remains blocked until a second block and successful receipt recovery.
- Actual connection loss before COMMIT prevents broadcast, followed by safe recovery.
- Owner session, obligations, reserve and genuine owner-signed approval survive
  application restart; payment and ledger settle exactly once.
- A confirmed payment newer than a retained policy snapshot is still reserved,
  preventing approval using funds missing from that snapshot's balance/spend.
- Anonymous and viewer denial, owner reserve update, and explicit second
  confirmation before lowering the reserve.

Separately, the PostgreSQL server was stopped and restarted. Migration history,
the exact NUMERIC amount and an unresolved gate persisted; a new connection could
acquire the lock. Application restart tests recreate containers/providers/pools;
they do not emulate a full Render deployment. Neon transaction-pooler support is
designed around transaction-scoped locks but remains **UNVERIFIED on actual Neon**.

## Actual AI verification

Used the configured backend OpenAI-compatible integration against `api.openai.com`
with **gpt-4.1-mini**, not a scripted provider. Only the required provider fields
from the backend environment file were passed into the isolated test configuration;
the key was never printed, copied into Git or sent to a browser.

- Planning turn: two model requests; actual `generate_treasury_plan` invocation;
  2,363 input tokens and 186 output tokens. Verified exact protected reserve,
  0.0001 ETH planned payment and deferred 0.0002 ETH obligation.
- Preparation turn: three requests; actual `record_plan` and
  `prepare_treasury_payment` invocations; 3,367 input tokens and 215 output tokens.
  Verified one ordinary **AWAITING_APPROVAL** proposal with the recorded amount.
- Total recorded usage: **5,730 input / 401 output tokens**. Exact billed charge
  was not read from the provider billing account.
- Zero approval signatures; zero public-chain transactions; agent nonce unchanged.
  No signing, approval or execution tool was available in this isolated scope.
  A malicious description was excluded from tool/model data; reserve was unchanged.

This validates this bounded real interaction, not general model reliability. Default
backend tests exercise malformed responses, provider errors, context/tool limits
and prompt-injection boundaries with deterministic test providers.

## Authorization audit

| Principal | Read ledger/plan | Create/edit/prepare | Change reserve | Authorize payment |
|---|---|---|---|---|
| Anonymous visitor | Public evidence only; no Treasury session API | Denied | Denied | Denied |
| SIWE non-owner/viewer | Own scoped read data | Denied | Denied | Denied |
| Non-invited demo session | Own demo-scoped read data | Denied for Treasury obligations | Denied | Denied |
| Invited demo session | Own demo-scoped ledger | Own obligations only | Denied | Explicit matching payment confirmation, within shared/session limits |
| Personal sandbox actual owner | Own sandbox/schema and address scope | Allowed | Allowed, second confirmation to lower | Genuine owner EIP-712 signature |
| Server-allowlisted admin | Existing admin API with SIWE | Existing administration privileges | Shared demo reserve only through admin route, second confirmation to lower | Existing restricted demo mechanisms; UI role grants no authority |

The service rechecks actual on-chain ownership for personal/operator writes.
Demo principals are server-derived, invite/session validated, and cannot supply an
owner address or cross-session scope in validated payloads. Admin routes require
both SIWE and the configured server-side address allowlist. Demo bearer tokens do
not authenticate as operator sessions. Preparation never authorizes execution.
Final execution rechecks exact signature, owner, chain, contract, intent, signed
deadline, grant revocation, current policy, reserve, simulation, gas and demo quotas.

Lowering a reserve first returns **409 LOOSENING_REQUIRES_OWNER_CONSOLE**, leaves
the old value unchanged, and requires a second request with explicit
`confirmLoosening:true`. Owner Treasury and admin shared-reserve UI expose separate
confirmation actions. The agent cannot lower a reserve. Missing gate state and
unresolved hashes fail closed; no timeout automatically frees uncertain funds.

## Complete local demonstration

The script starts its own Hardhat chain **31337**, local test fixture, memory
database, API and styled frontend. Its wallet bridge uses intentionally public
Hardhat development credentials, not MetaMask or a funded private key.

1. Authenticated owner records two allowlisted obligations against **0.0004 ETH**.
2. Saves **0.0002 ETH** protected reserve and checks the urgent-first plan.
3. Verifies the Treasury-to-AI prompt handoff (this browser script calls no model).
4. Prepares the **0.0001 ETH** urgent obligation and genuinely signs its exact
   EIP-712 approval using the local development owner.
5. Existing agent executor sends a real local transaction; matching receipt and
   Treasury **PAID** status are verified.
6. The **0.0002 ETH** second bill is blocked by `BALANCE_AND_RESERVE`, never sent.
7. Desktop, tablet and mobile layouts have no overflow or page errors.

The latest local hash is
`0x143625140d634902826da27c5c275211830a89e4b530cc96f05610d2eb163e68`.
It is **not Sepolia evidence** and has no public Etherscan receipt. Real AI behavior
was verified separately above; these results do not claim one combined hosted
AI-to-Sepolia browser execution.

## Limitations verified in documentation and UI

- Reserve is an **application policy**, not a contract invariant. Existing direct
  owner withdrawals/emergency functions can bypass it. Treasury UI and technical
  documentation say this explicitly; no contract changes were made.
- Free-hosted demo automation requires the page to remain open to process due
  payments. The Automations page explicitly says it does not run unattended.
  Render sleep/restarts and background jobs disabled preclude a 24/7 guarantee.
- Unknown transactions may block further payments until an operator obtains a
  trustworthy receipt. Do not clear the gate merely to restore availability.
- Prepared financial fields are immutable; failed/rejected prepared bills need a
  new obligation/proposal. The 50-record per-scope cap includes historical entries.
- Future grant occurrences are forecasts, not double-counted approved commitments.
  No invented deposits, swaps or contract-enforced reserve were added.

## Minimum controlled public Sepolia test (requires explicit approval)

1. Review the final diff and approve commit/push/deployment. Preserve existing
   Vercel Hobby, Render Free and Neon Free services; no new paid resource.
2. Approve an isolated Neon branch/test database (if available under the existing
   free allowance). Verify migration 006, connection pooling/TLS, lock contention,
   restart persistence and pending-receipt recovery there before production writes.
   Do not run the destructive local fixture test against a hosted or production URL.
3. Disable new demo execution via the authenticated admin control, settle/reconcile
   outstanding transactions and back up the database. Use a short maintenance
   window to quiesce requests and stop old backend writers/executors before the
   migration and new backend activation; avoid mixed old/new audit writers as well
   as mixed execution workers.
4. With execution still disabled, verify health/readiness, six migrations in each
   active sandbox schema, CORS, SIWE, invite isolation, mobile routing, `/treasury`,
   `/funding`, real AI planning and a backend restart on the actual host.
5. Read-only verify chain **11155111** and sandbox
   **0x59a33154288009e030aa2072De46D32fC7d40d85**: owner/agent match backend secrets,
   actual treasury/agent gas balances, pause/revocation state, approved recipient,
   reserve, remaining caps and gas policy. Do not redeploy or add funding implicitly.
   Historical **0x3C9389E704331B8a12381F9ab5A68a7F3F59582F** remains paused/revoked
   and untouched; retain all v1/v2 evidence (12 successful transactions / 26 checks).
6. Obtain approval for the **exact single payment and gas ceiling**. Amount must
   be no more than **0.0001 Sepolia ETH**, payable only to approved recipient
   **0xd85cdB676877ccdc8873B63DEf51B456568604F5**, and within actual available funds,
   reserve, three payments/session, three globally/day and 0.0003 ETH globally/day.
   Prior allocations are ceilings, not permission to refill balances automatically.
7. Use a fresh invited judge session: record bill → ask real AI to plan/prepare →
   review amount/recipient/risk → explicitly confirm server-demo authorization →
   execute once. Verify status-1 receipt, matching contract/event/intent/amount,
   Sepolia Etherscan link, paid ledger, quota counters, balance and valid audit chain.
   Repeat the confirmation request to verify no second payment; reject reserve
   loosening without its second confirmation without sending another transaction.
8. Disable test access/execution after the bounded test unless further operation
   is explicitly approved. Do not enable unrestricted or unattended public spending.

Admin public wallet remains
`0x74B7a41E3f4949315364DAd08e1142b38870825b`. Existing sandbox owner/agent private
credentials remain backend-only; never request them in chat. No production secret
change is required by the Treasury feature itself.

## Files changed during release verification

- Product fixes only: `backend/src/db/index.js`,
  `backend/src/repositories/index.js`, `backend/src/services/reservations.js`,
  `backend/src/services/executorService.js`.
- Repeatable verification: new `backend/test/treasury.postgres.test.js`,
  `backend/test/live/treasury.live.test.js`; new regression in
  `backend/test/treasury.integration.test.js`; corrected existing assertions in
  `frontend/tests/browser/wallet.spec.js` and isolated the concurrent approval phase
  in `backend/test/api.execution.test.js`.
  `backend/test/helpers/chain.js` disables caching for immediate-mining local fixtures.
- Documentation: this report, `docs/AI_TREASURY_MANAGER.md`,
  `docs/TREASURY_TEST_RESULTS.md`, and a README report link. Existing feature work
  remains in place; no additional product feature, dependency or contract change.

The changed/nonignored untracked files were scanned for common API credential,
private-key PEM and credential-bearing database URL patterns and binary/large-file
candidates. One match is an **unchanged pre-existing localhost/test fixture URL**
in `backend/test/demo.wallet.test.js`; its value is redacted in the scan output.
No new credential-pattern finding, unexpected binary or file above 10 MiB was
found. This is a scoped heuristic scan, not proof that all possible secrets can be
detected. Full diff of `contracts/`, `evidence/` and `shared/` is empty.
The PostgreSQL ZIP, data directory, logs and browser artifacts remain ignored.
Unrelated pre-existing untracked hosting/smoke files were left as found.

## Rollback

1. Disable new demo execution and revoke test invites through authenticated admin
   controls. Do not broadcast an emergency contract transaction without approval.
2. Record/reconcile every approved/submitted/unknown hash. Retain gate, reservations,
   approvals, obligations and audit data. A timeout is not evidence of non-payment.
3. Restore the previous frontend if needed; keep additive migration 006 and records.
   Do not drop tables, rewrite migration history or restore a stale database over
   transaction evidence. Preserve a backup and the currently deployed revision.
4. Keep execution disabled if reverting the backend: an older executor ignores the
   Treasury gate/reserve behavior. Do not run that executor with pending authority
   or unknown transactions. Resolve receipts first and review compatibility before
   re-enabling any executor. Prefer retaining the verified safety fixes.
5. Verify health, evidence and session denial after rollback. Historical contracts
   and free hosting plans require no modification.

## Reproduce the isolated checks

```powershell
cd D:\AgentWallet\backend
node --max-old-space-size=384 --wasm-num-compilation-tasks=1 --test --test-concurrency=1 test/

cd D:\AgentWallet\frontend
npx vitest run --pool=forks --maxWorkers=1 --minWorkers=1
npx playwright test

cd D:\AgentWallet
# Use a disposable, loopback-only database named aw_release, never production.
$env:AW_ISOLATED_PG_URL='postgresql://aw_release@127.0.0.1:45432/aw_release'
node --max-old-space-size=384 --test --test-concurrency=1 backend/test/treasury.postgres.test.js
# Paid provider calls: only with explicit usage authorization and configured backend key.
$env:LIVE_TREASURY_LLM='1'
node --max-old-space-size=384 --test --test-concurrency=1 backend/test/live/treasury.live.test.js
Remove-Item Env:LIVE_TREASURY_LLM
node --max-old-space-size=384 --wasm-num-compilation-tasks=1 scripts/treasury-local-smoke.mjs
```

The local PostgreSQL tests generate only fresh local schemas. Real GPT tests may
incur approved OpenAI usage; default test runs do not enable them automatically.
