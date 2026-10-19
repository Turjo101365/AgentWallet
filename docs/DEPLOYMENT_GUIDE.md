# RELAY deployment guide

This guide explains how to run RELAY (repository name: AgentWallet) locally and how the hosted judge demo is
deployed. It was written on 2026-10-19 against commit `cd078f7` (`origin/main`). Every command here was checked
against the repository's `package.json` files. Each section says whether it was **run** for this guide or only
**documented**.

> **Safety defaults.** Every configuration in this guide keeps payment execution disabled on public networks.
> Nothing here deploys a contract, enables spending or sends a transaction unless you deliberately set the
> approval flags described in [Smart-contract setup](#4-smart-contract-setup). Never commit `.env` files or keys.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment variables](#2-environment-variables)
3. [Local development](#3-local-development)
4. [Smart-contract setup](#4-smart-contract-setup)
5. [Hosted deployment (Vercel + Render + Neon)](#5-hosted-deployment-vercel--render--neon)
6. [Docker Compose (unverified)](#6-docker-compose-unverified)
7. [Security defaults](#7-security-defaults)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Requirement | Version | Needed for |
|---|---|---|
| Node.js and npm | Node 20 or newer (verified on 20.19.5, npm 10.8.2). Render uses `NODE_VERSION=22`. | Everything |
| Git | any | Cloning |
| Python 3 | 3.10 or newer (verified on 3.14.6) with `pip` | Only the optional RL engine and `npm run test:rl` |
| A browser wallet (MetaMask or another EIP-1193 wallet) | any recent | Only to sign in as owner and approve transfers locally |
| PostgreSQL 16 | optional | Only if you do not want the embedded PGlite database |
| Docker + Docker Compose | optional, **not verified** | Only for `docker compose up` |

Accounts needed only for hosted deployment: Vercel, Render, Neon, a Sepolia RPC endpoint, and an OpenAI
(or other OpenAI-compatible) API key for the live AI assistant.

The project has no root dependencies. Each part is installed separately: `contracts/`, `backend/`, `frontend/`,
and optionally `rl-engine/`.

## 2. Environment variables

Templates (safe placeholders only):

| File | Copy to | Used by |
|---|---|---|
| [`backend/.env.example`](../backend/.env.example) | `backend/.env` | Local backend |
| [`backend/.env.hosted.example`](../backend/.env.hosted.example) | Render environment settings | Hosted backend (judge mode) |
| [`.env.demo.example`](../.env.demo.example) | Render environment settings, merged with the above | Hosted demo sandbox (disabled by default) |
| [`frontend/.env.example`](../frontend/.env.example) | `frontend/.env.local` (optional locally) | Frontend build |
| [`contracts/.env.example`](../contracts/.env.example) | `contracts/.env` | Public-network deployment only |
| [`.env.example`](../.env.example) | `.env` | Docker Compose database settings |

The backend validates its environment with zod at start-up (`backend/src/config/env.js`) and refuses to start on an
invalid value. In production (`NODE_ENV=production`) it does **not** read `backend/.env`; set variables in the host.
`AGENT_WALLET_ENV_FILE=<path>` loads a different file *instead of* `backend/.env`.

### Backend: core

| Variable | Purpose | Required | Safe example | Service |
|---|---|---|---|---|
| `NODE_ENV` | `development`, `test` or `production` | No (default `development`) | `development` | Backend |
| `APP_MODE` | `operator` (full console) or `judge` (public, read-only evidence + demo) | No (default `operator`) | `operator` | Backend |
| `HOST` / `PORT` | Listen address | No (defaults `127.0.0.1` / `4000`) | `127.0.0.1` / `4000` | Backend |
| `APP_ORIGIN` | Frontend origin; also the SIWE domain | No (default `http://localhost:5173`) | `http://localhost:5173` | Backend |
| `CORS_ORIGINS` | Comma-separated allowed origins; no wildcards in production | No | `http://localhost:5173,http://127.0.0.1:5173` | Backend |
| `TRUST_PROXY` | Trust `X-Forwarded-For` behind a proxy (Render) | No (default `false`) | `false` | Backend |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `silent` | No | `info` | Backend |
| `DATABASE_URL` | PostgreSQL URL. Empty = embedded PGlite in `backend/data/pglite` | Hosted: **yes** | `postgresql://user:password@host/db?sslmode=verify-full` | Backend |
| `PGLITE_DIR` | PGlite data directory | No | `./data/pglite` | Backend |
| `CHAIN_ID` | 31337 (local), 84532 (Base Sepolia) or 11155111 (Ethereum Sepolia). Anything else is refused | No (default `31337`) | `31337` | Backend |
| `RPC_URL` | JSON-RPC endpoint | Public chains: **yes** | `http://127.0.0.1:8545` | Backend |
| `DEPLOYMENT_FILE` | Deployment record to read the contract from | No (local reads `contracts/deployments/localhost.json`) | `contracts/deployments/sepolia-v2-full.json` | Backend |
| `AGENT_WALLET_CONTRACT_ADDRESS` | Contract address when no deployment file is used | No | `0x…` | Backend |
| `RL_SERVICE_URL` | Optional RL timing advisor | No | `http://127.0.0.1:8000` | Backend |

### Backend: executor credential (choose at most one)

Without any of these the executor is disabled: proposals can be drafted and checked, but nothing is signed.

| Variable | Purpose | Required | Safe example | Service |
|---|---|---|---|---|
| `LOCAL_DEV_AGENT_INDEX` | Hardhat dev account index. **Local chain only**; refused on public networks | No | `1` | Backend |
| `AGENT_KEYSTORE_FILE` + `AGENT_KEYSTORE_PASSWORD_FILE` (or `AGENT_KEYSTORE_PASSWORD`) | Encrypted JSON keystore (preferred off-local) | No | `/run/secrets/agent-keystore.json` | Backend |
| `AGENT_PRIVATE_KEY` | Plaintext agent key (least preferred). Never the owner key | No | *(leave empty)* | Backend |
| `ALLOW_PUBLIC_TESTNET_EXECUTION` | Must be `true` before a public-network executor key is accepted | No (default `false`) | `false` | Backend |

### Backend: AI provider (optional locally)

| Variable | Purpose | Required | Safe example | Service |
|---|---|---|---|---|
| `LLM_PROVIDER` | `anthropic`, `openai-compatible` or `none` | No | `openai-compatible` | Backend |
| `LLM_BASE_URL` / `LLM_MODEL` | OpenAI-compatible endpoint and model | With `openai-compatible` | `https://api.openai.com/v1` / `gpt-4.1-mini` | Backend |
| `LLM_API_KEY` | Key for the OpenAI-compatible endpoint. Backend only, never `VITE_*` | With a hosted provider | *(secret)* | Backend |
| `ANTHROPIC_API_KEY` | Key for the Anthropic provider | With `anthropic` | *(secret)* | Backend |
| `LLM_MAX_MODEL_CALLS` | Model calls per turn (1–20) | No (default `8`) | `8` | Backend |
| `LLM_TIMEOUT_MS` | Per-call timeout | No (default `120000`) | `15000` | Backend |
| `PUBLIC_AI_ENABLED` / `JUDGE_REQUIRE_LIVE_AI` / `PUBLIC_AI_DAILY_LIMIT` | Public read-only AI assistant in judge mode, and its daily quota | No | `false` / `false` / `30` | Backend |

### Backend: risk and scheduler

| Variable | Purpose | Default |
|---|---|---|
| `PROPOSAL_TTL_SECONDS` | Proposal lifetime (30–3600) | `180` |
| `APPROVAL_MIN_REMAINING_SECONDS` | Refuse an approval with less time left before its signed deadline | `15` |
| `MAX_FEE_PER_GAS_GWEI` | `GAS_PRICE` policy cap | `50` |
| `NATIVE_RESERVE_FLOOR_ETH` | Minimum ETH reserve the policy always keeps | `0.01` |
| `MIN_EXECUTOR_GAS_BALANCE_ETH` | Minimum executor gas balance | `0.0005` |
| `EXECUTOR_GAS_MARGIN_PCT` / `EXECUTOR_GAS_LIMIT_CAP` | Gas limit = estimate × (100 + margin)%, refused above the cap | `20` / `1500000` |
| `DAY_BOUNDARY_GUARD_SECONDS` | Wait out the last N seconds of a UTC day before sending | `120` |
| `BACKGROUND_JOBS` | Run the scheduler, indexer and snapshots in-process | `true` (hosted: `false`) |
| `SCHEDULER_TICK_MS`, `TASK_LEASE_SECONDS`, `CONDITION_CHECK_SECONDS`, `GAS_SAMPLE_INTERVAL_SECONDS`, `SNAPSHOT_INTERVAL_SECONDS`, `RL_TIMING_AGENT` | Scheduler tuning | see `backend/.env.example` |
| `SESSION_TTL_SECONDS` / `NONCE_TTL_SECONDS` | SIWE session and nonce lifetime | `28800` / `300` |
| `INDEXER_BLOCK_RANGE` | Max blocks per `eth_getLogs` | 2000 local, 200 Base Sepolia |

### Backend: hosted demo sandbox (judge mode only)

All are optional and **off by default**. `DEMO_ENABLED=true` requires `APP_MODE=judge`, a non-empty
`ADMIN_ADDRESSES`, `DEMO_DEPLOYMENT_FILE`, and two distinct demo keys. See [`.env.demo.example`](../.env.demo.example).

| Variable | Purpose | Safe example |
|---|---|---|
| `DEMO_ENABLED` | Turns the demo sandbox on | `false` |
| `ADMIN_ADDRESSES` | Wallets allowed to sign in as admin (SIWE) | `0xYourAdminWallet` |
| `DEMO_DEPLOYMENT_FILE` | Separate sandbox contract record (never an evidence contract) | `contracts/deployments/sepolia-demo.json` |
| `DEMO_OWNER_PRIVATE_KEY`, `DEMO_AGENT_PRIVATE_KEY` | Server-held sandbox keys (custodial) | *(secret, host settings only)* |
| `DEMO_INVITE_CODES_SHA256` | SHA-256 digests of invite codes, never the codes | *(empty)* |
| `DEMO_MAX_TX_PER_SESSION`, `DEMO_DAILY_TX_LIMIT`, `DEMO_DAILY_AMOUNT_ETH`, `DEMO_MAX_GAS_PER_TX_ETH`, `DEMO_SESSION_GAS_ETH`, `DEMO_DAILY_GAS_ETH` | Ceilings. Set to `0` to stop all demo payments | `0` |
| `DEMO_MAX_AMOUNT_ETH`, `DEMO_MIN_TREASURY_ETH`, `DEMO_MIN_AGENT_GAS_ETH`, `DEMO_MAX_FEE_PER_GAS_GWEI`, `DEMO_MAX_AI_PER_SESSION`, `DEMO_SESSION_TTL_SECONDS`, `DEMO_EXECUTION_WAIT_MS` | Per-payment and session bounds | see `.env.demo.example` |

Even with `DEMO_ENABLED=true`, demo payments also need the persisted execution switch (set by an admin) and an
invited session. A fresh database starts with execution off.

### Frontend (build-time, public)

| Variable | Purpose | Required | Safe example |
|---|---|---|---|
| `VITE_API_URL` | Backend API base, ending in `/api`. Production builds refuse anything but HTTPS (or localhost) | Production build: **yes** | `http://localhost:4000/api` |
| `VITE_APP_MODE` | `judge` shows the public evidence experience | No | `judge` (hosted only) |

`VITE_*` values are embedded in public JavaScript. Never put keys or database URLs in them.

### Contracts (public-network deployment only)

| Variable | Purpose | Safe example |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Deployer key for `sepolia` / `base_sepolia` networks | *(empty)* |
| `SEPOLIA_RPC_URL` / `BASE_SEPOLIA_RPC_URL` | RPC endpoints | `https://ethereum-sepolia-rpc.publicnode.com` |
| `OWNER_ADDRESS` / `AGENT_ADDRESS` | Contract owner and agent (must differ) | `0x…` |
| `SEPOLIA_NATIVE_PER_TX_ETH` / `SEPOLIA_NATIVE_DAILY_ETH` | Initial ETH caps | `0.001` / `0.005` |
| `CONFIRM_PUBLIC_DEPLOY` | Must be `yes` for any public deploy | `no` |
| `DEPLOYMENTS_DIR` | Where the deployment record is written (see the warning in §4) | `./deployments-new` |
| `ETHERSCAN_API_KEY` | Optional source verification (Sourcify works without it) | *(empty)* |

## 3. Local development

Status: **run for this guide on 2026-10-19** (Windows 11, Git Bash, Node 20.19.5). See the result notes after step 9.

### Step 1: Clone

```bash
git clone https://github.com/Turjo101365/AgentWallet.git
cd AgentWallet
```

### Step 2: Install dependencies

```bash
npm ci --prefix contracts
npm ci --prefix backend
npm ci --prefix frontend
```

Optional RL engine: `python -m pip install -r rl-engine/requirements.txt`. The root scripts call Python through
`rl-engine/scripts/python.js`.

### Step 3: Configure environment

```bash
cp backend/.env.example backend/.env
```

The defaults target the local chain (31337), use PGlite, and use Hardhat dev account #1 as the executor.
No frontend `.env` is needed: it defaults to `http://localhost:4000/api`.

### Steps 4–5: Database and migrations

Nothing to do by hand. With `DATABASE_URL` empty the backend creates a PGlite database in `backend/data/pglite`.
On every start it applies any `database/migrations/001…006` file not yet listed in its `schema_migrations` table,
in order, inside one transaction (on PostgreSQL also under an advisory lock, so two instances cannot migrate at once).

To use PostgreSQL instead, create an empty database and set `DATABASE_URL` in `backend/.env`; the same
migrations run on start.

### Step 6: Start the chain, deploy the contract, start the backend

```bash
npm run chain           # terminal 1: Hardhat node on 127.0.0.1:8545 (chain 31337)
```

```bash
npm run deploy:local    # terminal 2: writes contracts/deployments/localhost.json (git-ignored)
npm run dev:backend     # terminal 2: http://127.0.0.1:4000
```

`deploy:local` deploys `AgentWallet` with Hardhat account #0 as owner and #1 as agent (caps 0.01 ETH per
transaction, 0.05 ETH per day), funds it with 5 ETH, adds a mock `mUSDC` token and synthetic price feeds, and
allowlists Hardhat accounts #2 and #3 as recipients.

### Step 7: Start the frontend

```bash
npm run dev:frontend    # terminal 3: http://localhost:5173
```

### Step 8: Open the application

Open <http://localhost:5173>. To act as owner, import Hardhat account #0 into a browser wallet, add the network
(RPC `http://127.0.0.1:8545`, chain ID 31337), connect, and sign in with SIWE. The Hardhat dev keys are public
and must only be used on the local chain. Step-by-step MetaMask instructions: [METAMASK_DEMO.md](METAMASK_DEMO.md).
`npm run demo:metamask` starts a fresh local stack for that checklist.

### Step 9: Verify the backend health endpoints

```bash
curl http://127.0.0.1:4000/health/live    # {"status":"ok"} — process is up, no DB or RPC call
curl http://127.0.0.1:4000/health/ready   # database, chain and configuration gate
curl http://127.0.0.1:4000/health         # full detail: database, chain, executor, RL engine
```

`/health` returns HTTP 503 with `"status":"degraded"` if the database or chain is not ready. The RL engine shows
as `unavailable` unless you also run `npm run dev:rl`; that is expected.

**Result of the verification run (2026-10-19).** `deploy:local` printed `AgentWallet deployed at 0x5FbDB2315678afecb367f032d93F642f64180aa3 on chain 31337`;
migrations 001–006 applied; `/health/live`, `/health/ready` and `/health` all reported OK (RL engine `unavailable`, as expected); the frontend
answered HTTP 200; `/api/config` reported `chainId 31337`, `appMode operator`, `contractVersion 2`.

## 4. Smart-contract setup

Contracts live in `contracts/` (Solidity 0.8.24, `evmVersion: cancun`, optimizer 200 runs, OpenZeppelin 5.6.1).

| Task | Command | Status |
|---|---|---|
| Compile | `npm run compile --prefix contracts` | Run (via the test suites) |
| Test (in-process Hardhat network) | `npm run test:contracts` | Run: 53 passing |
| Local node | `npm run chain` | Run |
| Deploy to the local node | `npm run deploy:local` | Run |
| Export the ABI to `shared/abi/` | `npm run export-abi --prefix contracts` | Documented only |

### Sepolia deployment (documented only; not executed for this guide)

RELAY's evidence contracts are already deployed. **You do not need a new deployment to run or evaluate RELAY.**
A public deployment spends real testnet gas and needs explicit approval from the project owner.

> **Warning: protect the evidence records.** `contracts/scripts/deploy.js` writes the record to
> `contracts/deployments/<network>.json`. For Ethereum Sepolia that is `contracts/deployments/sepolia.json`, the
> committed record of the frozen v1 evidence run. Always set `DEPLOYMENTS_DIR` to a new directory so it cannot
> be overwritten.

1. Create **new** keys for the deployer, owner and agent. Never reuse the Hardhat dev keys (the deploy script and
   backend refuse them on public chains) or any key from this repository's evidence runs.
2. Fund the deployer with Sepolia test ETH from a faucet.
3. Fill `contracts/.env` from `contracts/.env.example`: `DEPLOYER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`,
   `OWNER_ADDRESS`, `AGENT_ADDRESS`, `SEPOLIA_NATIVE_PER_TX_ETH`, `SEPOLIA_NATIVE_DAILY_ETH`.
4. Only after approval, deploy with an explicit confirmation and a separate output directory:

   ```bash
   cd contracts
   CONFIRM_PUBLIC_DEPLOY=yes DEPLOYMENTS_DIR=./deployments-new npx hardhat run scripts/deploy.js --network sepolia
   ```

5. Set `CONFIRM_PUBLIC_DEPLOY` back to `no`.
6. The owner then allowlists recipients and deposits funds from their own wallet.
7. Point a backend at it with `CHAIN_ID=11155111`, `RPC_URL`, and `DEPLOYMENT_FILE=<the new record>`.
   Executing transfers additionally needs an agent credential and `ALLOW_PUBLIC_TESTNET_EXECUTION=true`.
8. Optional source verification: `npx hardhat verify --network sepolia <address> <owner> <agent> <perTxWei> <dailyWei>`
   (Sourcify; Etherscan too when `ETHERSCAN_API_KEY` is set). Not done for the existing v2 contracts.

The scripted public runs (`npm run sepolia:*`, `npm run v2:*`, `npm run demo:sepolia`) recorded the evidence in
`evidence/`. Their targets are **frozen**: the scripts refuse to run them again. They are kept for reproducibility
and are not part of a normal deployment.

## 5. Hosted deployment (Vercel + Render + Neon)

Status: **documented from the repository and the deployment records; not re-deployed for this guide.** The live
demo runs this architecture: frontend <https://agentwallet-judge.vercel.app>, backend
`https://agentwallet-judge-api.onrender.com`. Background and constraints: [HOSTING_DEPLOYMENT.md](HOSTING_DEPLOYMENT.md),
[TREASURY_CONTROLLED_DEPLOYMENT.md](TREASURY_CONTROLLED_DEPLOYMENT.md).

```mermaid
flowchart LR
    V["Vercel<br/>static frontend (frontend/)"] -->|"HTTPS, VITE_API_URL"| R["Render web service<br/>node backend/src/server.js"]
    R -->|"DATABASE_URL, TLS"| N[("Neon PostgreSQL")]
    R -->|"RPC_URL, read-only by default"| S["Ethereum Sepolia"]
    R -->|"LLM_API_KEY"| O["OpenAI API<br/>gpt-4.1-mini"]
```

### 5.1 Database: Neon PostgreSQL

1. Create a Neon project and an **empty** database. Never import local data, signed approvals or keys.
2. Copy the **direct** connection string with `sslmode=verify-full`. It goes only into Render's secret settings.
3. Migrations are applied automatically when the backend starts. There is no separate migration command.

### 5.2 Backend: Render

[`render.yaml`](../render.yaml) defines one free web service. Its key settings:

| Setting | Value |
|---|---|
| Root directory | Repository root (the backend needs `shared/abi`, `database/migrations`, `contracts/deployments` and `evidence/`) |
| Build command | `npm ci --prefix backend --omit=dev` |
| Start command | `node backend/src/server.js` |
| Health check path | `/health/live` (does not wake the database or call RPC) |
| Auto-deploy | Off |

Environment: start from [`backend/.env.hosted.example`](../backend/.env.hosted.example) and set the secrets
(`DATABASE_URL`, `LLM_API_KEY`, `RPC_URL`, `APP_ORIGIN`, `CORS_ORIGINS`) in Render. The demo sandbox variables in
[`.env.demo.example`](../.env.demo.example) are optional and stay off unless the owner approves them.

Notes from operating the live service:
- On Render, **"Save" plus "Restart" did not apply environment changes**. Use a real deploy ("Deploy latest commit")
  after changing variables.
- The free instance sleeps after about 15 idle minutes. The first request then takes about a minute; the frontend
  retries reads automatically.
- Each boot appends one `POLICY_SETTINGS_UPDATED` audit entry. That is expected.

### 5.3 Frontend: Vercel

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Install / build | `npm ci` / `npm run build` (from [`frontend/vercel.json`](../frontend/vercel.json)) |
| Output | `dist` |
| Environment | `VITE_API_URL=https://<render-service>.onrender.com/api`, `VITE_APP_MODE=judge` |
| Rewrites and headers | SPA rewrite and security headers (CSP, `X-Frame-Options: DENY`) from `vercel.json` |

The production project is not Git-connected; it was deployed with the Vercel CLI (`vercel build --prod`, then
`vercel deploy --prebuilt --prod`) from a clean checkout of `main`.

Set the exact Vercel origin (no trailing slash, no wildcard) in Render's `APP_ORIGIN` and `CORS_ORIGINS` before
deploying the frontend.

### 5.4 Post-deploy checks (read-only)

```bash
curl https://<render-service>.onrender.com/health/live
curl https://<render-service>.onrender.com/health/ready
curl https://<render-service>.onrender.com/api/demo/status
```

Expected for a safe judge deployment: `/health/ready` reports `"status":"ready"`, `"database":"ok"`, `"chain":"ok"`,
`"safeStopped":true`. `/api/demo/status` reports `"executionEnabled":false`. Observed on the live service on
2026-10-19: exactly that, with all six spending ceilings at `0`.

Then open `/evidence` in a private browser window. It should load the live contract state and the receipts without
a wallet. An opt-in read-only browser smoke test also exists:
`QA_HOSTED_READONLY=1 JUDGE_HOSTED_URL=… JUDGE_HOSTED_API_URL=… npx playwright test tests/browser/judge.hosted.readonly.spec.js`
(run from `frontend/`).

## 6. Docker Compose (unverified)

[`docker-compose.yml`](../docker-compose.yml) describes a local stack: PostgreSQL 16, a Hardhat chain, a one-shot
deployer, the RL engine, the backend and an nginx-served frontend. It never touches a public network.

```bash
cp .env.example .env
docker compose up --build
```

Docker was not installed on the machine used to prepare this project, so **the images and the Compose file have not
been built or run**. Prefer the npm workflow in §3.

## 7. Security defaults

| Default | Where | Effect |
|---|---|---|
| `ALLOW_PUBLIC_TESTNET_EXECUTION=false` | backend env, `render.yaml` | A public-network executor key is refused |
| `BACKGROUND_JOBS=false` | `render.yaml`, hosted example | No scheduler or autonomous runs on the hosted service |
| No executor credential | hosted example | Executor disabled; the backend cannot sign |
| `DEMO_ENABLED=false` | `.env.demo.example`, env schema | Demo sandbox off |
| Demo ceilings `0` and execution switch off | Live hosted service (2026-10-19) | No demo payment can be confirmed |
| `CONFIRM_PUBLIC_DEPLOY=no` | `contracts/.env.example` | Public contract deployment refused |
| Chain allowlist 31337 / 84532 / 11155111 | backend config | Every mainnet chain ID is refused |
| Public Hardhat keys refused on public chains | backend config, deploy scripts | Known dev keys cannot sign on Sepolia |

Do **not** enable spending, create admin invites or change the hosted environment to evaluate RELAY. The public
evidence pages and the local stack cover every feature.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend exits with `Fatal startup error: check required environment variables, PostgreSQL connectivity/migrations and Sepolia RPC` | Invalid env value, unreachable database or RPC | Check the zod error above it; check `DATABASE_URL` / `RPC_URL`; for local, make sure `npm run chain` is running |
| `/health` returns 503 with chain not ready | No contract deployed on the local chain, or the chain was restarted | Run `npm run deploy:local` again after every `npm run chain` restart, then restart the backend |
| Backend: `Unsupported chain id` / mainnet refused | `CHAIN_ID` or RPC points at another network | Use 31337, 84532 or 11155111 only |
| Backend refuses an executor key on Sepolia | Public Hardhat key, or `ALLOW_PUBLIC_TESTNET_EXECUTION` not `true` | Intended. Use a dedicated key and an explicit opt-in, only with approval |
| `AGENT_WALLET_ENV_FILE … does not exist` | Profile path wrong | Fix the path; there is deliberately no fallback to `backend/.env` |
| PGlite fails with V8 "out of memory: Zone" | Low free RAM while compiling PGlite's WASM | Close other processes, or use PostgreSQL via `DATABASE_URL` |
| Frontend shows network errors / "waking up" | Backend not running, wrong `VITE_API_URL`, or a sleeping Render instance | Start the backend; check `VITE_API_URL` ends in `/api`; wait about a minute after idle |
| Production build fails: `Set VITE_API_URL to the public HTTPS backend URL ending in /api` | `vite build` in production mode without a valid URL | Set `VITE_API_URL` (HTTPS, or localhost for browser tests) |
| Browser requests blocked by CORS (403) | Frontend origin missing from `CORS_ORIGINS` | Add the exact origin, without a trailing slash |
| Wallet sign-in fails or MetaMask warns about the domain | Origin not in `CORS_ORIGINS`/`APP_ORIGIN`, or expired nonce | Use an allowed origin; nonces expire after 5 minutes and are single-use, so start sign-in again |
| MetaMask: "Nonce too high" / "could not coalesce error" | Hardhat chain restarted but MetaMask cached old nonces | MetaMask → Settings → Advanced → Clear activity tab data |
| MetaMask error -32002 | A connect request is already pending | Open the MetaMask popup and finish or reject it |
| Approval refused: deadline too close / expired | Less than `APPROVAL_MIN_REMAINING_SECONDS` left, or the proposal TTL passed | Create a new proposal and approve promptly |
| Every transfer blocked by `BALANCE_AND_RESERVE` | Balance below amount + reserve floor (default 0.01 ETH) | Deposit more, or lower the configured reserve (needs owner confirmation) |
| AI assistant says the model is unavailable | No provider configured | Set `LLM_PROVIDER` + `LLM_BASE_URL` + `LLM_MODEL` + `LLM_API_KEY`, or `ANTHROPIC_API_KEY` |
| Receipt verifier finds no receipts | Some public RPC nodes no longer serve old receipts | Pass another endpoint, e.g. `--rpc https://sepolia.drpc.org` |
| Render ignores changed environment variables | "Save" + "Restart" does not apply them | Trigger a real deploy |
