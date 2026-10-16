# Source code (Deliverable 04): submission audit

**Date:** 2026-10-16. **Nothing has been committed or pushed.** All work since `90c1849` is in the working tree and awaits the team's review and commit.

## 1. Repository readiness

| Item | Status | Action needed |
|---|---|---|
| GitHub repository | `https://github.com/Turjo101365/AgentWallet` (remote `origin`). `git ls-remote` works without credentials and lists `main` (`c81ef67`) and `feature/phase-1-secure-foundation` (`90c1849`). | The repository was observed to be **public** earlier on 2026-10-16. Re-confirm before submitting the link (`gh` is not installed here). |
| Working branch | `feature/phase-1-secure-foundation` at `90c1849`; 44 modified and 24 untracked paths | **Team:** review, commit and push, then merge to `main` so the default branch shows the submitted code |
| `README.md` | Updated today: public-run status and links, chain allowlist (31337 / 84532 / 11155111), test counts, public-run commands, submission links | Review |
| License | `LICENSE`: MIT, © 2026 Tanmoy Chowdhury Turjo | — |
| Large binaries | Videos and footage are git-ignored (`.gitignore` updated today). Upload them separately; SHA-256 values are in `evidence/sepolia/MANIFEST.json` and `evidence/submission/MANIFEST.json` | Upload videos |
| Secrets | Clean (§5) | — |

## 2. Installation and environment

**Requirements:**
- Node.js 20 (verified with v20.19.5) and npm.
- Python 3.10+ for the optional RL engine (verified with 3.14 here; `rl-engine/requirements.txt`).
- Git.

Docker files exist but are **unverified** (risk R16).

```bash
cd contracts && npm ci && cd ../backend && npm ci && cd ../frontend && npm ci && cd ..
cp backend/.env.example backend/.env        # local chain defaults; LLM_* optional
cp contracts/.env.example contracts/.env    # only needed for public deployments
```

| File | Purpose | Committed? |
|---|---|---|
| `backend/.env.example`, `contracts/.env.example` | Documented templates, no secrets | yes |
| `backend/.env`, `backend/.env.sepolia`, `backend/.env.base-sepolia`, `contracts/.env`, `secrets/*.env` | Real keys and API key | **no** (git-ignored, verified) |

## 3. Local deployment

```bash
npm run chain          # Hardhat node, chain 31337
npm run deploy:local   # deploys AgentWallet + mock token + mock price feeds
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:5173
npm run demo:metamask  # alternative: whole local stack for MetaMask
npm run demo:rehearse  # full recorded demo on a throwaway local chain (stub LLM)
```

## 4. Public testnet deployment documentation

| Item | Where |
|---|---|
| Runbook (Base Sepolia and Ethereum Sepolia) | `docs/BASE_SEPOLIA_READINESS.md` |
| Run script and safety design | `scripts/base-sepolia-run.mjs`, `scripts/sepolia-demo.mjs`, `scripts/deploy-gate.mjs` |
| Deployment record | `contracts/deployments/sepolia.json` |
| Executed run, honest notes | `evidence/sepolia/RUN_NOTES.md`; the failed first attempt is in `evidence/sepolia-attempt-1/` |
| Organizer guidance on chains | `docs/ORGANIZER_GUIDANCE.md` |
| Gate | `CONFIRM_PUBLIC_DEPLOY=no` (checked 2026-10-16) |

## 5. Secret scanning

| Check | Result |
|---|---|
| Exact-value scan (`submission/tools/secret-scan.mjs`): 6 real secret values loaded from 5 git-ignored env files, then searched in 256 committable and deliverable text files (tracked, untracked-not-ignored, `submission/`, `evidence/submission/`, `evidence/sepolia/`) | **0 findings** (`secret-scan.json`) |
| Patterns: OpenAI/Anthropic keys, PEM keys, private-key assignments (public Hardhat keys excluded), recovery phrases | **0 findings** |
| Env and key files git-ignored | all 5 confirmed with `git check-ignore`; none tracked |
| Git history (previous full scan, `docs/SECURITY_SELF_ASSESSMENT.md` §5) | none found, 2026-10-16 |
| Evidence folders | `scripts/sepolia-demo.mjs` ran its own secret scan on `evidence/sepolia/` |
| Videos | The new recordings show addresses, hashes and UI only. The replay recorder never prints keys. MetaMask onboarding pages were deleted after recording; they would only have shown the public Hardhat mnemonic. |

**Before pushing:** re-run `node submission/tools/secret-scan.mjs` after the final edits.

## 6. Test commands and test cases

```bash
npm test                                                     # contracts + backend + frontend + RL + e2e
cd contracts && npx hardhat test                             # 35
cd backend && npm test                                       # 118
cd frontend && npx vitest run && npx playwright test         # 24 + 3 (1 live-LLM spec skipped)
node --test tests/e2e/                                       # 8
cd frontend && npm run test:metamask                         # real MetaMask 13.52.0 checklist (local chain, headed)
cd backend && LIVE_LLM=1 node --test test/live/              # live gpt-4.1-mini safety suite (paid API)
```

| Suite | Representative cases |
|---|---|
| Contracts | owner ≠ agent; allowlist; exact per-tx boundary; UTC daily cap and reset; replayed intents; re-entrancy; pause / emergencyStop / emergencyWithdraw; Ownable2Step; renounce disabled; owner-only swap suite with fabricated router output; randomized cap sequences |
| Backend API security | unauthenticated mutations rejected; viewer cannot create, approve or pause; foreign typed-data signature refused; strict schemas; idempotency; single-use SIWE nonces; CORS; rate limits; no key in `/config` or `/health` |
| Execution | full approval state machine on a real chain; re-check at approval; concurrent approvals cannot over-commit; expired proposals; receipt-verified history |
| Scheduler | autonomous one-time run; escalation above the auto-approval limit; unauthorized grants; duplicate scheduler → one execution; crash recovery; on-chain failure; circuit breaker; hourly cap; conditional trigger; RL timing deferral and outage |
| AI agent | allowlist resolution; invented recipient rejected; prompt injection in a label; `record_plan` gate; clarification blocks actions; tighten-only policy; refusal and truncation run no tools |
| Public-run tooling | four distinct non-public keys; value only between roles; owner refuses mismatched drafts; budget with gas floor; deploy-gate reset |

## 7. Reproducibility

- **Public results:** reproducible read-only by anyone with `node submission/tools/verify-receipts.mjs` (public RPC), or on Etherscan or Blockscout.
- **Audit chain:** reproducible from the run database copy with `verify-audit-chain.mjs`. The database itself (`backend/data/sepolia`) is git-ignored. Decide whether to publish an export.
- **Local:** the full public sequence replays on a throwaway chain with `npm run demo:rehearse`. It passed on the redesigned UI today.
- **Videos:** mini-clips re-render from the preserved sources with `node submission/tools/clips/render.mjs`. It uses the Remotion install in a separate local project (`D:\my-video`); see the note in §8.

## 8. Third-party components and attribution

| Component | License | Use |
|---|---|---|
| OpenZeppelin Contracts 5.6.1 | MIT | contract base (Ownable2Step, ReentrancyGuard, SafeERC20, Pausable) |
| Hardhat, ethers 6, Express, zod, PGlite, React, Vite, Tailwind, react-router | MIT / Apache-2.0 | stack |
| Stable-Baselines3, Gymnasium, FastAPI | MIT | RL engine |
| Material Symbols | Apache-2.0 | icons |
| Faculty Glyphic, Fustat, JetBrains Mono | SIL OFL 1.1 | fonts (Google Fonts) |
| MetaMask extension 13.52.0 | MetaMask license | **tests only**, downloaded locally into a git-ignored folder; not redistributed |
| Remotion 4.0.529 | Remotion license (free for individuals and small teams; companies above the threshold need a licence) | **video tooling only**, not part of the product. Team to confirm eligibility |
| Playwright | Apache-2.0 | tests and recordings |
| OpenAI-compatible API (gpt-4.1-mini) | provider terms | runtime LLM; key never committed |

## 9. Open items for the team

1. Confirm the repository visibility, then commit, push and merge to `main`.
2. Upload the videos; add the links to the README and the submission form.
3. Decide whether to include the public-run database export, for the audit-chain reproducibility above.
4. Optional: fix the dev-tooling advisories R6 and R8 (`npm audit` in `frontend/`).
