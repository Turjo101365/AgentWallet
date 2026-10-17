# Hosting preparation validation

Date: 2026-10-17. Local validation only; no Vercel/Render service or managed database has been deployed.

| Check | Actual result |
|---|---|
| Production frontend build with VITE_APP_MODE=judge and explicit HTTPS VITE_API_URL | Passed; final Vite build reports a 601 kB JS chunk (about 201 kB gzip) |
| Production build without an API URL | Refused with an actionable configuration error, as intended |
| Backend full regression | 159 passed, 0 failed, about 708 seconds; includes 11 hosted/judge tests |
| Final focused hosted checks | 12 passed, including an additional local Compose compatibility check; public-chain HTTP remains rejected |
| Frontend component regression | 32 passed |
| Incognito judge browser tests, production-built frontend + real public Sepolia RPC | 3 passed in about 21 seconds |
| Existing operator browser regression | 4 passed; optional paid live-AI cases and the separately run judge cases skipped in that run |
| Local full-stack E2E | 8 passed; real local chain, backend, Python RL and persistent restart test |
| Backend production dependency audit | 0 reported vulnerabilities |
| Frontend production dependency audit | 2 moderate React Router dependency entries; triggers and mitigations documented in HOSTING_READINESS.md |
| Prepared Render YAML / Vercel JSON | Parsed successfully; manual deploy trigger, private DB access and SPA settings checked |
| Public v2 contract | Read-only queries returned version 2, paused, zero agent and zero balance |
| Evidence preservation | No changes to evidence/, submission/, contract sources, deployment records or shared ABI |

The judge tests used NO wallet injection, mocked HTTP responses, model response substitution or public transaction broadcasting. They checked:

- no wallet and no stored session required;
- all 12 historical transaction links target Sepolia Etherscan;
- recorded 26/26 verification checks are clearly historical;
- deep-link reload works through the local production preview server;
- a real current risk assessment reports pause/executor blockers;
- operator POST endpoints return JUDGE_READ_ONLY;
- live AI is explicitly unavailable when disabled;
- mobile guide/navigation fit a 390-pixel viewport.

Desktop and mobile screenshots were inspected. The original browser regressions used their existing explicitly labeled local test wallet bridge; they are not new MetaMask-extension verification.

The first judge browser attempt found that the new API-URL build guard also ran during preview startup. The guard was restricted to the build command; the rerun passed all three cases.

Final configuration review also preserved the existing local Compose profile: production HTTP loopback origins are allowed only for Hardhat chain 31337. Public-chain and judge deployments still require exact HTTPS origins. The focused hosted suite was rerun after that adjustment.

## Reproduce

PowerShell examples from the repository root:

```powershell
$env:VITE_APP_MODE = 'judge'
$env:VITE_API_URL = 'https://api.example.invalid/api' # build-only placeholder; use the approved real API for hosting
npm run build:frontend
npm run test:backend
npm run test:frontend
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\AgentWallet\work\browser-cache' # this machine's existing browser cache
$env:JUDGE_BROWSER = '1'
cd frontend
npx playwright test judge.hosted.spec.js
cd ..
npm run test:e2e
```

JUDGE_BROWSER=1 permits read-only public Sepolia RPC requests. The browser fixture runs a temporary PGlite database in test mode; this does not validate a native hosted PostgreSQL instance. The public API always returns actual chain readings or an explicit unavailable state.

## Still requires approved deployment

- Native managed PostgreSQL connectivity, provider TLS configuration, backup retention, startup migrations and process restart against that service.
- Actual Vercel SPA routing/headers/HTTPS and Render readiness/proxy/rate-limit behavior.
- Account setup, billing/plan eligibility, production hostnames, RPC quota and uptime.
- Optional public live AI credentials, provider billing limits and real-provider smoke test (disabled by default). Injected-provider tests verify tool isolation and quota behavior; they are not a claim of a new live model run.

Use the smoke checklist and rollback plan in [HOSTING_DEPLOYMENT.md](HOSTING_DEPLOYMENT.md). No hosted availability or production launch is claimed before those checks pass.
