# Local v2 evidence (2026-10-17): LOCAL HARDHAT ONLY

> **Not public.** Everything in this folder ran on a **local Hardhat chain (chain id 31337)** against **AgentWallet contract
> v2**, which is **not deployed on any public network**. Transaction hashes here exist only on throwaway local chains and
> **cannot be looked up on any explorer**. The public evidence is the Ethereum Sepolia **v1** run in
> [`../sepolia/`](../sepolia/), which is unchanged.

Keys used: the **public Hardhat development accounts** (#0 owner, #1 agent), published in Hardhat's documentation, local only. No personal wallet, seed phrase or private key was used. The AI calls used the team's existing OpenAI configuration (`gpt-4.1-mini`); the key was never printed or stored here.

## What is here

| Path | What it shows | Wallet | AI |
|---|---|---|---|
| `showcase/showcase-evidence.json`, `showcase/final.png`, `recordings/showcase/**/video.webm` | Six-step v2 showcase: AI drafts a transfer, owner approves it (contract-verified), an autonomous grant run, six blocked compromised-agent attacks, on-chain grant revocation from the console, and emergency stop. Every frame carries a "LOCAL HARDHAT · chain 31337 · v2" badge. | Test EIP-1193 bridge (public Hardhat key #0) | Real gpt-4.1-mini |
| `metamask/report.md`, `metamask/report.json`, `metamask/*.png`, `recordings/metamask/*.webm` | Real **MetaMask 13.52.0** extension, 11/11 checklist rows PASS, including row 9 (AI-drafted proposal signed in MetaMask and executed through `executeApprovedTransfer`) | Throwaway MetaMask profile, public Hardhat mnemonic | Real gpt-4.1-mini (row 9) |
| `live-llm-report.json` | Live model safety suite: 19/19 cases, 47/47 graded checks, 55 model calls, 0 executions without approval | — | Real gpt-4.1-mini |
| `MANIFEST.json` | SHA-256 of every file here, including the git-ignored videos | | |

**Showcase results** (`showcase/showcase-evidence.json`; local transaction hashes):

| Step | Result |
|---|---|
| 1. AI draft | gpt-4.1-mini called `propose_transfer` → proposal `1dff7b02…` AWAITING_APPROVAL |
| 2. Owner approval | EIP-712 signature → `executeApprovedTransfer`, local block 9 |
| 3. Autonomy | AI drafted a one-time task → owner signed the grant → run executed by `executeGrantTransfer` with no further signature (local block 10). On-chain grant counter: 1 run. |
| 4. Compromised agent key | The contract refused every attempt, and no transaction was sent:<br>• no owner signature → no such function<br>• replayed approval → `IntentAlreadyExecuted`<br>• larger amount with the old signature → `InvalidOwnerSignature`<br>• self-signed approval → `InvalidOwnerSignature`<br>• one-run grant reused → `GrantExhausted` |
| 5. Revocation | Owner clicked "Revoke grant on-chain" → `grantRevoked = true`. Agent retry → `GrantIsRevoked`. |
| 6. Emergency stop | Contract paused, agent revoked. Agent retry → `NotAgent`. |

## How to reproduce (local, no public transactions)

```bash
cd frontend && LIVE_LLM=1 npx playwright test v2.showcase.live.spec.js                       # showcase (writes to test-results/v2-showcase)
cd frontend && LIVE_LLM=1 AW_RECORD_DIR=<dir> npx playwright test --config playwright.metamask.config.js  # real MetaMask
cd backend  && LIVE_LLM=1 node --test --test-concurrency=1 test/live/                             # live model suite
```

Each of these makes a few paid gpt-4.1-mini calls (the three runs above together: about 65 calls).
