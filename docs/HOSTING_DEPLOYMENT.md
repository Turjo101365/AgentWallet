# Vercel + Render deployment plan

Prepared 2026-10-17. STOP before creating resources, deploying, adding production secrets or changing DNS: owner approval is required. No new contract is needed. Do not enable or fund the public evidence contract.

## Recommended configuration and cost

| Resource | Prepared setting | Estimated monthly cost (USD) |
|---|---|---|
| Vercel static frontend | Repository root directory frontend; Vite; HTTPS; production branch main | Hobby $0 if eligible for personal/non-commercial use; otherwise Pro starts at $20 |
| Render Node web service | One 0.5c-512mb instance (formerly Starter), Singapore | Published $7/month; no additional worker |
| Render PostgreSQL | 0.1c-256mb, 1 GB disk, same region, external access denied | Published $6/month compute; page lists 1 GB included and expandable storage at $0.30/GB; confirm allocation charge at checkout |
| RPC | Read-only Ethereum Sepolia provider | Public endpoint has no SLA; optionally a separate quota-limited provider plan |
| AI | Off by default | $0 while off; usage-based provider bill only after explicit enablement |

Published base is $13/month with eligible Vercel Hobby and Render Hobby workspaces. Reserve up to $0.30/month if the selected 1 GB allocation is billed separately; request approval for a $14/month base-resource ceiling before provisioning. Vercel Pro adds at least $20/month and requires separate approval. Taxes and usage overages are additional, not covered by that ceiling: Render Hobby currently includes 5 GB outbound bandwidth/month (then $0.15/GB) and 500 standard build minutes (then $5/1,000 minutes). Use provider subdomains, no paid RPC or AI, no extra seats, and no automatic storage expansion. Verify the final account-specific quote before creation; stop if it differs from the approved configuration.

Render Free web services sleep after 15 minutes, can take about a minute to wake, and lose local files on restart. Free Render Postgres expires after 30 days and has no backups. They are unsuitable for a reliably available judging link. No background worker is needed because this profile has no autonomous execution.

Current provider sources (checked 2026-10-17): [Render pricing](https://render.com/pricing), [free-service limits](https://render.com/docs/free), [compute plan IDs](https://render.com/docs/compute-plans), [Vercel pricing](https://vercel.com/pricing), [Vercel Hobby eligibility](https://vercel.com/legal/terms). Account dashboards control actual billing and availability.

## Manual account setup and approval

1. Approve the hosting budget, GitHub repository access, region and whether optional live AI may be enabled. Obtain separate approval for committing/merging this preparation.
2. Create or use team-owned Vercel and Render accounts. Connect only Turjo101365/AgentWallet. Enable account MFA. Do not share recovery codes or API keys in Git/chat.
3. Confirm Vercel plan eligibility, the actual Render service/database prices, backup retention and spending alerts. No custom domain is required; vercel.app and onrender.com provide HTTPS.
4. Select exact production frontend/API hostnames. Register neither arbitrary Vercel preview origins nor wildcard domains in production CORS.
5. After approval, configure protected deployment environments and secret values in provider dashboards. The prepared render.yaml does create paid resources if applied; do not click Deploy Blueprint before approval.

## Exact environment names

### Frontend (Vercel, build time)

| Name | Setting |
|---|---|
| VITE_APP_MODE | judge |
| VITE_API_URL | Approved public Render HTTPS URL followed by /api |

Never put RPC provider keys, LLM keys, DATABASE_URL or any wallet credential in VITE_* variables; these values are shipped to browsers.

### Backend (Render)

| Name | Setting |
|---|---|
| NODE_ENV | production |
| NODE_VERSION | 22 |
| HOST | 0.0.0.0 |
| PORT | Supplied by Render; do not hard-code |
| APP_MODE | judge |
| CHAIN_ID | 11155111 |
| DEPLOYMENT_FILE | contracts/deployments/sepolia-v2-full.json (root working directory) |
| APP_ORIGIN | Exact approved frontend HTTPS origin, no trailing slash |
| CORS_ORIGINS | Same exact origin; comma-separated only for separately reviewed hosts |
| TRUST_PROXY | true (one trusted Render ingress hop; verify with smoke test) |
| DATABASE_URL | Render internal PostgreSQL connection secret; same region |
| RPC_URL | Read-only Ethereum Sepolia HTTPS RPC; use a quota-limited server-only URL |
| BACKGROUND_JOBS | false |
| ALLOW_PUBLIC_TESTNET_EXECUTION | false |
| PUBLIC_AI_ENABLED | false initially |
| PUBLIC_AI_DAILY_LIMIT | 30 (requests shared across the database, not a dollar limit) |
| LLM_PROVIDER | none initially |
| LLM_TIMEOUT_MS | 15000 |
| LOG_LEVEL | info |

Only if live AI is later approved: set PUBLIC_AI_ENABLED=true, LLM_PROVIDER=openai-compatible, LLM_BASE_URL=https://api.openai.com/v1, LLM_MODEL=gpt-4.1-mini and LLM_API_KEY in the secret manager. Alternatively an approved Anthropic provider uses LLM_PROVIDER=anthropic, LLM_MODEL and ANTHROPIC_API_KEY. No new live provider validation is claimed here.

Must be absent: AGENT_PRIVATE_KEY, LOCAL_DEV_AGENT_INDEX, AGENT_KEYSTORE_FILE, AGENT_KEYSTORE_PASSWORD, AGENT_KEYSTORE_PASSWORD_FILE, owner/deployer secrets, and AGENT_WALLET_ENV_FILE. Production does not load the local backend/.env by default.

No PGLITE_DIR or RL_SERVICE_URL is required. No session-signing secret or cookie-domain setting is needed: sessions use random server-stored opaque bearer tokens.

## Deployment commands and provider settings (after approval)

1. Commit and merge the reviewed hosting changes to main only after approval. Pin the approved commit as the release.
2. Render: use render.yaml from the repository root. Build command: npm ci --prefix backend --omit=dev. Start command: node backend/src/server.js. Health check: /health/ready. Keep one instance and automatic deployment disabled. The runtime needs committed shared/abi, contracts/deployments, database/migrations and evidence/sepolia-v2-full files; selecting backend as the Render root directory would omit them.
3. Create a NEW PostgreSQL database. The blueprint denies external DB connections and uses the internal connection URL. If using an external provider instead, require certificate-verified TLS (for pg, use the provider's verified connection string, e.g. sslmode=verify-full); never disable certificate verification to make it connect.
4. Startup applies migrations 001–003 transactionally; PostgreSQL advisory locking prevents competing starts applying the same migration. No PGlite-to-PostgreSQL data migration is necessary for the public profile: sessions start fresh and evidence stays committed. Never import historical signed approvals, grants, conversations or signer files. Keep existing evidence files byte-for-byte.
5. Set the approved exact frontend origin and RPC/database values in Render. Verify /health/ready returns ready and executionEnabled is false in /health before proceeding.
6. Vercel: import the repository with Root Directory frontend. Install npm ci; build npm run build; output dist. frontend/vercel.json supplies SPA rewrites and response headers. Set both VITE_* values for Production only. A changed API URL requires rebuilding the frontend.
7. Select the approved main release. Confirm a direct load/reload of /judge/evidence, /judge/agent and /judge/guide returns the React app.
8. Run the smoke checklist below. Share the URL with judges only after it passes.

Do not run contracts/scripts/deploy.js or any sepolia:* / v2:execute / demo:sepolia command for hosting. No funding, private key, contract change or transaction broadcast is needed.

## Production smoke checklist

- Open the frontend in an incognito desktop browser with no wallet. All four judge pages work.
- Repeat on a 390-pixel mobile viewport. Navigation wraps; table scrolls inside its container.
- See Ethereum Sepolia 11155111 and the exact public v2 address. Live read shows paused=true and zero agent, with a read timestamp and block number.
- Evidence contains 12 historical receipts and the recorded 26 security checks. Explorer URLs use sepolia.etherscan.io; no mainnet links or claims of fresh execution.
- Refresh deep links. Confirm HTTPS, no mixed content, correct API URL, no missing JS assets.
- POST /api/public/assess with 0.0001 ETH to the evidence recipient reports actual pause/executor blockers. Above-cap input adds the cap failure. A request with overrideState is rejected.
- POST /api/proposals, /api/tasks, /api/agent/chat and /api/automation/resume returns 403 JUDGE_READ_ONLY, even with an owner session. There is no signing/execution button.
- Check an allowed-origin OPTIONS preflight allows Content-Type/Authorization and only the approved origin. A foreign Origin is rejected; no access-control-allow-credentials header appears.
- If testing optional SIWE, sign only the sign-in message from the approved domain; a viewer stays a viewer. No EIP-712 execution is enabled. Test expired/replayed nonces and account-change logout on a separate test wallet.
- /health/live is 200. /health/ready is 200 with database ok, chain ok and safeStopped=true. Provider outages produce degraded readiness and an explicit unavailable live-state message.
- Restart Render. Confirm PostgreSQL remains connected, migrations are idempotent and session/quota state survives. No PGlite data or RL model load appears.
- If live AI was approved, verify an ordinary question and a malicious spending request; only assess_transfer is advertised. Verify three/IP/hour and daily quota. Inspect only redacted logs; do not publish raw sessions/prompts or provider keys.
- Check Render logs for request IDs and migration summary; no RPC credentials, DB password, bearer token or private key. Set uptime and spending alerts.

## Rollback

1. Disable PUBLIC_AI_ENABLED first if abuse/cost is suspected; no chain action is necessary.
2. Restore the previous approved Render deploy and Vercel deployment with the SAME database and judge safety flags. Never roll back to a release without judge mode: use a maintenance page instead.
3. Migration 003 is additive. Do not drop tables or downgrade the database during a code rollback. Take a managed backup before future schema changes; restore into a separate database and verify it before repointing DATABASE_URL.
4. If API readiness fails, keep the frontend's evidence links/maintenance message visible and fix RPC/origin/DB configuration. Rebuild if VITE_API_URL changed.
5. Never unpause the public contract, set an agent or import historical approvals as a hosting rollback step.
