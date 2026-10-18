# Treasury Manager — controlled deployment sequence

Authorized scope, 2026-10-18: deploy the completed application to the existing
Vercel Hobby / Render Free / Neon Free services, validate hosting and authentication,
and keep all Treasury payments disabled. **No blockchain transaction is approved
by this rollout.** A later payment requires its own explicit approval with exact
amount, recipient and fee ceiling. There is no contract deployment or funding step.

## Targets and release discipline

- GitHub: `Turjo101365/AgentWallet`, branch `feature/ai-treasury-manager` → reviewed
  PR → `main`. Commit identity: Samprity Haque. No co-author trailer/history rewrite.
- Existing API: `https://agentwallet-judge-api.onrender.com`, Render service
  `srv-db9ji1qjnfac73chful0`, Free, Singapore, one instance, automatic deploys off.
- Existing website: `https://agentwallet-judge.vercel.app`, existing Vercel Hobby
  project `agentwallet-judge`. Do not create a new project, plan or domain.
- Existing Neon database: retrieve its connection only from Render's secret
  configuration into process memory. Never print it or place it in a CLI argument.
- Evidence: `0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`, unchanged/read-only.
- Sandbox: `0x59a33154288009e030aa2072De46D32fC7d40d85`, unchanged, Sepolia 11155111.
- No new hosting resource or paid upgrade. Keep actual existing AI model/key and
  quotas. No feature-development cycle or repeat full local test suites.

## 1. Snapshot and stop payment admission before publishing

1. Record existing Render live deploy ID/commit, Vercel production deployment URL,
   GitHub main SHA, environment variable **names**, and current database versions.
2. Back up the complete Render environment using local Windows-user DPAPI encryption
   and a current-user-only ACL under ignored `secrets/`. This is rollback material,
   never a Git artifact. Keep the current protected wallet/key stores unchanged.
3. Inspect existing `public`, `sandbox_demo`, and registered `personal_*` schemas.
   Record migration names, proposal/execution counts, approved/submitted payments,
   unresolved hashes, relay/treasury gates and audit-chain state. If there is any
   pending signed or broadcast payment, stop deployment and investigate with
   read-only RPC; do not clear its gate, delete it or re-sign it.
4. In a transaction, lock the existing `sandbox_demo.demo_settings` singleton and
   set `execution_enabled=FALSE`. Merge the temporary zero ceilings below into its
   JSON `limits`, preserving every other setting. Record operator/time in
   `updated_by` / `updated_at`. This disables both shared-demo and personal relay
   subjects. Keep the main schema's unused switch false as well.
5. Save the same **zero ceilings** as service-level Render environment variables;
   update only these nonsecret keys. Do not replace the entire environment list.
   Automatic deploys remain off. Read back the settings before triggering deploy.

| Required variable | Verification value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_MODE` | `judge` |
| `CHAIN_ID` | `11155111` |
| `BACKGROUND_JOBS` | `false` |
| `ALLOW_PUBLIC_TESTNET_EXECUTION` | `false` at the root/evidence container |
| `DEMO_ENABLED` | `true`, allowing the real dashboard/AI/read-only Treasury |
| `DEMO_MAX_TX_PER_SESSION` | `0` |
| `DEMO_DAILY_TX_LIMIT` | `0` |
| `DEMO_DAILY_AMOUNT_ETH` | `0` |
| `DEMO_MAX_GAS_PER_TX_ETH` | `0` |
| `DEMO_SESSION_GAS_ETH` | `0` |
| `DEMO_DAILY_GAS_ETH` | `0` |
| `PUBLIC_AI_ENABLED` / `JUDGE_REQUIRE_LIVE_AI` | `true` / `true` |
| `LLM_PROVIDER` / `LLM_MODEL` | `openai-compatible` / `gpt-4.1-mini` |
| `APP_ORIGIN` / `CORS_ORIGINS` | `https://agentwallet-judge.vercel.app`, exact origin |

JSON limit keys: `maxTxPerSession`, `dailyTxLimit`, `dailyAmountEth`,
`maxGasPerTxEth`, `sessionGasEth`, `dailyGasEth`, all zero. Preserve the 0.0001 ETH
per-payment amount ceiling, reserve floors, allowlist, grants and existing usage
counters. Do not reset quotas or revoke on-chain grants as a deployment shortcut.

`ALLOW_PUBLIC_TESTNET_EXECUTION=false` alone is insufficient: the separate sandbox
container intentionally has its own restricted executor. The persisted switch is
checked for demo/personal relay subjects, including restart recovery; zero
transaction/gas ceilings add a second barrier. A zero owner gas ceiling also refuses
server-signed emergency transactions. Do not click emergency/enable/confirm controls
during verification. Leave all sandbox credentials in backend secrets only.

## 2. Back up and verify actual Neon before production migration

1. Verify the connection uses `sslmode=verify-full`, an authenticated TLS socket,
   the intended Neon endpoint and the existing free project. Record actual server
   major version and whether the actual endpoint is direct or pooled.
2. Use matching-major `pg_dump` (the inspected database is PostgreSQL 18). Pass
   credentials through the child environment, never command arguments. Encrypt the
   custom-format dump directly into a protected DPAPI file under `secrets/`; retain
   its digest and verify `pg_restore --list`. Do not write a plaintext dump to Git.
3. Create one clearly named **isolated schema** in the existing database, without
   registering it as a wallet or adding any signer. This creates no paid resource.
4. In that isolated schema, use the application's migration adapter to apply
   001–005, insert a nonfinancial canary, apply exactly `006_treasury.sql`, then
   repeat migration and require zero pending files. Canary data must survive.
5. Open two real database pools for that schema. Verify transaction advisory lock
   contention, release after rollback, rollback of writes, exact NUMERIC values,
   and persistence after all connections close and reopen. Keep a tiny labelled
   canary until the hosted restart check. Never run the localhost-only financial
   regression fixture against production tables.

## 3. Publish the reviewed release through GitHub

1. Review only intended Treasury implementation, tests, safety fixes and deployment
   documentation. Exclude existing unrelated untracked hosting/smoke files and all
   `work/`, `secrets/`, local databases, browser profiles and generated binaries.
2. Scan staged contents for credentials and unexpected artifacts; run
   `git diff --cached --check`. Check no contract/evidence files changed.
3. Commit with the configured Samprity Haque identity, push the feature branch and
   create a PR to `main`. Review the exact PR diff and CI results. Do not merge a
   failing required check; do not rewrite historical commits or force-push.
4. Merge through the PR workflow. Record the exact resulting main release SHA.
   Do not claim a deployed release merely because code was merged.

## 4. Backend migration/deployment with execution still disabled

1. Confirm the database switch/zero limits and Render zero environment values are
   still present, and no pending execution appeared. Prevent mixed old/new backend
   writers by stopping the old service for the maintenance window before migration
   activation. Do not change the Free plan, instance count or region.
2. Deploy the exact reviewed main SHA to the existing Render service. Build:
   `npm ci --prefix backend --omit=dev`; start: `node backend/src/server.js`.
   Keep Render platform health polling on `/health/live`.
3. Startup calls `migrate()` in each active container schema. It obtains PostgreSQL
   transaction advisory lock `(11155111,3)`, applies pending SQL and records the
   migration filename in the **same transaction**. Existing schemas should apply
   only `006_treasury.sql`. It adds `treasury_obligations`, its scoped index and the
   one-row `treasury_execution_gate`; earlier migration files are unchanged.
4. Check Render deploy ID/commit/live status. Require `/health/ready` 200, database
   connectivity and current frozen evidence safe-stopped state. Health readiness
   alone does not prove the demo sandbox is ready: check `/api/demo/status` too.
5. Query actual production schemas: migrations 001–006 exactly once; one null
   treasury gate; existing records/counts preserved; execution switch false and
   effective limits zero. Personal schemas migrate on first authorized creation;
   no unregistered sandbox should be started merely to apply a migration.
6. If any gate is unresolved, migration fails, demo is unavailable, certificate
   validation fails or execution becomes enabled, stop and follow rollback.

## 5. Frontend deployment and hosted read-only smoke checks

1. Deploy the same reviewed revision to the existing Vercel project. Frontend build
   directory: `frontend`; build `npm ci && npm run build`; output `dist`.
   Use `frontend/vercel.json` for SPA rewrites and security headers.
2. Public build variables only: `VITE_APP_MODE=judge` and
   `VITE_API_URL=https://agentwallet-judge-api.onrender.com/api`. No key, database
   URL or signer credential is allowed in `VITE_*` or built assets.
3. Require HTTPS and correct API origin, direct reload of `/treasury`, `/funding`,
   `/agent`, `/admin` and evidence routes, usable 390px navigation and no console
   errors. The Owner/Admin console is selected from the role selector, rather than
   a separate `/admin` application route. Public historical evidence stays separate
   from live sandbox data.
4. Fresh guest/demo session: GET Treasury balance/reserve/commitments/forecast,
   scoped obligations, proposals and history. Compare returned block/address/balance
   with read-only Sepolia RPC. No payment, grant or owner operation is submitted.
5. Test authentication: real SIWE **sign-in signature only** from the allowlisted
   admin wallet; verify `/api/admin/me`, reject missing/forged sessions, and verify
   guest/nonallowlisted sessions cannot mutate reserves or access admin operations.
   Wallet transaction/signature approvals for payments are not part of this stage.
6. Verify a confirmation attempt on an **unknown UUID**, using no real pending
   proposal, is refused by the disabled-execution check for an invited session.
   Missing/guest/operator endpoints must also stay blocked. Check database and
   on-chain agent nonce, balance, receipt counts and gates did not change.
7. One bounded live GPT-4.1-mini read-only Treasury analysis may be used under the
   existing AI usage approval: no proposal/task creation, no signatures/execution,
   no automatic POST retry. Preserve quota counts and record genuine tool usage.
8. Restart/redeploy the same backend revision with the same disabled settings.
   Recheck readiness, admin/session persistence, isolated canary, migrations,
   effective zero limits and unchanged receipts. Reopen a fresh database connection.

## 6. Stop before any public payment

Record the hosted results first. **This rollout leaves execution disabled.**
Only after those checks pass, present a separate approval request specifying:

- Exact Sepolia sandbox and chain 11155111.
- One proposed payment, **no more than 0.0001 ETH**, to
  `0xd85cdB676877ccdc8873B63DEf51B456568604F5`.
- Actual latest balance, application/server reserve, remaining daily/session
  budgets, gas estimate, gas limit, max fee/tip and maximum total ETH expenditure.
- Exact temporary one-payment/session/global cap and how the switch/zero ceilings
  will be restored afterwards. Never treat the previous 3/day allocation ceiling
  as approval for three new transactions.
- Explicit browser confirmation, server-demo authorization label, expected receipt
  checks and duplicate-confirmation refusal.

Do not raise the zero caps or switch execution on until that approval arrives.
The agent must not authorize its own payment. No historical contract operation,
new signer, new deployment or extra funding is part of that later request.

## Rollback procedure

1. Keep persisted execution false and all zero ceilings. Do not restore an encrypted
   environment snapshot wholesale: that would restore the previous nonzero limits.
2. Stop new writers; retain approved/submitted/unknown hashes and both relay/treasury
   gates. Investigate receipts using read-only RPC; do not clear uncertain state.
3. Repoint Vercel to the recorded previous production deployment if the frontend
   fails. Keep backend execution disabled and report the Treasury feature unavailable.
4. Retain additive migration 006, all obligation/proposal/execution/audit data and
   migration history. Do not drop tables or restore a pre-migration database over
   new transaction evidence. A failed transactional migration should leave the old
   schema/data intact; verify it before restarting.
5. Prefer a reviewed forward repair for backend issues. If reverting to the recorded
   older backend commit is necessary, deploy it with **current zero caps and false
   persisted execution**, never the old enabled configuration. Old executors do not
   understand Treasury reservations; do not resume their payment authority.
6. Restore encrypted backups only as a last-resort separately reviewed database
   recovery, first into an isolated schema/database. Never overwrite production
   data automatically. Preserve the current database and every uncertain hash.
7. Verify health, evidence, authentication, execution-disabled status and unchanged
   chain nonce/receipts after rollback. No rollback includes a blockchain transaction.

## Sources for provider operations

- [Render environment-variable updates](https://api-docs.render.com/reference/update-env-var)
- [Render deploy/restart behavior](https://render.com/docs/deploys)
- [Render exact-commit deployment](https://api-docs.render.com/reference/create-deploy)
- [Official PostgreSQL Windows binaries](https://www.enterprisedb.com/download-postgresql-binaries)

Actual release IDs, snapshots and smoke results are recorded separately after each
step; preparation is not evidence of a completed deployment.
