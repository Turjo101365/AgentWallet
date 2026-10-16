# AgentWallet: FinTechathon submission checklist

**Challenge:** Autonomous On-chain Wallet. **Scoring:** task completion 40%, security & compliance 30%, innovation & interaction 30%, on-chain bonus 0–5.
**Package built:** 2026-10-16.
**Not done by the assistant, by design:** git commit or push, submission upload, new transactions, redeployment. `CONFIRM_PUBLIC_DEPLOY=no`.

## Deliverables

| # | Deliverable | Ready file(s) | State | Your action |
|---|---|---|---|---|
| 01 | Technical documentation | `01-technical-documentation/TECHNICAL_DOCUMENTATION.md`, `architecture.svg` (editable), `architecture.png` | Ready | Review |
| 02 | Presentation deck (≤ 10 min) | **Made by you.** `02-presentation/` holds only reference material you may ignore: a rough draft deck, speaker notes, and genuine screenshots in `assets/` | Yours | Build the deck (≤ 10 min) |
| 03 | Demo video (optional, ≤ 5 min) | 15 mini-clips in `../evidence/submission/mini-clips/` + `CLIP_INDEX.md`; `03-demo-video/STORYBOARD.md` (4:50 plan) | Assets ready; **final video not made** | Assemble, voice over, export ≤ 5:00 |
| 04 | Source code | `../README.md` (updated), `04-source-code/SOURCE_CODE_AUDIT.md`, `secret-scan.json` | Ready in the working tree; **not committed** | Confirm the repo is public; commit, push, merge to `main`; submit the link |
| 05 | Security self-assessment | `05-security-assessment/SECURITY_SELF_ASSESSMENT.md` (tiers T0–T5, matrix, risks R1–R26, LLM risks, §11 audit fixes F1–F3 and contract v2) | Ready | Review |
| 06 | Execution evidence | `06-execution-evidence/EXECUTION_EVIDENCE.md` (all 11 transactions), `receipts-verified.json`; originals in `../evidence/sepolia/` | Ready | Upload the git-ignored raw videos and link them |
| — | Scoring readiness | `scoring-readiness/SCORING_READINESS.md`, `REQUIREMENT_EVIDENCE_MATRIX.md` | Ready | — |

## Contract versions (2026-10-17)

- **Public evidence = contract v1** (below). Unchanged and re-verified on 2026-10-17: 11/11 SUCCESS, deployed runtime identical to the frozen `shared/abi/AgentWallet.v1.json`, 39/39 evidence hashes match.
- **Contract v2 = local only.** It adds on-chain owner-signature and grant verification, the signed deadline and revocation. Tested on local Hardhat (contract, backend, browser, real MetaMask, live gpt-4.1-mini, recorded showcase in `evidence/local-v2/`). **Not deployed**; never present it as public. See `docs/CONTRACT_V2.md`.

## Public evidence at a glance

- **Contract:** `0x8A44716Efabb6Ce401291B91D4427149CaF956a6`, Ethereum Sepolia (11155111). Deployed by `0x7d7492bf…ae1ad3`, block 11926653.
- **Owner-approved AI transfer:** `0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb`, block 11926668.
- **Autonomous AI transfer** (owner-signed grant, no per-transfer signature): `0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3`, block 11926686.
- **Emergency controls:** pause `0x2a2eeb50…`, unpause `0x00b0dc31…`, emergency stop `0xfe627133…`, withdraw `0x6c8fb074…`.
- **Totals:** 11/11 SUCCESS, re-verified 2026-10-16. Audit chain: 22 entries, valid.

## Items requiring your action

1. Review the working-tree changes, then **commit and push** (frontend redesign, docs, `submission/`, tooling, `.gitignore`) and **merge to `main`**.
2. **Confirm the GitHub repository is public**: `https://github.com/Turjo101365/AgentWallet`.
3. **Upload the videos**, which are git-ignored:
   - `evidence/sepolia/recordings/raw/*.webm`;
   - `evidence/sepolia/recordings/agentwallet-demo.mp4`;
   - the mini-clips you use;
   - your final demo video.

   SHA-256 values: `evidence/sepolia/MANIFEST.json`, `evidence/submission/MANIFEST.json`.
4. **Produce the presentation deck and the demo video**, using the mini-clips and the screenshots in `02-presentation/assets/`.
5. Optional: decide on the ambitious feature (see `scoring-readiness/SCORING_READINESS.md` §5). Any new public transaction needs your explicit authorization.
6. Optional: confirm Remotion licence eligibility for the clip tooling (video tooling only; not part of the product).

## Unresolved gaps (not hidden)

- Public signing used a **test-only EIP-1193 bridge**; real MetaMask is verified on a local chain only. Today's MetaMask re-run: 10 PASS + 1 BLOCKED (paid LLM call not made).
- **Asset management** is ETH-only on the public chain. Swaps are a deployed contract primitive with no orchestration, and there is no rebalancing.
- RL timing is local and synthetic-trained. The audit chain is off-chain, not anchored.
- No external audit, no compliance screening. Frontend dev-tooling advisories (R6, R8) are open.
- The demo video and presentation still need your final production.
