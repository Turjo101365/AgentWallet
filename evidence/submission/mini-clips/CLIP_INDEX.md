# Mini-clip index

Every clip is cut from genuine footage. Overlays (labels, captions, highlight boxes, subtle zooms) only point at real UI. Source files are preserved unchanged, and their SHA-256 hashes are in `evidence/sepolia/MANIFEST.json` and `evidence/submission/MANIFEST.json`. Rendered with `node submission/tools/clips/render.mjs` from `submission/tools/clips/spec.mjs`.

`handles/` holds the same source ranges with 3 s of extra footage on each side and no overlays, for your own edit.

| Clip | Duration | Resolution | Classification | Criterion |
|---|---|---|---|---|
| `01-dashboard.mp4` | 21.9 s | 1920×1080 · 30 fps · h264 | Public-run data, post-run read-only replay | Innovation & Interaction (30%) · Task completion (40%) |
| `02-ai-command.mp4` | 20.9 s | 1920×1080 · 30 fps · h264 | Public (original run recording) + post-run replay | Task completion (AI agent) · Innovation & Interaction |
| `03-risk-engine.mp4` | 21.0 s | 1920×1080 · 30 fps · h264 | Public-run data, post-run replay | Security & Compliance (30%) · Task completion |
| `04-rejected-transaction.mp4` | 18.3 s | 1920×1080 · 30 fps · h264 | Public (original) + post-run replay + live verification of the public-run audit chain | Security & Compliance (30%) |
| `05-owner-approval.mp4` | 21.0 s | 1920×1080 · 30 fps · h264 | Public (original run) + post-run replay + post-run explorer verification | Security & Compliance · Task completion |
| `05-owner-approval-v2.mp4` | 31.5 s | 1920×1080 · 30 fps · h264 | Public original run recording (owner signed by the test-only EIP-1193 bridge) + live read-only verification of the public-run data + post-run explorer verification; final segment is a SEPARATE LOCAL Hardhat run with the real MetaMask extension | Security & Compliance (30%) · Task completion · Execution evidence |
| `06-autonomous-execution.mp4` | 32.0 s | 1920×1080 · 30 fps · h264 | Public (original run) + post-run replay + post-run explorer + live audit verification | Task completion (autonomous execution) · On-chain bonus |
| `07-contract-deployment.mp4` | 19.8 s | 1920×1080 · 30 fps · h264 | Public (original run log page) + post-run explorer verification | Execution evidence · On-chain bonus |
| `08-public-verification.mp4` | 22.2 s | 1920×1080 · 30 fps · h264 | Post-run explorer verification + live read-only receipt check | Execution evidence (06) · On-chain bonus |
| `09-emergency-controls.mp4` | 24.3 s | 1920×1080 · 30 fps · h264 | Public (original run) + post-run explorer verification | Security & Compliance (30%) |
| `10-permission-security.mp4` | 25.2 s | 1920×1080 · 30 fps · h264 | Public-run data replay (viewer and owner) + LOCAL test runs | Security & Compliance (30%) |
| `11-audit-monitoring.mp4` | 20.1 s | 1920×1080 · 30 fps · h264 | Public-run data replay + live independent verification of the public-run audit chain | Security & Compliance · Innovation (explainability) |
| `12-metamask-local.mp4` | 27.5 s | 1920×1080 · 30 fps · h264 | LOCAL HARDHAT TESTING with the real MetaMask 13.52.0 extension | Security & Compliance · Innovation & Interaction |
| `13-system-architecture.mp4` | 21.3 s | 1920×1080 · 30 fps · h264 | Explanatory diagram + LOCAL e2e test run + public-data replay (health) | Technical documentation (01) · Task completion |
| `13-system-architecture-v2.mp4` | 26.0 s | 1920×1080 · 30 fps · h264 | Explanatory architecture diagram, screen-recorded in a browser (not execution evidence) | Technical documentation (01) · Task completion · Security & Compliance |
| `14-innovation.mp4` | 23.6 s | 1920×1080 · 30 fps · h264 | Mixed, each segment labelled (public original, replay, explorer, live verification) | Innovation & Interaction (30%) · On-chain bonus |
| `15-end-to-end.mp4` | 34.4 s | 1920×1080 · 30 fps · h264 | Public (original run) + replay + post-run explorer + live verification | Task completion (40%) · Execution evidence · On-chain bonus |

## 01-dashboard.mp4: Project overview & dashboard

- **Duration / format:** 21.90 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public-run data, post-run read-only replay
- **AI model:** n/a. The replay has no LLM connected, so the AI badge shows "Model unavailable"; the stored turns name gpt-4.1-mini
- **Transaction hashes:** UI list of all public transactions (explorer chips)
- **Supporting logs:** evidence/submission/footage/replay-log.json
- **Evidence limitations:** Replay of a COPY of the run database after the run, with the executor disabled. Balances are live from the chain; the contract is paused now.
- **Supports:** Innovation & Interaction (30%) · Task completion (40%)

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/replay-owner.webm` | 14.0–18.7 s | captured 2026-10-16 · source t 14.0–18.7 s | replay | Treasury, agent status and kill switches: live from the public contract |
| 2 | `evidence/submission/footage/replay-owner.webm` | 20.4–24.0 s | captured 2026-10-16 · source t 20.4–24.0 s | replay | AI command center |
| 3 | `evidence/submission/footage/replay-owner.webm` | 26.0–29.6 s | captured 2026-10-16 · source t 26.0–29.6 s | replay | Risk engine: caps and recent policy decisions |
| 4 | `evidence/submission/footage/replay-owner.webm` | 31.6–35.0 s | captured 2026-10-16 · source t 31.6–35.0 s | replay | Autonomous operations under signed task grants |
| 5 | `evidence/submission/footage/replay-owner.webm` | 37.2–40.4 s | captured 2026-10-16 · source t 37.2–40.4 s | replay | Verified transactions, each linked to the public explorer |
| 6 | `evidence/submission/footage/replay-owner.webm` | 42.8–46.2 s | captured 2026-10-16 · source t 42.8–46.2 s | replay | Live hash-chained audit trail |

## 02-ai-command.mp4: AI command center

- **Duration / format:** 20.90 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original run recording) + post-run replay
- **AI model:** gpt-4.1-mini (openai-compatible), real API calls during the public run, 4 model calls
- **Transaction hashes:** leads to 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb
- **Supporting logs:** evidence/sepolia/EVIDENCE.md (AI agent execution log)
- **Evidence limitations:** The original recording shows the earlier console UI; the replay shows the same stored turn in the redesigned UI.
- **Supports:** Task completion (AI agent) · Innovation & Interaction

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 200.0–206.0 s | 10:07:12–10:07:18 UTC · source t 200.0–206.0 s | public | Owner types a natural-language instruction |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 211.5–218.5 s | 10:07:24–10:07:31 UTC · source t 211.5–218.5 s | public | gpt-4.1-mini plans and calls tools: list_recipients → record_plan → propose_transfer |
| 3 | `evidence/submission/footage/replay-owner.webm` | 58.4–62.7 s | captured 2026-10-16 · source t 58.4–62.7 s | replay | Same public-run turn in the redesigned console: tool input and output |
| 4 | `evidence/submission/footage/replay-owner.webm` | 64.0–67.6 s | captured 2026-10-16 · source t 64.0–67.6 s | replay | Result: a transfer proposal that still needs the owner |

## 03-risk-engine.mp4: Risk engine & policy evaluation

- **Duration / format:** 21.00 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public-run data, post-run replay
- **AI model:** —
- **Transaction hashes:** policy evaluation at block 11926666 / 11926670
- **Supporting logs:** proposal policyResult in the run database; audit #4, #10
- **Evidence limitations:** Shows the stored results of the evaluations that ran during the public run; not a re-evaluation.
- **Supports:** Security & Compliance (30%) · Task completion

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/replay-owner.webm` | 106.9–110.9 s | captured 2026-10-16 · source t 106.9–110.9 s | replay | Block-pinned policy checks on every transfer (15 for a task run, incl. AUTOMATION_ACTIVE) |
| 2 | `evidence/submission/footage/replay-owner.webm` | 119.0–122.5 s | captured 2026-10-16 · source t 119.0–122.5 s | replay | Owner-approved transfer: all checks passed, signature required |
| 3 | `evidence/submission/footage/replay-owner.webm` | 132.0–136.1 s | captured 2026-10-16 · source t 132.0–136.1 s | replay | Unsafe draft: two checks fail |
| 4 | `evidence/submission/footage/replay-owner.webm` | 137.6–140.8 s | captured 2026-10-16 · source t 137.6–140.8 s | replay | Result: blocked before any signature or broadcast |
| 5 | `evidence/submission/footage/replay-owner.webm` | 195.5–198.6 s | captured 2026-10-16 · source t 195.5–198.6 s | replay | Owner policy: reserve floor, auto-approval limit, circuit breaker |
| 6 | `evidence/submission/footage/replay-owner.webm` | 200.6–203.7 s | captured 2026-10-16 · source t 200.6–203.7 s | replay | Contract caps, enforced on-chain by executeTransfer |

## 04-rejected-transaction.mp4: Rejected unsafe transaction (0.0003 ETH)

- **Duration / format:** 18.30 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original) + post-run replay + live verification of the public-run audit chain
- **AI model:** gpt-4.1-mini
- **Transaction hashes:** none: the transfer was never broadcast (by design)
- **Supporting logs:** audit #10 PROPOSAL_POLICY_REJECTED (term-audit.log); RUN_NOTES.md nonce check
- **Evidence limitations:** There is no on-chain rejection transaction; the rejection happened off-chain before signing.
- **Supports:** Security & Compliance (30%)

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 268.0–271.6 s | 10:08:20–10:08:24 UTC · source t 268.0–271.6 s | public | Instruction: send 0.0003 ETH (above the 0.0002 ETH per-tx cap) |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 277.6–281.0 s | 10:08:30–10:08:33 UTC · source t 277.6–281.0 s | public | Policy engine rejects the AI draft; the agent explains why |
| 3 | `evidence/submission/footage/replay-owner.webm` | 132.2–136.1 s | captured 2026-10-16 · source t 132.2–136.1 s | replay | The exact failed checks |
| 4 | `evidence/submission/footage/replay-owner.webm` | 137.6–141.4 s | captured 2026-10-16 · source t 137.6–141.4 s | replay | Blocked by policy: never signed, never broadcast |
| 5 | `evidence/submission/footage/term-audit.webm` | 12.0–15.6 s | node submission/tools/verify-audit-chain.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | Audit log: rejection recorded off-chain with no transaction hash |

## 05-owner-approval.mp4: Owner approval & EIP-712 signature

- **Duration / format:** 21.00 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original run) + post-run replay + post-run explorer verification
- **AI model:** gpt-4.1-mini drafted the transfer
- **Transaction hashes:** 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb (block 11926668)
- **Supporting logs:** audit #6–#9
- **Evidence limitations:** Signed programmatically by the test-only EIP-1193 bridge, NOT MetaMask (see clip 12 for MetaMask, local). Signing in the public run used the test-only EIP-1193 bridge (programmatic owner key), not the MetaMask extension. See 12-metamask-local for real MetaMask signing on a local chain.
- **Supports:** Security & Compliance · Task completion

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 219.3–225.6 s | 10:07:32–10:07:38 UTC · source t 219.3–225.6 s | public | Owner reviews the AI-drafted transfer and signs exactly this transfer (EIP-712) |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 262.0–268.0 s | 10:08:14–10:08:20 UTC · source t 262.0–268.0 s | public | Agent key executes; receipt verified on-chain |
| 3 | `evidence/submission/footage/replay-owner.webm` | 124.0–126.9 s | captured 2026-10-16 · source t 124.0–126.9 s | replay | Approved by the owner signature (0x10A0…b5ba) |
| 4 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 64.2–70.0 s | 10:23:17–10:23:23 UTC · source t 64.2–70.0 s | verify | Public explorer: Success · executeTransfer · sent by the agent key |

## 05-owner-approval-v2.mp4: Owner approval & EIP-712 signature (v2)

- **Duration / format:** 31.50 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public original run recording (owner signed by the test-only EIP-1193 bridge) + live read-only verification of the public-run data + post-run explorer verification; final segment is a SEPARATE LOCAL Hardhat run with the real MetaMask extension
- **AI model:** gpt-4.1-mini drafted the proposal (public run)
- **Transaction hashes:** 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb (block 11926668). The local MetaMask segment is a different proposal on a local chain, not public
- **Supporting logs:** Authorization evidence: EIP-712 ApproveTransfer, domain "AgentWallet Operator Approval" v1, chainId 11155111, verifyingContract 0x8A44716E…F956a6; recovered signer 0x10A0d3247a1446fD30ba40D14e4272206278b5ba = contract owner(); signature stored in proposals.approval_signature and in audit entry #6 PROPOSAL_APPROVED; verified by submission/tools/verify-owner-approval.mjs (term-owner-approval.log); code: backend/src/lib/approval.js, services/proposalService.js approve()
- **Evidence limitations:** The owner signature is verified OFF-CHAIN by the backend (recoverApprover + signer == owner()); the contract does not check it, it only enforces agent-only execution, allowlist, caps and one-time intents. Public signing was programmatic (test-only bridge), not MetaMask; the MetaMask segment is local and a different proposal. The ~40 s wait between approval and receipt is cut. Public signing used the test-only EIP-1193 bridge holding the owner key. The final segment is a SEPARATE local Hardhat run with the real MetaMask extension, labelled as such; it is not the public transaction.
- **Supports:** Security & Compliance (30%) · Task completion · Execution evidence

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 217.0–219.5 s | 10:07:29–10:07:32 UTC · source t 217.0–219.5 s | public | AI-generated proposal (gpt-4.1-mini · propose_transfer) |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 219.9–222.1 s | 10:07:32–10:07:34 UTC · source t 219.9–222.1 s | publicbridge | Owner authorization required: policy passed, EIP-712 signature requested |
| 3 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 222.4–225.3 s | 10:07:35–10:07:38 UTC · source t 222.4–225.3 s | publicbridge | Signature accepted: approved by the owner, not by the AI |
| 4 | `evidence/submission/footage/term-owner-approval.webm` | 12.6–15.6 s | node submission/tools/verify-owner-approval.mjs · run 2026-10-16 18:19 UTC · exit 0 | liveverify | What the owner signed: EIP-712 ApproveTransfer, bound to chain, contract, intent, recipient, amount, deadline |
| 5 | `evidence/submission/footage/term-owner-approval.webm` | 15.6–18.6 s | node submission/tools/verify-owner-approval.mjs · run 2026-10-16 18:19 UTC · exit 0 | liveverify | EIP-712 signature verified: recovered signer = contract owner() |
| 6 | `evidence/submission/footage/term-owner-approval.webm` | 18.6–21.6 s | node submission/tools/verify-owner-approval.mjs · run 2026-10-16 18:19 UTC · exit 0 | liveverify | Authorized execution: agent key sent exactly the signed intent, recipient and amount |
| 7 | `evidence/submission/footage/term-owner-approval.webm` | 21.6–24.0 s | node submission/tools/verify-owner-approval.mjs · run 2026-10-16 18:19 UTC · exit 0 | liveverify | Limitation: the signature is checked off-chain by the backend; the contract enforces agent-only, allowlist and caps |
| 8 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 263.0–267.7 s | 10:08:15–10:08:20 UTC · source t 263.0–267.7 s | public | Agent key executes; status only CONFIRMED after the receipt |
| 9 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 64.6–69.1 s | 10:23:18–10:23:22 UTC · source t 64.6–69.1 s | verify | Public Sepolia transaction confirmed: Success · block 11926668 · sent by the agent key |
| 10 | `evidence/submission/footage/metamask/mm-approve.webm` | 16.4–19.7 s | — | localmm | Separate LOCAL Hardhat run (different proposal): an ApproveTransfer request in the real MetaMask extension |

## 06-autonomous-execution.mp4: Autonomous on-chain execution

- **Duration / format:** 32.00 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original run) + post-run replay + post-run explorer + live audit verification
- **AI model:** gpt-4.1-mini drafted the task
- **Transaction hashes:** 0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3 (block 11926686)
- **Supporting logs:** audit #13–#22; EVIDENCE.md (approval_kind TASK_GRANT)
- **Evidence limitations:** The ~2.5 min wait between grant and execution is cut. The grant signature used the test-only bridge.
- **Supports:** Task completion (autonomous execution) · On-chain bonus

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 295.5–299.4 s | 10:08:48–10:08:52 UTC · source t 295.5–299.4 s | public | User-defined intent: a one-time payment, valid for 1 day |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 303.6–308.6 s | 10:08:56–10:09:01 UTC · source t 303.6–308.6 s | public | AI agent drafts the task (schedule_payment): inactive until the owner signs |
| 3 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 313.0–317.0 s | 10:09:05–10:09:09 UTC · source t 313.0–317.0 s | public | OWNER ACTION, ONCE: signs the bounded task grant (EIP-712) |
| 4 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 484.0–488.4 s | 10:11:56–10:12:01 UTC · source t 484.0–488.4 s | public | AUTONOMOUS: scheduler + agent key execute with no per-transfer signature |
| 5 | `evidence/submission/footage/replay-owner.webm` | 151.3–156.0 s | captured 2026-10-16 · source t 151.3–156.0 s | replay | Risk evaluation of the run: passed policy, approval route AUTO_GRANT |
| 6 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 74.0–79.8 s | 10:23:27–10:23:33 UTC · source t 74.0–79.8 s | verify | Public receipt: Success · block 11926686 |
| 7 | `evidence/submission/footage/term-audit.webm` | 12.0–16.2 s | node submission/tools/verify-audit-chain.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | Audit chain: run created → auto-approved by grant → submitted → confirmed |

## 07-contract-deployment.mp4: Public smart-contract deployment

- **Duration / format:** 19.80 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original run log page) + post-run explorer verification
- **AI model:** —
- **Transaction hashes:** deploy 0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3; contract 0x8A44716Efabb6Ce401291B91D4427149CaF956a6
- **Supporting logs:** evidence/sepolia/run-log.txt
- **Evidence limitations:** The live explorer clip from the run showed "Pending" and ads, so the post-run verification (10:22 UTC) is used instead. The deploy itself was run by the script (run-log page), not a UI.
- **Supports:** Execution evidence · On-chain bonus

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 66.0–76.0 s | 10:04:58–10:05:08 UTC · source t 66.0–76.0 s | public | Live run log: deployer deploys AgentWallet on Ethereum Sepolia |
| 2 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 8.0–12.0 s | 10:22:21–10:22:25 UTC · source t 8.0–12.0 s | verify | Contract page on the public explorer |
| 3 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 35.2–41.0 s | 10:22:48–10:22:54 UTC · source t 35.2–41.0 s | verify | Deployment transaction: Success · block 11926653 |

## 08-public-verification.mp4: Public transaction verification

- **Duration / format:** 22.20 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Post-run explorer verification + live read-only receipt check
- **AI model:** —
- **Transaction hashes:** all 11 (receipts terminal); explorer: 0x2c83a855…, 0xedeb6b97…
- **Supporting logs:** submission/06-execution-evidence/receipts-verified.json; term-receipts.log
- **Evidence limitations:** Blockscout, not Etherscan (Etherscan blocks automation). Recorded after the run; labelled as such.
- **Supports:** Execution evidence (06) · On-chain bonus

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 64.6–70.0 s | 10:23:18–10:23:23 UTC · source t 64.6–70.0 s | verify | Owner-approved AI transfer |
| 2 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 74.4–79.8 s | 10:23:27–10:23:33 UTC · source t 74.4–79.8 s | verify | Autonomous AI transfer (task grant) |
| 3 | `evidence/submission/footage/term-receipts.webm` | 3.0–9.8 s | node submission/tools/verify-receipts.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | Independent receipt check over a public RPC: status, block, sender, decoded events |
| 4 | `evidence/submission/footage/term-receipts.webm` | 13.4–18.0 s | node submission/tools/verify-receipts.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | All 11 transactions successful; contract now paused, agent revoked |

## 09-emergency-controls.mp4: Pause, unpause & emergency stop

- **Duration / format:** 24.30 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original run) + post-run explorer verification
- **AI model:** —
- **Transaction hashes:** pause 0x2a2eeb50…bd211b; unpause 0x00b0dc31…f2f3d0; emergencyStop 0xfe627133…e53a8d
- **Supporting logs:** run-log.txt; receipts-verified.json
- **Evidence limitations:** The earlier console UI (original recording). Waits for confirmation are trimmed.
- **Supports:** Security & Compliance (30%)

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 489.6–493.6 s | 10:12:02–10:12:06 UTC · source t 489.6–493.6 s | public | Owner pauses the contract (wallet transaction) |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 502.0–506.0 s | 10:12:14–10:12:18 UTC · source t 502.0–506.0 s | public | Contract: Paused |
| 3 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 525.6–529.6 s | 10:12:38–10:12:42 UTC · source t 525.6–529.6 s | public | Owner unpauses: submitted, then confirmed in block 11926691 |
| 4 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 532.0–535.2 s | 10:12:44–10:12:48 UTC · source t 532.0–535.2 s | public | Emergency stop: pause + revoke the agent key in one transaction |
| 5 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 539.4–543.2 s | 10:12:52–10:12:56 UTC · source t 539.4–543.2 s | public | Emergency stop: submitted, then confirmed in block 11926692 |
| 6 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 103.4–108.7 s | 10:23:56–10:24:02 UTC · source t 103.4–108.7 s | verify | Public receipt: emergencyStop · Paused, AgentUpdated, EmergencyStop |

## 10-permission-security.mp4: Permission tiers & security

- **Duration / format:** 25.20 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public-run data replay (viewer and owner) + LOCAL test runs
- **AI model:** —
- **Transaction hashes:** —
- **Supporting logs:** term-security-tests.log, term-contract-tests.log
- **Evidence limitations:** Viewer and owner sessions are post-run replays; the test runs are local Hardhat.
- **Supports:** Security & Compliance (30%)

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/replay-viewer.webm` | 12.6–15.0 s | captured 2026-10-16 · source t 12.6–15.0 s | replay | VIEWER: a different wallet signs in read-only |
| 2 | `evidence/submission/footage/replay-viewer.webm` | 19.0–24.0 s | captured 2026-10-16 · source t 19.0–24.0 s | replay | Viewer cannot pause, stop or change limits (backend + contract onlyOwner) |
| 3 | `evidence/submission/footage/replay-viewer.webm` | 28.2–32.2 s | captured 2026-10-16 · source t 28.2–32.2 s | replay | Viewer cannot use the AI agent |
| 4 | `evidence/submission/footage/replay-owner.webm` | 219.8–224.6 s | captured 2026-10-16 · source t 219.8–224.6 s | replay | Authority split: owner key in the wallet, agent key bounded by the contract |
| 5 | `evidence/submission/footage/term-security-tests.webm` | 25.0–30.0 s | node --test --test-reporter=spec test/api.security.test.js · run 2026-10-16 15:28 UTC · exit 0 | local | Backend authorization tests (local): unauthenticated, viewer and forged approvals rejected |
| 6 | `evidence/submission/footage/term-contract-tests.webm` | 12.2–16.2 s | npx hardhat test · run 2026-10-16 15:29 UTC · exit 0 | local | Contract tests (local Hardhat): onlyOwner, onlyAgent, caps, allowlist, pause |

## 11-audit-monitoring.mp4: Audit trail & AI monitoring

- **Duration / format:** 20.07 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public-run data replay + live independent verification of the public-run audit chain
- **AI model:** gpt-4.1-mini (stored turn)
- **Transaction hashes:** 0x2c83a855…, 0xedeb6b97… (correlated from audit entries)
- **Supporting logs:** term-audit.log
- **Evidence limitations:** The replay's own sign-ins add entries after #22 (shown as 23+); the independent check verifies the original 22 from an untouched copy.
- **Supports:** Security & Compliance · Innovation (explainability)

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/replay-owner.webm` | 58.6–62.7 s | captured 2026-10-16 · source t 58.6–62.7 s | replay | AI decision log: model, calls, plan and every tool call (input and output) are stored |
| 2 | `evidence/submission/footage/replay-owner.webm` | 175.0–178.1 s | captured 2026-10-16 · source t 175.0–178.1 s | replay | Audit log: append-only, hash-chained |
| 3 | `evidence/submission/footage/replay-owner.webm` | 180.3–183.6 s | captured 2026-10-16 · source t 180.3–183.6 s | replay | Each execution entry carries its public transaction hash |
| 4 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 558.4–561.0 s | 10:13:11–10:13:13 UTC · source t 558.4–561.0 s | public | During the public run: chain valid · 22 entries |
| 5 | `evidence/submission/footage/term-audit.webm` | 9.4–11.8 s | node submission/tools/verify-audit-chain.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | Independent re-computation of the 22-entry chain from the public run |
| 6 | `evidence/submission/footage/term-audit.webm` | 11.8–16.4 s | node submission/tools/verify-audit-chain.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | CHAIN VALID; executions correlated to public transaction hashes |

## 12-metamask-local.mp4: MetaMask integration (LOCAL HARDHAT)

- **Duration / format:** 27.50 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** LOCAL HARDHAT TESTING with the real MetaMask 13.52.0 extension
- **AI model:** — (row 9, the AI-drafted approval, was BLOCKED: it needs a paid LLM call, not made)
- **Transaction hashes:** local chain only (not public)
- **Supporting logs:** evidence/submission/footage/metamask/checklist-report.md
- **Evidence limitations:** The public Sepolia run did NOT use MetaMask. Local chain only. Real MetaMask 13.52.0 extension on a local Hardhat chain (31337), driven by the checklist harness. The public Sepolia run did NOT use MetaMask.
- **Supports:** Security & Compliance · Innovation & Interaction

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/metamask/metamask-dapp.webm` | 36.0–39.5 s | — | localmm | Connect wallet with the real MetaMask extension |
| 2 | `evidence/submission/footage/metamask/mm-connect.webm` | 25.0–28.4 s | — | localmm | MetaMask: connect this site (Account 1) |
| 3 | `evidence/submission/footage/metamask/metamask-dapp.webm` | 88.0–91.5 s | — | localmm | Network verification: the console refuses the wrong chain |
| 4 | `evidence/submission/footage/metamask/mm-signin.webm` | 6.4–9.6 s | — | localmm | SIWE sign-in request: no transaction, no spending |
| 5 | `evidence/submission/footage/metamask/metamask-dapp.webm` | 178.0–181.5 s | — | localmm | Signed in as owner; a transfer awaits approval |
| 6 | `evidence/submission/footage/metamask/mm-approve.webm` | 15.8–19.4 s | — | localmm | EIP-712 ApproveTransfer: exact proposal, intent, recipient, amount, deadline |
| 7 | `evidence/submission/footage/metamask/metamask-dapp.webm` | 237.0–241.0 s | — | localmm | Transfer confirmed on the local chain |
| 8 | `evidence/submission/footage/metamask/mm-pause.webm` | 10.4–13.2 s | — | localmm | Owner transaction in MetaMask: pause the contract |

## 13-system-architecture.mp4: System architecture

- **Duration / format:** 21.30 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Explanatory diagram + LOCAL e2e test run + public-data replay (health)
- **AI model:** —
- **Transaction hashes:** —
- **Supporting logs:** term-e2e.log
- **Evidence limitations:** The diagram is an illustration, not evidence. In the replay the executor is deliberately disabled and the RL service is not running.
- **Supports:** Technical documentation (01) · Task completion

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `submission/01-technical-documentation/architecture.svg` | 0.0–9.0 s | — | diagram | Components and trust boundaries (explanatory diagram) |
| 2 | `evidence/submission/footage/term-e2e.webm` | 29.2–33.4 s | node --test --test-reporter=spec tests/e2e/ · run 2026-10-16 15:31 UTC · exit 0 | local | Running components end to end (local): chain, backend, SIWE, executor, indexer, scheduler, RL checkpoints |
| 3 | `evidence/submission/footage/term-e2e.webm` | 34.2–37.3 s | node --test --test-reporter=spec tests/e2e/ · run 2026-10-16 15:31 UTC · exit 0 | local | End-to-end suite: 8 tests, 8 pass, 0 fail (local) |
| 4 | `evidence/submission/footage/replay-owner.webm` | 219.8–224.8 s | captured 2026-10-16 · source t 219.8–224.8 s | replay | Live health of the console against the public deployment (replay: executor deliberately disabled) |

## 13-system-architecture-v2.mp4: System architecture (v2)

- **Duration / format:** 26.00 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Explanatory architecture diagram, screen-recorded in a browser (not execution evidence)
- **AI model:** diagram shows gpt-4.1-mini as an external, untrusted planner
- **Transaction hashes:** contract 0x8A44716Efabb6Ce401291B91D4427149CaF956a6 (label only)
- **Supporting logs:** Architecture source: submission/01-technical-documentation/architecture-v2.svg (editable) and .png; verified against frontend/src, backend/src/{routes/api.js, services/agentChatService.js, llm/tools.js, services/riskEngine.js, services/proposalService.js, services/schedulerService.js, services/executorService.js, repositories/index.js}, contracts/src/AgentWallet.sol
- **Evidence limitations:** Illustration only. RL timing is shown as optional and local-only (opt-in per task, may only defer; use_rl_timing was false in the public run). No terminal or test footage; the v1 clip keeps the e2e test run if needed as testing evidence. Explanatory diagram only (source: submission/01-technical-documentation/architecture-v2.svg), screen-recorded in a browser; it is not execution evidence. No test output.
- **Supports:** Technical documentation (01) · Task completion · Security & Compliance

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/architecture-v2-screen.webm` | 1.0–4.5 s | — | diagram | AgentWallet architecture: six layers, one payment path |
| 2 | `evidence/submission/footage/architecture-v2-screen.webm` | 4.5–9.0 s | — | diagram | 1–2 · User and AI: console → API → agent orchestrator ↔ gpt-4.1-mini → typed tools (drafts only) |
| 3 | `evidence/submission/footage/architecture-v2-screen.webm` | 9.0–14.5 s | — | diagram | 3–4 · Risk and authorization boundary: deterministic checks, then the owner signs one transfer or a bounded grant |
| 4 | `evidence/submission/footage/architecture-v2-screen.webm` | 14.5–19.0 s | — | diagram | 5 · Only the agent key executes; the contract enforces allowlist, caps and one-time intents on Ethereum Sepolia |
| 5 | `evidence/submission/footage/architecture-v2-screen.webm` | 19.0–23.5 s | — | diagram | 6 · Logging and verification: hash-chained audit log, receipt-verified history, public explorers |
| 6 | `evidence/submission/footage/architecture-v2-screen.webm` | 23.5–27.0 s | — | diagram | RL timing is an optional, local-only advisor: not part of the live decision path or the public run |

## 14-innovation.mp4: Innovation: policy-bounded, explainable, verifiable autonomy

- **Duration / format:** 23.60 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Mixed, each segment labelled (public original, replay, explorer, live verification)
- **AI model:** gpt-4.1-mini
- **Transaction hashes:** 0xedeb6b97…e3cec3; 0xfe627133…e53a8d
- **Supporting logs:** term-audit.log
- **Evidence limitations:** Treasury rebalancing is NOT shown: it is a proposal, not implemented.
- **Supports:** Innovation & Interaction (30%) · On-chain bonus

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/submission/footage/replay-owner.webm` | 151.3–155.6 s | captured 2026-10-16 · source t 151.3–155.6 s | replay | Policy-bounded autonomy: a signed grant, not a blank cheque |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 277.6–281.0 s | 10:08:30–10:08:33 UTC · source t 277.6–281.0 s | public | Explainable AI: the agent reports why policy refused its own draft |
| 3 | `evidence/submission/footage/replay-owner.webm` | 132.2–136.1 s | captured 2026-10-16 · source t 132.2–136.1 s | replay | Risk-aware execution: deterministic checks the model cannot override |
| 4 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 539.4–543.0 s | 10:12:52–10:12:55 UTC · source t 539.4–543.0 s | public | Owner override: emergency stop revokes the agent on-chain |
| 5 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 74.4–79.4 s | 10:23:27–10:23:32 UTC · source t 74.4–79.4 s | verify | Verifiable: the autonomous transfer on the public explorer |
| 6 | `evidence/submission/footage/term-audit.webm` | 12.2–15.6 s | node submission/tools/verify-audit-chain.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | Auditable: every agent action in a verifiable hash chain |

## 15-end-to-end.mp4: Complete end-to-end workflow

- **Duration / format:** 34.40 s · 1920×1080 · 30.00 fps · h264 (yuvj420p) · no audio
- **Classification:** Public (original run) + replay + post-run explorer + live verification
- **AI model:** gpt-4.1-mini
- **Transaction hashes:** 0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3
- **Supporting logs:** audit #13–#22; receipts-verified.json
- **Evidence limitations:** Condensed: about 2.5 min of scheduler wait is cut between steps 3 and 5.
- **Supports:** Task completion (40%) · Execution evidence · On-chain bonus

| # | Source file | Source range | Wall clock / run | Label | Caption |
|---|---|---|---|---|---|
| 1 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 295.5–299.4 s | 10:08:48–10:08:52 UTC · source t 295.5–299.4 s | public | 1 · User instruction |
| 2 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 303.6–308.2 s | 10:08:56–10:09:01 UTC · source t 303.6–308.2 s | public | 2 · AI proposal (gpt-4.1-mini → schedule_payment) |
| 3 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 313.0–316.8 s | 10:09:05–10:09:09 UTC · source t 313.0–316.8 s | public | 3 · Authorization: owner signs the bounded grant once (EIP-712) |
| 4 | `evidence/submission/footage/replay-owner.webm` | 151.3–155.4 s | captured 2026-10-16 · source t 151.3–155.4 s | replay | 4 · Policy check of the run: passed, route AUTO_GRANT |
| 5 | `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | 484.0–488.4 s | 10:11:56–10:12:01 UTC · source t 484.0–488.4 s | public | 5 · Autonomous execution by the scheduler and agent key |
| 6 | `evidence/sepolia/recordings/raw/explorer-verification.webm` | 74.2–79.8 s | 10:23:27–10:23:33 UTC · source t 74.2–79.8 s | verify | 6 · Public blockchain confirmation |
| 7 | `evidence/submission/footage/term-receipts.webm` | 13.4–17.2 s | node submission/tools/verify-receipts.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | 6 · Receipt re-verified independently over a public RPC |
| 8 | `evidence/submission/footage/term-audit.webm` | 12.0–16.2 s | node submission/tools/verify-audit-chain.mjs · run 2026-10-16 15:28 UTC · exit 0 | liveverify | 7 · Audit record, hash-chained and verified |

