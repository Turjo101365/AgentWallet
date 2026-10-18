# Treasury Manager — controlled hosted verification

Date: 2026-10-18. **GO for the deployed read-only Treasury experience. NO-GO for
payment execution: it remains disabled and requires a separate explicit approval.**

## Deployed release

- Website: https://agentwallet-judge.vercel.app/treasury
- Backend readiness: https://agentwallet-judge-api.onrender.com/health/ready
- Reviewed application PR: https://github.com/Turjo101365/AgentWallet/pull/11
- Application release: `b19223bad6656ea48096c5f82acee980aa27f8ae`.
- Render deploy: `dep-dba6vtgm7kps73fnl830`, succeeded/live; existing Free service,
  Singapore, one instance, automatic deployments off.
- Vercel production deployment: `agentwallet-judge-8g9a9khqo-sampritys-projects.vercel.app`.
  Existing Hobby project; exact release frontend source archived from Git, with
  unrelated untracked files excluded. Remote build succeeded; production alias checked.
- Existing Neon PostgreSQL 18.6. No new resource, hosting upgrade, contract deployment,
  funding transfer or blockchain transaction was performed.
- Existing backend AI/signing credentials unchanged. Only six nonsecret execution
  ceilings were changed to zero. No key or connection URL entered Git/frontend output.

## Deployment order actually completed

1. Saved prior deploy/configuration and a PostgreSQL 18 custom-format database dump
   encrypted using Windows DPAPI/current-user ACLs under ignored `secrets/`.
   `pg_restore --list` accepted the archive; size 139,963 bytes; SHA-256
   `d7ef4a59ee520018cca392b7b059440f171c8fdca7e060abef89bc3b393efce9`.
   Native backup used verified hostname/TLS with the trusted CA bundle; no insecure
   TLS fallback or plaintext database dump was used.
2. Confirmed no APPROVED/SUBMITTED proposals or unresolved transaction hashes.
   Disabled persisted execution in `public` and `sandbox_demo`, merged zero caps,
   saved six zero Render environment ceilings and read them back.
3. In unregistered schema `release_verify_20261018`, verified migrations 001–005 →
   006, idempotency, actual two-pool advisory lock contention/release, rollback,
   exact 30-digit NUMERIC storage and persistence after reconnecting. No wallet
   registration, financial fixtures or signing credentials were added to that schema.
4. Reviewed/staged 42 intended files, scanned exact staged contents, and passed
   `git diff --cached --check`. Findings were only an unchanged public Hardhat local
   test key and unchanged dummy localhost test database credentials. No binary,
   browser/session artifact, real credential or contract/evidence change was staged.
   Committed with Samprity Haque identity, pushed and merged reviewed PR #11.
   No GitHub CI/status checks are configured; the recorded full local suites were
   the automated test evidence. No independent human code review is claimed.
5. Briefly suspended the old Render service. Render rejected deployment while
   suspended, so resumed the same Free service and immediately deployed the exact
   release SHA. Startup applied 006 once in both existing application schemas.
   No paid-only maintenance mode or new service was used.
6. Built the exact frontend source on Vercel, promoted it to production, and checked
   actual HTTPS routes/assets and the backend API.
7. Requested a real backend restart. Render recorded `server_restarted` at
   `2026-10-18T07:12:18.885734Z`. Rechecked readiness, sessions, database canary,
   migrations, gates, audit chains and unchanged on-chain balances/nonces.

## Hosted results

| Check | Actual result |
|---|---|
| Readiness | HTTP 200; database OK, Sepolia OK, frozen evidence safe-stopped |
| Migration | 001–006 exactly once in `public` and `sandbox_demo`; new tables/gates present |
| Existing financial data | public 0 proposals/0 executions; demo 2 proposals/1 execution, unchanged |
| Treasury | ETH balance 0.0004, protected reserve 0.0002, 0 obligations; balance matched pinned-block RPC |
| Persistence | Isolated Neon canary, demo bearer session and real SIWE viewer session survived backend restart |
| Audit/gates | Both audit chains valid; treasury and relay gates null; no unresolved hashes |
| Real SIWE | Unfunded ephemeral test wallet signed actual hosted domain/chain challenge; viewer session valid; nonce replay 401; nonadmin access 403 |
| Admin SIWE | User confirmed allowlisted MetaMask sign-in/admin console; database recorded approved address sign-in at 07:12:56.306Z. No admin session fabrication or token extraction |
| Authorization | Missing/forged admin sessions 401; operator writes 403; guest reserve/obligation writes 403; guest confirmation 403 INVITE_REQUIRED |
| CORS | Exact production HTTPS origin accepted; untrusted origin not authorized |
| Browser | Fresh incognito-style guest journey; Treasury/Funding/Agent/Proposals/Automation/Audit/Evidence direct routes HTTP 200; no page errors or API 5xx |
| Mobile | 390px Treasury view loads, no horizontal overflow |
| Public assets | New Treasury bundle present, CSP returned; no common API-key/database-password/private-PEM patterns in actual served JS |
| Evidence | All 12 successful historical receipts and 26 recorded verification checks exposed; current evidence contract paused, agent zero |
| Actual AI | Hosted openai-compatible GPT-4.1-mini, COMPLETED; 2 model calls; get_treasury_overview and generate_treasury_plan both OK; 3160 input/182 output tokens; no action/proposal/signature/transaction |
| Restart chain comparison | Owner nonce 1, agent nonce 1, sandbox balance 0.0004 ETH before and after; unchanged |

The readiness field `providerVerified` belongs to the separate public evidence AI
endpoint; it is not evidence of the demo chat test. The genuine hosted demo Treasury
tool invocation ledger above supplies that evidence.

## Execution-disabled configuration

Both production schema switches are false. Both persisted JSON limits and these
Render environment values are zero:

```text
DEMO_MAX_TX_PER_SESSION=0
DEMO_DAILY_TX_LIMIT=0
DEMO_DAILY_AMOUNT_ETH=0
DEMO_MAX_GAS_PER_TX_ETH=0
DEMO_SESSION_GAS_ETH=0
DEMO_DAILY_GAS_ETH=0
```

Retained: `APP_MODE=judge`, `CHAIN_ID=11155111`, `BACKGROUND_JOBS=false`,
`ALLOW_PUBLIC_TESTNET_EXECUTION=false`, live GPT-4.1-mini and existing quotas.
All secrets remain backend-only. Dedicated owner gas ceiling zero also blocks
server-signed emergency broadcasts. No emergency control, grant, approval or
payment was exercised. No zero ceiling may be raised during this verification.

## Remaining limitations / unverified items

- The old smoke invite is refused with INVITE_INVALID and the previous invited
  session expired. An actual hosted **invited-session** confirmation returning
  DEMO_EXECUTION_DISABLED is UNVERIFIED; no invite/authentication bypass was used.
  Local authorization tests passed and actual persisted switches/zero caps are
  verified, but this hosted check needs a fresh admin-issued invite before a payment.
- New Treasury payment on public Sepolia remains intentionally UNVERIFIED. There
  are no production Treasury obligations yet; the existing one confirmed sandbox
  execution predates this release. The full payment workflow passed locally only.
- Direct owner withdrawals remain outside the application reserve invariant.
  Unattended scheduling stays disabled; no always-on free-worker claim is made.
- Render Free can sleep/cold-start and Neon Free can suspend idle compute. There
  is no production SLA, paid maintenance mode or paid persistent disk/worker.
- Vercel build reported 14 dependency advisories including development tooling.
  A production-only frontend audit reports two moderate package entries
  (react-router and react-router-dom), zero high/critical. Router advisories concern
  crafted navigation and SSR hydration; this app is a static SPA, but these remain
  recorded advisories. No dependency change was introduced in this release; no
  unrelated major upgrade or `npm audit fix --force` was performed.
- Admin console confirmation is from the human user's real Chrome/MetaMask flow,
  corroborated by hosted SIWE database records; automated Chrome extension UI
  inspection was unavailable. No public payment signature was requested.

## Exact rollback targets

Keep **all current zero caps and persisted false switches** during any rollback.
Do not restore the old environment snapshot wholesale or clear any uncertain gate.

Frontend, from the existing linked Vercel project:

```powershell
npx vercel rollback https://agentwallet-judge-6f6e3otwk-sampritys-projects.vercel.app --yes
```

Backend: redeploy prior application commit
`62d63df9fd43e2554a970d364893c2dd83dc7257` to the **same** Render service via Manual
Deploy → Deploy a specific commit, retaining **current disabled configuration**.
Equivalent authorized API request:

```text
POST /v1/services/srv-db9ji1qjnfac73chful0/deploys
{"commitId":"62d63df9fd43e2554a970d364893c2dd83dc7257","clearCache":"do_not_clear"}
```

Keep additive migration 006 and every record. Do not drop tables, restore a stale
dump over newer evidence or re-enable the old executor. Prefer a reviewed forward
repair. Verify readiness, evidence, authentication, zero caps, audit chains and
unchanged chain state afterwards. Protected backups are last-resort recovery
material, first restored only into an isolated environment after separate review.

## Separate future payment gate

No payment is approved by this report. Before requesting approval: obtain a fresh
admin-issued invite, verify its disabled-execution refusal, select exactly one
payment amount and the approved recipient, and present exact temporary transaction,
treasury and gas ceilings. Use only sandbox
`0x59a33154288009e030aa2072De46D32fC7d40d85` on Sepolia 11155111 and recipient
`0xd85cdB676877ccdc8873B63DEf51B456568604F5`; preserve the 0.0002 ETH reserve and
historical evidence contract. Present actual preflight/gas conditions and require
explicit human approval before any authorization signature or broadcast. Restore
all false switches/zero caps after the single approved attempt, including failure.
