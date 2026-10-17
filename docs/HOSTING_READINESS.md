# Hosted demonstration readiness audit

Audit date: 2026-10-17. Starting code: 9f48f58; fetched GitHub main 2f19b11 has the same tree (PR #4 merge).
The existing checkout and history are preserved. No resources, production secrets, DNS changes or transactions were created by this hosting work.

## Findings and changes

| Area | Actual repository behavior | Hosting preparation |
|---|---|---|
| Frontend | React 18 + Vite 5; npm ci / npm run build; dist output; React Router history paths; VITE_API_URL points to an API ending in /api | Vercel configuration with SPA rewrites; explicit API URL required for production builds; VITE_APP_MODE=judge supplies a public landing shell even if the backend is unavailable |
| Wallet | Injected EIP-1193 wallet, network switch/add, SIWE and EIP-712; previously the entire app required wallet sign-in | Judge navigation needs no wallet; signing helper refuses judge mode; original operator UI and tests are retained |
| Backend | Express, npm start from backend or node backend/src/server.js from root; default HOST=127.0.0.1 | Render binds HOST=0.0.0.0 and its supplied PORT; Node 22; root build context retains shared ABI, evidence and migrations |
| Persistence | DATABASE_URL selects pg.Pool; otherwise PGlite in backend/data/pglite; migrations run at startup | Production requires DATABASE_URL. Pool capped at five connections with timeouts. PostgreSQL migrations serialized by transaction advisory lock |
| Background work | Scheduler/indexer, expiry sweeps, gas sampling, snapshots and executor recovery run inside one backend process | Judge profile requires BACKGROUND_JOBS=false and no executor credentials; startBackgroundJobs is also guarded. No worker or RL service is deployed |
| CORS / sessions | Opaque 32-byte bearer session tokens; only hashes in SQL; browser sessionStorage; no authentication cookies | Exact HTTPS origins in production. Authorization header works across domains with CORS preflight. No SameSite or third-party-cookie dependency; no allow-credentials header |
| SIWE | Nonce issued against an allowed requesting Origin; exact stored message, expiry, signer and single-use nonce verified | Existing owner authorization remains; public deployment blocks all operator routes even for the owner. HTTPS origin/port must exactly match the frontend |
| EIP-712 | v2 signatures include chain, contract and execution bounds; owner signs via wallet | No public judge signing payload or execution endpoint is exposed. Changing web domains does not change the contract signature domain |
| Public chain | v2 0x3C9389E704331B8a12381F9ab5A68a7F3F59582F on Ethereum Sepolia 11155111 | Hard pin in judge configuration. Startup refuses another chain/contract, any agent key/keystore, or an execution opt-in |
| Public evidence | Original v1/v2 receipts, manifests and security reports are committed | Curated historical fields and immutable GitHub source links; separate cached, block-pinned current chain reads; no old operator DB imported |
| AI | Existing planner has owner tools and persistent conversations | Separate public service has only assess_transfer; no reference to signer, proposals, tasks, owner sessions or policy writers. Disabled by default |
| Health / logs | /health included dependencies and raw connection failure details | /health/live for process; /health/ready for DB + RPC + paused/revoked state. Public production errors omit internals; RPC URLs withheld in startup summaries and logs |

## Read-only public verification performed

A direct read-only public RPC query at block 11932865 returned:

- Ethereum Sepolia 11155111, VERSION=2.
- paused=true, agent=zero address, balance=0 ETH.
- owner=0x10A0d3247a1446fD30ba40D14e4272206278b5ba.

These are observations at that block, not a promise about future state. The dashboard refreshes separately, marks RPC outages as unavailable, and never substitutes the historical final state for a live read.

## Capabilities and credentials

| Capability | Required access |
|---|---|
| Judge navigation and historical evidence | Public frontend and backend; no wallet |
| Live contract state and deterministic risk analysis | Read-only Sepolia RPC; no private key |
| Persistent sessions and daily AI quota | Managed PostgreSQL |
| Optional AI explanation / transfer assessment | Explicit PUBLIC_AI_ENABLED=true, configured LLM provider and server-side API key; quota and provider billing approval |
| Owner operator workflows | Existing SIWE owner identity; blocked by judge mode regardless |
| Autonomous/public execution | Unavailable in this deployment. Requires a separately approved funded sandbox and signer; never enable it for the evidence contract |
| PPO/DQN inference | Separate Python service; not necessary for this public demo. Existing reproducible RL reports remain in the repository |

The public risk form performs deterministic reads only. It does not create proposals, call eth_sendRawTransaction, or simulate a completed execution. AI text is explicitly labeled advisory.

## Risks and residual limits

- Vercel is appropriate for static React delivery. Render's long-running Node process suits this backend; Vercel functions would not preserve its in-process jobs or rate-limit state.
- Render local files are ephemeral. A PGlite directory on the default filesystem would lose sessions, history and memory on redeploy. Use a new PostgreSQL database, not an uploaded local wallet database.
- Sessions remain bearer tokens in sessionStorage; XSS can steal them. React renders AI/user text as text, no HTML injection is used. Do not install unreviewed client scripts or expose secrets through VITE_* variables.
- Production dependency audit: backend has no reported vulnerabilities; frontend reports two moderate React Router advisories. One requires attacker-controlled navigation paths (all judge links are constants), and the other targets SSR hydration (this frontend is client-rendered). Keep these controls; a Router 7 upgrade is a separately scoped follow-up. Sources: [open redirect advisory](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [SSR hydration advisory](https://github.com/advisories/GHSA-337j-9hxr-rhxg). No claim of a clean frontend dependency audit.
- Public AI can be abused for API spending. It is off by default; when enabled: 3/IP/hour, one in-flight request per instance, maximum 3 model calls/request with 1024 output tokens each, and an atomic persistent shared daily request limit (default 30). Failed/provider-refused attempts consume quota. Also set provider billing limits.
- General rate limits are in memory. Keep one backend instance; restarting resets the IP buckets, but not the daily SQL AI quota. Add a shared limiter before scaling.
- No chain price feeds are configured for this Sepolia deployment, so the judge UI does not invent USD values.
- A live contract state outside paused/revoked makes readiness fail and the dashboard warn; all website execution routes remain blocked.
- Local production builds and tests do not establish hosted availability, TLS, Render proxy behavior, managed PostgreSQL compatibility or account eligibility. Those need the approved deployment smoke test.

See [deployment instructions](HOSTING_DEPLOYMENT.md) and [judge guide](JUDGE_QUICK_START.md).
