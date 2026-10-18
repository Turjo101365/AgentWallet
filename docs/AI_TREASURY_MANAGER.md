# AI Treasury Manager — 2026-10-17

## Scope and repository audit

This extends the existing React/Express/PostgreSQL application. No new dependency,
hosting service, signer, contract deployment or public-chain transaction is required by
the implementation. The deployed website is unchanged until a deployment is approved.

| Capability | Existing implementation | Reused / change |
|---|---|---|
| Treasury balance | `chainService.getSnapshot`, block-pinned contract balances | Reused; ETH overview separates agent gas |
| Portfolio analysis | `portfolioService`, actual balances, price feeds and task outflow estimates | Preserved; no new trading/valuation logic |
| Reserve policy | `policySettings.reserveFloors`, server minimum, `evaluatePolicy` | Reused for every transfer; serialized policy changes |
| Payment obligations | Task/grant ledger, no editable bill ledger | New scoped obligations linked to existing proposals |
| Payment affordability | Amount + approved/in-flight reservations + effective reserve | Reused at creation, approval and final execution |
| AI planning | Validated provider tools and conversation memory | Three treasury tools backed by deterministic calculations |
| Authorization | SIWE ownership; signed approvals/grants; demo confirmations | Unchanged; guests never gain reserve authority |
| Autonomous execution | Scheduler creates ordinary proposals, executor rechecks risk | Reused; no additional scheduler or executor |
| Audit logging | Persistent hash-linked audit and tool invocation records | Extended with obligation changes and proposal links |

Historical v1 evidence remains under `evidence/` and `submission/`. Historical v2
`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F` is separate from interactive v2
`0x59a33154288009e030aa2072De46D32fC7d40d85`. Both use Ethereum Sepolia
(11155111); this work does not modify either contract or verify their current live
state. The historical record of 12 successful v2 transactions and 26 verification
checks is preserved. Tests here deploy only to isolated local Hardhat chains.

## Delivered workflow

Treasury is now a primary navigation entry at `/treasury`. Existing deposit and
withdrawal screens remain at `/funding` and in Settings. Body text remains at least
16px with natural letter spacing.

1. Read actual ETH contract funds, protected reserve, approved/in-flight commitments,
   available funds and the separate agent gas balance.
2. Owners or invited demo sessions record up to 50 obligations per scope, with an
   approved recipient, label, exact ETH amount, due time, priority and description.
3. Edit, defer, mark planned or cancel an unprepared obligation. Version checks
   reject stale edits. Once prepared, review/reject its existing payment proposal;
   financial fields cannot silently change underneath an approval.
4. Inspect a deterministic plan and forecast for 7, 30 or 90 days. Suggested prompts
   open the existing AI composer; sending uses the configured real provider.
5. Prepare a bill as an ordinary proposal. Owner signatures, bounded grants and
   invite-gated demo confirmations remain necessary. Preparation never pays.
6. Follow the existing payment screen. Only an execution verified as CONFIRMED
   makes its obligation PAID. Hashes on unconfirmed/failed attempts are not receipts
   proving a successful payment.

Demo obligations belong to their authenticated session, not to every visitor of the
shared wallet. Shared treasury balances and reserve are intentionally shared.
Explore-only guests can inspect financial state and ask AI but cannot create or
prepare obligations. The existing generic demo AI draft capability is preserved;
it still cannot execute without an invited confirmation.

Lowering a configured reserve retains the existing second-confirmation safeguard:
the first request is refused with `LOOSENING_REQUIRES_OWNER_CONSOLE`; only an explicit
owner/admin confirmation may resend it with `confirmLoosening: true`. Neither path
can lower the server minimum. Raising a reserve does not require that extra step.

### Changed file groups

- `backend/src/services/treasuryMath.js`, `treasuryService.js`: financial rules,
  scoped obligations, plan and idempotent preparation.
- `backend/src/db/index.js`, `services/executorService.js`, `policySettings.js`,
  `reservations.js`, `repositories/index.js`, `proposalService.js`: shared locking,
  durable unknown commitments, receipt settlement and deterministic proposal IDs.
- `backend/src/routes/treasury.js`, `api.js`, `demo.js`, `admin.js`, `container.js`:
  existing authenticated operator/demo/personal and allowlisted admin integration.
- `backend/src/llm/tools.js`, `services/agentChatService.js`, `demoService.js`:
  bounded treasury tools, trusted principals and existing AI quotas.
- `frontend/src/pages/TreasuryManager.jsx`, routing and primary navigation: new
  workspace. Existing Treasury funding page is preserved at `/funding`. Home and
  Settings funding links are updated; AdminConsole and Agent gain relevant controls.
  Topbar controls wrap on narrow screens.
- New treasury math/integration/persistence/UI tests, existing demo authorization
  checks and refreshed legacy UI assertions; `scripts/treasury-local-smoke.mjs`.
- Additive migration 006, README and treasury documentation. No dependency/lockfile,
  credential, deployment configuration, contract, evidence or RL artifact changes.

## Calculation rules

All enforced ETH arithmetic uses `BigInt` wei. HTTP values are validated decimal
strings with at most 18 fractional digits and within uint256 range. No float
arithmetic, fiat price assumption, future income or AI-generated number is used.

- **Effective reserve:** maximum of the owner-configured ETH reserve and server floor.
- **Commitments:** approved/submitted native-asset proposals, plus failed attempts
  with a persisted transaction hash but no settled receipt. The current proposal
  is excluded during its own assessment. An intent already reflected on the
  block-pinned chain is excluded to avoid counting its outflow twice.
- **Available:** `max(balance - reserve - commitments, 0)`.
- **Upcoming:** unpaid, non-cancelled, non-failed obligations due before the selected
  horizon, including overdue bills and bills awaiting approval/queued for execution.
- **Health:** Insufficient funds when commitments exceed balance; otherwise Reserve
  at risk when balance minus commitments is below reserve; otherwise Limited funds
  when upcoming obligations exceed available funds; otherwise Healthy.
- **Order:** overdue before future; within those groups HIGH, NORMAL, LOW; then
  earliest due time; then UUID as a stable tie-breaker.
- **Plan:** greedily include each unprepared active obligation if it fits remaining
  funds above reserve, remaining daily capacity and per-payment cap, and its recipient
  is still approved. Pauses, disabled ETH, unauthorized executor and unavailable or
  excessive fees / insufficient agent gas also defer recommendations. A rejected
  obligation does not prevent checking later smaller bills.
- **Forecast:** `balance - commitments - selected outflows`. Signed distance from
  reserve is shown explicitly. The forecast may be negative when existing
  commitments already exceed funds; available-to-spend never is.

The plan is not an execution guarantee. Existing USD controls, actual simulation,
signed deadlines, current ownership, grants and demo transaction/fee quotas are
checked by the authoritative proposal and executor services. A deferred bill can be
submitted for an independent policy check; choosing a different priority never
waives reserve or authorization requirements.

Future task occurrences remain forecasts on Portfolio/Automations. They are not
subtracted again as approved commitments until they create approved payment
proposals. The Treasury forecast covers this page's recorded obligations and
already approved/in-flight payments; it is not a consolidated promise about all
future grant occurrences. No gas is charged to the contract treasury by this math:
the existing agent EOA pays it separately.

## Data flow and API

`Treasury / AI → treasuryService + treasuryMath → proposalService → existing approval
or demo confirmation → riskEngine → executorService → verified receipt → obligation view`

- Migration `006_treasury.sql` adds scoped `treasury_obligations` and a singleton
  `treasury_execution_gate` in each existing deployment schema. No prior migration
  is changed. A proposal's UUID also identifies its originating obligation, making
  preparation idempotent after a crash between insertion and ledger linkage.
- `GET /api/treasury?days=7`, `GET /api/treasury/obligations` require a session.
- `POST /api/treasury/obligations`, `PUT .../obligations/:id`, and
  `POST .../obligations/:id/prepare` require the owner or an invited demo principal.
- `PUT /api/treasury/reserve` requires actual wallet ownership.
- Demo equivalents live under `/api/demo/sandbox/treasury`. Their reserve write is
  refused. SIWE + the server admin allowlist protects
  `PUT /api/admin/demo/treasury/reserve`, exposed in existing Demo administration.
- Personal sandboxes reuse these routes through their existing owner-verified
  container and separate database schema. No user-supplied RPC or signer is accepted.
- AI tools: `get_treasury_overview`, `generate_treasury_plan`, and
  `prepare_treasury_payment`. Existing `set_reserve_floor` remains owner-only and
  cannot lower a reserve. All action tools require a recorded plan first. Demo tool
  scopes contain no reserve mutation, signing or approval tool.

AI summaries show at most eight obligations/recommendations per tool response and
state the full record count. Forecast totals are computed from the entire ledger,
which remains visible in Treasury. Descriptions are excluded from model context;
recipient labels are still treated as untrusted data. This keeps structured JSON
within existing public output/context limits rather than silently truncating it.

## Threat model and controls

| Threat | Control / limit |
|---|---|
| UI role or forged obligation owner | Server-derived owner/demo principal; strict schemas reject scope fields |
| Cross-session/wallet reads | Scope filter on every ledger operation; existing sandbox schema isolation |
| Recipient/amount substitution | Linked obligation immutable; existing exact approval signatures and final authorization checks |
| Prompt injection | Descriptions treated as untrusted data; tools return deterministic results; no approve/sign/execute tool |
| Concurrent payments / repeated preparation | Database advisory lock and durable unresolved gate; deterministic proposal ID; unique links |
| Pooler / process restart | PostgreSQL **transaction-scoped** advisory try-lock, compatible by design with transaction poolers; persistent unknown hashes hold the gate |
| Lost database lock / commit acknowledgement | Hash and submitted status commit on the same locked PostgreSQL transaction connection; broadcast happens only after commit succeeds |
| Stale funds / changed reserve | Fresh block-pinned risk checks at creation, approval and execution; reserve writes serialize with signing and refuse unresolved sends |
| Unknown / failed chain outcome | Unknown hashed transactions remain reserved; receipt reconciliation precedes release; no paid state without verified success |
| Scheduled reserve bypass | Existing scheduler's proposals use the same risk and executor services; grants do not bypass the reserve |
| Missing state | Database, balance or allowlist read failures reject the operation; no guessed values |

This reserve is **application policy**, not an on-chain invariant. A contract owner
can still withdraw directly using existing owner/emergency functions or operate
outside this backend. Protecting against that would require contract changes, which
are outside this work. Database administrators and signing secrets remain trusted.

An unresolved hash may intentionally hold execution until receipt reconciliation.
If a different process owns the advisory lock, execution is deferred and audited;
the existing recovery path can resume approved proposals. No public unlock/bypass
endpoint is added. When unknown transactions have no discoverable receipt, an
operator must investigate; quotas and reserves are never silently freed on timeout.

## Verification status

- **IMPLEMENTED AND TESTED:** deterministic calculations; scoped ledger; owner/invite
  authorization; ordinary payment preparation; reserve checks in manual and task
  execution; local receipt linkage; UI forms and AI prompt handoff; responsive layout.
- **VERIFIED IN LOCAL RELEASE CHECKS:** real GPT-4.1-mini planning/preparation tool calls;
  PostgreSQL 17.11 migration, cross-instance locks, connection-loss safety and restart
  persistence in a disposable local database. See the release-readiness report.
- **UNVERIFIED:** advisory locking through the actual hosted Neon pooler; hosted
  migrations/restart and the new feature's Sepolia execution. These require a
  separately approved deployment/smoke check.
- **NOT IMPLEMENTED:** swaps/trading/investment optimization; hypothetical deposits;
  consolidated forecast of every future grant occurrence; dependable 24/7 scheduling;
  contract-enforced reserve; editing financial fields of an already prepared bill.

A rejected/failed prepared bill requires a new obligation/proposal to retry after
funding or policy changes; old authorizations are not silently resurrected. The
50-record cap includes historical obligations within that owner/session scope.

Default tests use explicit model test doubles, real local EVM transactions and
PGlite. Opt-in release checks additionally use actual GPT-4.1-mini and a disposable
PostgreSQL server; they do not verify a hosted Neon connection or general model
quality. Detailed current results and rollback instructions are in
[TREASURY_RELEASE_READINESS.md](TREASURY_RELEASE_READINESS.md). Initial implementation
results remain recorded in [TREASURY_TEST_RESULTS.md](TREASURY_TEST_RESULTS.md).

## Judge demonstration

Local verified scenario: an isolated local treasury starts with **0.0004 ETH**,
protected reserve **0.0002 ETH**, urgent bill **0.0001 ETH**, and later bill
**0.0002 ETH**. It is explicitly labelled a local chain; no Sepolia proof is claimed.

1. Open Treasury as the authenticated owner (or a newly invited demo session after
   deployment). The demo admin sets the shared reserve; judges cannot change it.
2. Record the two obligations using actual approved recipient addresses.
3. Click “Prioritize my upcoming payments”; send in AI Assistant when a provider is
   configured. Inspect recorded tool data, exact balances and the untrusted-data rule.
4. Return to Treasury: urgent bill fits; the other is deferred in the combined plan.
5. Prepare the urgent bill. Review the existing Payments screen, then sign its exact
   owner approval or explicitly confirm the invite-gated demo authorization.
6. Wait for the verified receipt. Treasury marks only this bill paid and reads the
   updated chain balance. Inspect its actual transaction; do not substitute local
   hashes for public evidence.
7. Check the second bill's policy: the resulting proposal is rejected to protect
   the reserve, with `BALANCE_AND_RESERVE` recorded. No second payment occurs.

For the public sandbox, use its actual current balance and remaining quotas rather
than assuming these local amounts. No public bill is seeded by this change.

## Deployment and rollback boundary

No automatic commit, push, deployment, funding or production mutation is performed.
No new credential/environment variable is needed. Existing Vercel/Render/Neon free
services and backend-only OpenAI configuration are retained.

After approval: disable new demo execution, let in-flight sends settle, deploy the
backend with additive migration 006, stop old backend instances before re-enabling
execution, then deploy the frontend. Check pg migration persistence and advisory
lock contention/restart behavior on the hosted service before any approved Sepolia
payment. Verify CORS, `/treasury`, `/funding`, session isolation, and one bounded
AI analysis with the actual provider. Historical evidence contract remains untouched.

Rollback: disable demo execution first; retain all tables, records and unknown hash
reservations; restore the previous frontend. Do not revert to an executor that
ignores an unresolved treasury gate while authorizations or transactions are pending.
Recover/verify outstanding receipts before considering a backend rollback.
