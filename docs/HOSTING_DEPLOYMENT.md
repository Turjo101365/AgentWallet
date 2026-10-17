# Free infrastructure, live AI, one public launch

Prepared 2026-10-17. This plan supersedes the former paid Render database/backend recommendation. Nothing has been provisioned. The owner has approved Vercel Hobby, Render Free and Neon Free deployment plus ONE low-cost live AI smoke request. No broader paid validation run or paid hosting is authorized. No initial AI-disabled public launch is permitted.

## Final provider selection and eligibility

| Resource | Selection | Recurring hosting cost / limits | Card and account gate |
|---|---|---|---|
| Frontend | Vercel Hobby Free, static React on global CDN, provider-generated vercel.app URL | $0; 100 GB fast transfer and 1 million CDN requests/month | Confirm personal/non-commercial Hobby eligibility; no Pro upgrade or paid add-ons. |
| Backend | Render Hobby workspace, one Free Node web service, Singapore | $0; 512 MB RAM, 0.1 CPU, 750 free instance hours/workspace/month, 5 GB outbound and 500 standard build minutes/month | MUST have no payment method. With a card, free services can incur bandwidth/build overages. If Render requires card verification or the workspace already has a card, stop; do not claim the zero-charge gate passed. |
| Database | Neon Free, one project/branch, AWS Singapore (ap-southeast-1), direct PostgreSQL endpoint | $0; 100 CU-hours/project/month, 1 GB/project, 5 GB egress/project/month; suspend after 5 idle minutes | Neon explicitly requires no credit card for Free. Verify the organization is Free, not Launch/Scale/trial. If selected region/plan is unavailable, stop and report it. |
| Domain | vercel.app and onrender.com | $0 | No domain purchase or DNS changes |
| Blockchain | Existing Ethereum Sepolia v2, chain 11155111, public read-only RPC | $0 provider charge using the existing public endpoint; no uptime SLA | No key, funds, signing, deployment or transaction |
| AI | Existing OpenAI API key, direct OpenAI GPT-4.1-mini integration | Paid API usage ONLY, at published $0.40/M input, $0.10/M cached input, $1.60/M output tokens | Existing OpenAI billing is separate from infrastructure. Do not put that payment method into hosting accounts. Explicit call approval required. |

Infrastructure total: $0/month. Free quotas can interrupt access; there is no always-on/SLA promise. Render sleeps after 15 idle minutes and typically takes about a minute to wake. It can suspend unusually high outbound API/database traffic even below ordinary quotas. Do not auto-upgrade or use keepalive pings to evade limits. Neon stops compute when CU/egress limits are reached; storage-growing operations fail at its storage cap without deleting the existing data. Its Free restore window is short (6 hours / limited changes), not a paid backup guarantee.

The owner explicitly selected Vercel Hobby. Confirm its personal/non-commercial eligibility in the account. A personal-repository collaborator cannot necessarily import the owner's repository; use the owner's authorized account or a supported local CLI deployment. Do not upgrade to Vercel Pro or change hosts without approval.

Account-level eligibility is PENDING: no provider dashboard or account state is inferred from published pricing. Verify no hosting payment method, no paid plan/trial, no paid add-ons, no extra instances, no storage expansion, and no upgrade automation before resource creation. Set the Render build spend limit to $0 where offered. If a host cannot satisfy these gates, report a blocker and propose another free host for approval. Application settings alone cannot control an administrator later adding billing or changing a plan.

Official sources checked 2026-10-17: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [static request pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Render Free](https://render.com/docs/free), [Render pricing](https://render.com/pricing), [Neon pricing](https://neon.com/pricing), [Neon plan enforcement](https://neon.com/docs/introduction/plans), [Neon regions](https://neon.com/docs/introduction/regions), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [GPT-4.1-mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations).

GPT-4.1-mini is retained exactly as requested. Official docs currently mark the GPT-4.1 mini snapshot deprecated, with shutdown January 14, 2027. Test the owner's actual model access after approval; report a blocker if unavailable, never silently substitute a model.

## Required configuration (names only; no secret values)

Frontend build: VITE_APP_MODE=judge; VITE_API_URL=<approved Render HTTPS origin>/api. These are public configuration only. Never put LLM_API_KEY, DATABASE_URL, RPC credentials or wallet secrets into VITE_*.

Backend environment:

| Name | Value / source |
|---|---|
| NODE_ENV / NODE_VERSION / HOST / PORT | production / 22 / 0.0.0.0 / Render-supplied |
| APP_MODE | judge |
| CHAIN_ID | 11155111 |
| DEPLOYMENT_FILE | contracts/deployments/sepolia-v2-full.json |
| APP_ORIGIN / CORS_ORIGINS | Exact approved vercel.app HTTPS origin, no trailing slash or wildcard; no previews |
| TRUST_PROXY | true; validate actual Render ingress/IP behavior during smoke test |
| DATABASE_URL | Neon Free DIRECT endpoint connection string, backend secret, sslmode=verify-full |
| RPC_URL | https://ethereum-sepolia-rpc.publicnode.com or separately approved free Sepolia provider |
| PUBLIC_AI_ENABLED / JUDGE_REQUIRE_LIVE_AI | true / true |
| PUBLIC_AI_DAILY_LIMIT | 30 |
| LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL | openai-compatible / https://api.openai.com/v1 / gpt-4.1-mini |
| LLM_API_KEY | Existing OpenAI key entered ONLY in Render secret environment settings |
| LLM_TIMEOUT_MS | 15000 per model call; at most 3 calls/request |
| BACKGROUND_JOBS / ALLOW_PUBLIC_TESTNET_EXECUTION | false / false |
| LOG_LEVEL | info |

Must be absent: AGENT_PRIVATE_KEY, LOCAL_DEV_AGENT_INDEX, AGENT_KEYSTORE_FILE, AGENT_KEYSTORE_PASSWORD, AGENT_KEYSTORE_PASSWORD_FILE, OWNER_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY, owner/deployer keystores, AGENT_WALLET_ENV_FILE. Do not upload local .env, wallet databases or browser state. Production does not automatically load backend/.env.

The JUDGE_REQUIRE_LIVE_AI gate refuses disabled AI, a missing key, another provider URL/model, or a non-verified production PostgreSQL URL. Readiness checks configuration, database and actual paused/revoked chain state. It never spends money just to check health and does NOT claim provider verification; the paid smoke supplies that evidence.

## Retained safety and API-spend bounds

Public tools: assess_transfer only. No proposal writer, signer, owner operation, scheduler, grant or execution reference is exposed to the public assistant. Unknown tools fail closed. All old operator API routes stay blocked even for the SIWE owner. Existing operator/local features and v1/v2 evidence remain intact.

Limits: 3 AI requests/IP/hour, one inflight request on the single backend instance, persistent atomic shared UTC daily quota of 30 requests (including failures/refusals), at most 3 model calls/request, at most 4 tool calls/response, at most 1,024 output tokens/model call, 1,200 user characters, and 24 KB serialized context/model call. No automatic provider retries; client never automatically retries a paid POST. General/IP rate buckets reset on process restart; the SQL daily budget survives it. Daily quotas count requests, not dollars. Configure an OpenAI project budget alert/restricted key if supported; provider budget alerts are not a guaranteed hard spending cap.

At the published uncached rates, reserving 26,000 input tokens/call for context plus framing and 1,024 output tokens gives about $0.0362/request, $1.09/day at the full 30-request quota, or about $32.51 for 30 full days. This is a conservative planning estimate, not a promise about an external invoice or activity on the same key elsewhere. Typical short answers should cost much less. The owner's ongoing API-use approval must cover this request quota; never imply AI is included in free hosting.

Current paid-test authorization: ONE low-cost hosted GPT-4.1-mini analysis request, maximum 3 model calls and 1,024 output tokens/call. Conservative reserve about $0.037; stop after the one request. Do not run the broader local/hosted live-smoke scripts or paid test suites. Perform essential website, API, native PostgreSQL, Sepolia, AI and blocked-operator smoke checks only.

## Deployment order after explicit approval

1. Review and publish the free-launch changes through a PR to main. Preserve the old release and evidence; do not amend history. Approve the exact code/release before provider creation.
2. Sign in to Vercel, Render and Neon. Account creation/terms, MFA and repository permission prompts may need the owner. Confirm the free-only account gates above. No card is to be added to hosting; if required, stop.
3. Do not repeat local test suites or run any paid local smoke. Existing local validation is sufficient; proceed to the live deployment.
4. Create the approved Neon Free project/branch in Singapore, PostgreSQL 16 if offered. Use the direct endpoint for this small five-connection Node pool and transaction migrations. Keep five-minute scale-to-zero. Place the URL with sslmode=verify-full only in Render secrets. Do not import old approvals, grants, conversations or wallet data.
5. Confirm the Vercel Hobby account and select the frontend project name. Reserve its expected vercel.app origin; do not publish an AI-disabled placeholder. Configure the exact origin in Render CORS before the frontend deployment.
6. Create ONE Render Free service from the repository ROOT/main release; do not use backend as its root. Build npm ci --prefix backend --omit=dev; start node backend/src/server.js. All shared ABI, migrations, deployment and evidence files are required. render.yaml now contains only the Free service; it creates NO Render database. Manual service creation is acceptable if Blueprint requests a card. Set every approved environment value, including live AI and the existing key, BEFORE its first deploy. Never deploy with AI off as an intermediate public version.
7. The startup migration applies 001–003 in a transaction with a PostgreSQL advisory transaction lock. No PGlite data migration is needed for a fresh public judge database. Use /health/live for Render platform polling so it does not continuously wake Neon or call RPC. Use /health/ready and /health for the real launch gates. No external uptime keepalive loop. Verify native PostgreSQL TLS, migrations and current paused/revoked state before creating the frontend deployment.
8. Verify backend /health/ready, native PostgreSQL connectivity, public Sepolia overview and blocked operator endpoints WITHOUT paid AI calls.
9. Vercel: repository root frontend; npm ci; npm run build; output dist; use frontend/vercel.json. Set VITE_APP_MODE=judge and VITE_API_URL to the actual Render HTTPS API plus /api. Deploy only with live AI already configured in the backend. Use only Vercel Hobby; complete any account/repository permission confirmation with the owner.
10. Run the actual hosted incognito browser smoke and persistence checks below before calling the site judge-ready or sharing it. Deployment operations necessarily start services in sequence; this is one coordinated complete launch, not an AI-disabled public demo followed by an upgrade.

## Production smoke checklist (all required)

- Dashboard screenshots/records show Vercel Hobby Free, Render Free/Hobby with NO payment method, Neon Free with no paid plan/trial. Record actual $0 recurring hosting, region, free URLs and exact release commit. No upgrade automation, paid workers, extra instance, paid RPC, custom domain or new blockchain transaction.
- /health/live 200; /health/ready 200 with database ok, configured required AI, actual safeStopped true; /health shows judge and executionEnabled false. providerVerified=false in readiness is deliberate: configuration is not proof of a paid model response.
- Neon SQL console: migrations 001–003 present. Read the current UTC judge_ai_usage row after the one approved AI call. Restart the Render process using provider controls, reconnect, and confirm the SAME row/count persists. The one approved AI call creates or increments that row by one. Keep SQL screenshots redacted; never publish connection strings or signed sessions. Native DB/TLS/restart remain unverified until this is done.
- Exact vercel.app Origin gets Access-Control-Allow-Origin only for that host; foreign Origin gets 403, no credential cookies; Authorization preflight works. Verify trusted-proxy IP behavior and rate limiting on Render without exhausting the judge's paid allowance.
- Fresh incognito browser has no wallet/session; all four pages work over HTTPS, including direct reload of /judge/evidence, /judge/agent and /judge/guide. 12 SUCCESS historical receipt links, 26 recorded passing checks, preserved original sources, and actual current paused/zero-agent state are distinct. No stale chain state is called current after an RPC error.
- AI button is enabled on the first website release. The browser's ONE paid request returns real GPT-4.1-mini text with nonzero provider token usage and no execution. Real tool smoke reports pause/agent blockers; operator endpoints are 403. No key in page source, JS, network payloads or logs.
- Do not run broader hosted browser/API AI suites: the current authorization is one paid request. Submit one public explanation or read-only transfer assessment through the actual website and record its real response/token usage.
- 390 px mobile navigation/guide has no page overflow. Wait for a natural 15+ minute Render idle period, then visit as a new judge: clear waking state, bounded retries (up to about 135 seconds), manual Retry connection on exhaustion, no duplicate paid submissions. Retry GETs only; a suspension or exhausted quota must remain an honest error.
- Restore all temporary testing flags. Record returned token usage and estimated cost of the single approved paid request. If the provider fails or a gate fails, stop and report the issue; do not fabricate a response or announce the site live.

## Rollback and availability

Keep main release 0ad8ff6e9be03737a971e57f7885bb46162ef143 and its v1/v2 evidence. It predates the new live-AI launch requirement: do NOT deploy that AI-disabled profile as a fallback judge launch. If a safety issue occurs after launch, suspend the public backend/withdraw the judge link, rotate a leaked API key if needed, and repair/roll forward under review. Emergency disabling AI is allowed as a safety response but means the complete demo is unavailable and must be reported as such.

Do not roll back/drop the PostgreSQL schema or clear the daily budget to retry tests. Preserve the Neon data and take the available free snapshot before risky changes. Free restore is limited; local model archives and evidence remain versioned in Git. Never redeploy or modify the existing Sepolia contract, unpause it, restore its agent or broadcast a transaction.
