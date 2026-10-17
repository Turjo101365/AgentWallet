# Requirement-to-evidence matrix

**Status codes:**
- ✅ supported by public evidence
- 🟦 supported by local evidence only
- 🟨 partial
- ⬜ missing or pending your action

"Clip" refers to `evidence/submission/mini-clips/NN-*.mp4`. Hashes refer to `submission/06-execution-evidence/EXECUTION_EVIDENCE.md`.

## A. The six official deliverables

| # | Deliverable | Output | Supporting evidence | Status | Open item |
|---|---|---|---|---|---|
| 01 | Technical documentation: architecture, core algorithm, security design | `submission/01-technical-documentation/TECHNICAL_DOCUMENTATION.md`, `architecture.svg` (editable), `architecture.png` | code under `contracts/`, `backend/`, `frontend/`, `rl-engine/`; `docs/ARCHITECTURE.md` | ✅ | none |
| 02 | Presentation deck, ≤ 10 min | made by the team (reference only: `submission/02-presentation/`) | genuine screenshots in `02-presentation/assets/`; architecture diagram; mini-clips | ⬜ | you build the deck |
| 03 | Demo video, optional, ≤ 5 min | 15 mini-clips plus `submission/03-demo-video/STORYBOARD.md` (4:50 plan) | `evidence/submission/mini-clips/CLIP_INDEX.md` | ⬜ final cut | you assemble the final video |
| 04 | Source code: README, GitHub link, deployment instructions, tests | `README.md`, `submission/04-source-code/SOURCE_CODE_AUDIT.md`, `secret-scan.json` | 118 + 35 + 24 + 8 tests; `docs/BASE_SEPOLIA_READINESS.md` | 🟨 | commit, push and merge; confirm the repo is public |
| 05 | Security self-assessment: permission tiers, known risks | `submission/05-security-assessment/SECURITY_SELF_ASSESSMENT.md` (T0–T5, matrix, R1–R20) | test suites; clips 04, 09, 10 | ✅ | none |
| 06 | Execution evidence: real on-chain hashes | `submission/06-execution-evidence/EXECUTION_EVIDENCE.md`, `receipts-verified.json` | 11 Sepolia transactions; `evidence/sepolia/*`; clips 05–09, 15 | ✅ | upload raw videos |

## B. Scoring criteria → evidence

### Task completion (40%)

| Capability | Status | Hash / file | Clip | Test |
|---|---|---|---|---|
| Natural-language AI agent drafts transactions | ✅ | `EVIDENCE.md` AI log; `0x2c83a855…` | 02 | `agent.chat.test.js` |
| Owner-approved execution | ✅ | `0x2c83a855…2e37fb` | 05, 08 | `api.execution.test.js` |
| Autonomous execution under a bounded grant | ✅ | `0xedeb6b97…e3cec3` (`TASK_GRANT`) | 06, 15 | `scheduler.test.js` |
| Unsafe action refused | ✅ (off-chain, no hash by design) | audit #10 | 04 | `unit.policy.test.js` |
| Contract deployment on a public chain | ✅ | `0x7d7492bf…ae1ad3` | 07 | contract tests |
| Deposit and withdraw | ✅ | `0xe593d6d3…`, `0x6c8fb074…` | (raw run) | contract tests |
| Recurring and conditional schedules, retries, recovery | 🟦 | — | — | `scheduler.test.js`, `api.restart.test.js` |
| Multi-asset treasury, USD valuation | 🟦 | — (mock token, synthetic feeds) | — | portfolio tests |
| Swaps and rebalancing | 🟨 contract-only / ⬜ orchestration | — | — | `AgentWallet.swap.test.js` |
| RL execution timing | 🟦 (synthetic) | — | 13 (e2e test name) | e2e RL test |

### Security & compliance (30%)

| Capability | Status | Evidence | Clip |
|---|---|---|---|
| Permission tiers T0–T5 | ✅ public (owner and agent roles) / 🟦 viewer tests | Deliverable 05; viewer replay; `api.security.test.js` | 10 |
| On-chain allowlist, per-tx and daily caps | ✅ | `EVIDENCE.md` on-chain checks | 03 |
| 14-check risk engine plus simulation | ✅ | proposal policy checks (block 11926666) | 03, 04 |
| EIP-712 approvals and bounded grants | ✅ (test bridge) / 🟦 (MetaMask) | audit #6, #15 | 05, 06, 12 |
| Owner signature and grant verified **on-chain** (contract v2) | ✅ public v2 run | `0x564129e2…` (`executeApprovedTransfer`), `0xbcdd8685…` (`executeGrantTransfer`); `evidence/sepolia-v2-full/public-verify.json` 26/26 | (raw v2 run) |
| On-chain grant revocation (contract v2) | ✅ public v2 run | `0x4b8b8efd…` (`revokeGrant`); agent probe → `GrantIsRevoked` | (raw v2 run) |
| Pause, unpause, emergency stop (contract v2) | ✅ public v2 run | `0x19576c61…`, `0xbfa8a88e…`, `0x80a42def…` | (raw v2 run) |
| Pause, unpause, emergency stop | ✅ | `0x2a2eeb50…`, `0x00b0dc31…`, `0xfe627133…` | 09 |
| Hash-chained audit, verified | ✅ (off-chain) | `term-audit.log` | 11 |
| Prompt-injection and tool-use controls | 🟦 + live suite | `agent.chat.test.js`, `LIVE_LLM_VERIFICATION.md` | 10 (agent tests) |
| Known-risk register | ✅ | R1–R27 | — |
| Secret hygiene | ✅ | `secret-scan.json` | — |
| Compliance (sanctions screening, KYC) | ⬜ | allowlist only | — |
| External audit | ⬜ | none; not claimed | — |

### Innovation & interaction (30%)

| Capability | Status | Clip |
|---|---|---|
| Policy-bounded autonomy (grant + auto-approval limit + contract caps) | ✅ | 06, 14 |
| Explainable refusals (the agent explains a policy block) | ✅ | 04, 14 |
| Redesigned command-deck UI, PUBLIC vs LOCAL distinction | ✅ (public read-only replay) | 01 |
| Live AI decision logging and transaction correlation | ✅ | 11 |
| Real MetaMask UX | 🟦 | 12 |

### On-chain challenge bonus (0–5)

| Evidence | Status |
|---|---|
| 11 public transactions, all SUCCESS, re-verified independently | ✅ |
| AI-drafted autonomous transaction on a public chain | ✅ |
| Emergency controls exercised on-chain | ✅ |
| Contract v2: 12 public transactions, all SUCCESS (owner signature and grant verified on-chain, revocation, emergency controls), 26/26 read-only checks | ✅ (`evidence/sepolia-v2-full/`) |
| Public explorer recordings | ✅ (post-run verification) |

## C. Mini-clip coverage

| Clip | Public footage | Local footage | Hashes shown |
|---|---|---|---|
| 01 dashboard | replay of public data | — | (UI list) |
| 02 AI command | original run + replay | — | — |
| 03 risk engine | replay | — | — |
| 04 rejected | original run + replay + live verification | — | none (by design) |
| 05 owner approval | original run + replay + explorer | — | `0x2c83a855…` |
| 06 autonomous | original run + replay + explorer + live verification | — | `0xedeb6b97…` |
| 07 deployment | run log + explorer | — | `0x7d7492bf…`, contract |
| 08 verification | explorer + live receipt check | — | all 11 |
| 09 emergency | original run + explorer | — | `0xfe627133…` |
| 10 permissions | replay (viewer, owner) | tests | — |
| 11 audit | replay + live verification | — | 2 transfers |
| 12 MetaMask | — | real MetaMask, Hardhat | local only |
| 13 architecture | replay (health) | diagram + e2e tests | — |
| 14 innovation | mixed, each labelled | — | `0xedeb6b97…` |
| 15 end-to-end | original run + replay + explorer + verification | — | `0xedeb6b97…` |
