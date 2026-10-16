# Demo video storyboard (Deliverable 03, optional, ≤ 5:00)

This is not the final video. You assemble and polish it from the 15 mini-clips in `evidence/submission/mini-clips/`. The plan below runs **4:50**, leaving a 10-second safety margin under the 5-minute limit.

**Ground rules for the edit, to keep the evidence honest:**
- Keep each clip's bottom-left evidence badge visible, or replace it with an equivalent label of your own:
  - `PUBLIC · ETHEREUM SEPOLIA`
  - `POST-RUN …`
  - `LOCAL TESTING`
  - `LOCAL HARDHAT · REAL METAMASK`
- Never place local footage under a "Sepolia" title.
- Speed-ups are fine for waiting time, if you show a "sped up ×N" tag. Don't speed up a confirmation in a way that makes it look instant.
- Every transaction hash you put on screen must be one of the 11 in `submission/06-execution-evidence/EXECUTION_EVIDENCE.md`.
- If you add motion-graphic recreations (e.g. an animated flow diagram), label them "illustration". They must not imitate a real UI state or confirmation.

## Timeline

| Time | Clip (trim) | On-screen label | Voiceover talking points | Motion-graphics opportunities |
|---|---|---|---|---|
| 0:00–0:12 | Title (your graphics) | — | "AI agents can plan payments. Should they hold the keys? AgentWallet: the AI plans, you authorize, the contract enforces." | Title card in the console's type (Faculty Glyphic); three-word triad animation |
| 0:12–0:32 | `01-dashboard` (0–20 s) | PUBLIC RUN DATA · POST-RUN REPLAY | "This is the treasury console, reading the live Sepolia contract: balance, approvals, agent transfers, a valid audit chain, and kill switches." | Light zoom on the PUBLIC TESTNET pill; counters for 2 transfers / 22 audit entries |
| 0:32–0:50 | `13-system-architecture` (0–9 s diagram, then 9 s of e2e terminal) | ARCHITECTURE DIAGRAM · then LOCAL TESTING | "Three trust boundaries. The owner's wallet holds custody. The backend holds only a bounded agent key. The contract is the final judge." | Draw the three dashed boundaries in sequence; pulse the agent-key box |
| 0:50–1:10 | `02-ai-command` (0–20 s) | PUBLIC · ORIGINAL RUN RECORDING | "A plain-English instruction. gpt-4.1-mini plans, looks up the allowlist and drafts a proposal. It cannot sign anything." | Callout chips for list_recipients → record_plan → propose_transfer |
| 1:10–1:30 | `03-risk-engine` (0–20 s) | POST-RUN REPLAY | "Every draft passes 14 block-pinned checks, including a simulation, before anyone is asked to sign." | Tick-mark cascade over the checks list |
| 1:30–1:48 | `04-rejected-transaction` (0–18 s) | PUBLIC · ORIGINAL + REPLAY + LIVE VERIFICATION | "Here the AI drafts 0.0003 ETH, above the 0.0002 cap. Policy blocks it. Nothing is signed or broadcast; the audit log records the rejection with no transaction hash." | Red ✗ on PER_TX_LIMIT and BALANCE_AND_RESERVE; "0 transactions" counter |
| 1:48–2:06 | `05-owner-approval` (0–18 s) | PUBLIC · ORIGINAL RUN + POST-RUN EXPLORER | "A valid draft needs the owner's EIP-712 signature over the exact recipient, amount and deadline. The agent key then executes, and we only call it confirmed after the receipt." | Highlight the hash `0x2c83a855…`; "Success" stamp synced to the explorer frame |
| 2:06–2:38 | `06-autonomous-execution` (full 32 s) **(key scene)** | PUBLIC · ORIGINAL + REPLAY + EXPLORER + AUDIT | "Autonomy, bounded. The AI drafts a scheduled payment, and the owner signs one grant. Later, the scheduler and the agent key execute with no further signature: transaction 0xedeb6b97, block 11926686. The audit chain records every step." | Split-screen timeline: "OWNER: once" vs "AUTONOMOUS"; a clock jump between 10:09 and 10:11 UTC (label it) |
| 2:38–2:58 | `09-emergency-controls` (0–20 s) | PUBLIC · ORIGINAL RUN + EXPLORER | "And the owner can always stop it: pause, unpause, and an emergency stop that revokes the agent in one transaction, all on-chain." | Big kill-switch toggle synced to the "confirmed in block" frame |
| 2:58–3:16 | `10-permission-security` (0–18 s) | POST-RUN REPLAY (viewer) + LOCAL TESTING | "Permissions are tiered. A viewer can read but not act. The agent key can only call executeTransfer. Owner powers are enforced by the contract, not by the UI." | Tier ladder T0–T5 sliding in |
| 3:16–3:34 | `11-audit-monitoring` (0–18 s) | POST-RUN REPLAY + LIVE VERIFICATION | "Every AI decision and execution is logged and hash-chained. We recompute the 22-entry chain independently and it verifies." | Chain-link animation through entries #16 → #22 |
| 3:34–3:52 | `12-metamask-local` (0–18 s) | LOCAL HARDHAT · REAL METAMASK | "With the real MetaMask extension, the owner sees exactly what they sign. This part ran on a local chain; the public run used a test wallet bridge." | Phone/extension frame around the popup; "LOCAL" badge must stay |
| 3:52–4:12 | `08-public-verification` (0–20 s) | POST-RUN EXPLORER + LIVE VERIFICATION | "Anyone can check this. All 11 transactions succeed on the public explorer and in an independent receipt check." | Grid of the 11 hashes ticking green |
| 4:12–4:34 | `14-innovation` (0–22 s) | mixed (each labelled) | "What's new: policy-bounded autonomy, explainable refusals, deterministic risk checks the model can't override, an owner override, and on-chain verifiability." | Five keyword chips, one per segment |
| 4:34–4:50 | Outro (your graphics) | — | "AgentWallet: autonomous where it's safe, human where it matters. Contract 0x8A44716E…F956a6 on Ethereum Sepolia." | Contract address, repo link (once public), team names |

**Not used in this cut but available:**
- `07-contract-deployment` (23 s): swap it in for `14` if judges weigh deployment proof more.
- `15-end-to-end` (34 s): a stand-alone alternative to scenes 02 + 06.

## Alternative 3-minute cut

01 (15 s) → 02 (15 s) → 04 (15 s) → 06 (32 s) → 09 (15 s) → 10 (15 s) → 11 (15 s) → 08 (15 s) → outro (10 s) ≈ 2:47 plus title.

## Labels to keep consistent

| Footage | Label |
|---|---|
| `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | PUBLIC · ETHEREUM SEPOLIA · ORIGINAL RUN RECORDING (test-only wallet bridge) |
| `evidence/sepolia/recordings/raw/explorer-verification.webm` | PUBLIC CHAIN · POST-RUN EXPLORER VERIFICATION (recorded 10:22 UTC, read-only, ads blocked) |
| `evidence/submission/footage/replay-*.webm` | PUBLIC RUN DATA · POST-RUN READ-ONLY REPLAY (redesigned console, copy of the run database, no executor) |
| `evidence/submission/footage/term-audit/receipts.webm` | PUBLIC DATA · LIVE VERIFICATION COMMAND |
| `term-security-tests`, `term-agent-tests`, `term-contract-tests`, `term-e2e` | LOCAL TESTING |
| `evidence/submission/footage/metamask/*` | LOCAL HARDHAT TESTING · REAL METAMASK EXTENSION |

## Things the narration must not claim

- That the public run used MetaMask. It used a test-only EIP-1193 bridge.
- That RL timing or rebalancing ran publicly. RL is local only; rebalancing is not built.
- That the audit log is on-chain. It is off-chain and hash-chained.
- That the organizers named a testnet. Their reply: "There are no restrictions on on-chain transactions."
- Any formal audit or certification.
