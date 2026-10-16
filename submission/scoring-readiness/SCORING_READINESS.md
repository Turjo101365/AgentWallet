# Scoring readiness

This is a self-assessment against the published weights. It does not predict a score, and no bonus is guaranteed.

## 1. Task completion (40%): strong

**Works end to end on a public chain (Ethereum Sepolia, 2026-10-16):**
- An AI agent (gpt-4.1-mini) turns natural language into tool calls and drafts transfers and scheduled payments.
- An owner-approved AI-drafted transfer: `0x2c83a855…`.
- An **autonomous** AI-drafted transfer under an owner-signed bounded grant, with no per-transfer signature: `0xedeb6b97…`.
- An unsafe AI draft refused before signing.
- Deployment, deposit, withdrawal, pause, unpause and emergency stop.
- All 11 transactions succeed and are re-verified independently.

**Works locally only:**
- recurring and conditional schedules, retries, crash recovery and circuit breakers;
- multi-asset (ERC-20) treasury and USD valuation (synthetic feeds);
- RL execution timing (synthetic training);
- real MetaMask signing.

**Partial or missing:**
- Swaps: the contract primitive exists and is deployed, but no backend, agent tool or UI uses it.
- No rebalancing.
- Only one autonomous public run, a one-time task. Recurring autonomy was not shown publicly.

**Weakest point for judges:** asset management beyond ETH balances.

## 2. Security & compliance (30%): strong on security, thin on compliance

- **Defence in depth, each layer independent:**
  1. The model has no dangerous tools.
  2. Trusted code runs 14 block-pinned checks, including a simulation.
  3. The owner gives an EIP-712 signature, or signs a bounded grant with an auto-approval limit.
  4. The contract enforces the allowlist, caps, one-time intents and pause.
- **Safe failure shown publicly:** the policy rejection, plus pause, unpause and emergency stop on-chain.
- **Permission tiers T0–T5** with a matrix stating where each rule is enforced (contract vs backend); the viewer tier was demonstrated in the replay.
- **Testing:** 35 contract, 118 backend, 24 frontend and 8 e2e tests, real MetaMask 10/11 (one row blocked by a paid LLM call), and a live LLM safety suite. Adversarial cases are covered: re-entrancy, forged signatures, double approvals, prompt injection, loosening attempts.
- **Honest risk register** R1–R20. The top risks: a single-EOA owner (R1); the public owner key was held by a script (R19); off-chain-only policies (R3); dev-tooling advisories (R6).
- **Compliance is limited** to the recipient allowlist and the audit trail. There is no sanctions or KYC screening (fiat rails are out of scope).

## 3. Innovation & interaction (30%): good

**Differentiators:**
1. *Policy-bounded autonomy.* The AI never gets a blank cheque: a signed grant fixes recipient, amount, runs and validity, and the contract caps it again.
2. *Explainable refusals.* The agent reports exactly which deterministic check blocked its own draft.
3. *Verifiability.* Hash-chained audit entries correlate AI decisions with public transaction hashes; there is an independent verifier.
4. *Interaction design.* A command-deck console with an AI command center, live risk meters, kill switches and an explicit PUBLIC TESTNET vs LOCAL SIMULATION distinction.

**Weaknesses:**
- The polished UI is shown publicly only through a post-run read-only replay. The original public run recording shows the earlier UI.
- RL timing is not part of the public story.

## 4. On-chain challenge bonus (0–5): why it may deserve consideration

- **Real, public, autonomous AI execution:** an AI-drafted payment executed by the scheduler under an owner-signed EIP-712 grant, on a public chain, with the receipt verified (block 11926686).
- **The full lifecycle on-chain:** deploy → configure → owner-approved → autonomous → pause → unpause → emergency stop → withdraw. All 11 transactions SUCCESS.
- **Verifiable by anyone:** Etherscan and Blockscout links, a read-only receipt verifier, the unedited 10-minute recording, and a SHA-256 manifest.
- **Caveat:** testnet, not mainnet. The team's interpretation of "There are no restrictions on on-chain transactions" is recorded as an interpretation.

## 5. Treasury rebalancing: evaluated separately (not implemented)

| | A1. AI-proposed, owner-signed rebalancing | A2. Fully autonomous rebalancing |
|---|---|---|
| Contract | No change. `executeSwap` and `setSwapRouter` are in the deployed bytecode (verified) | Redeploy needed; the agent cannot call `executeSwap` |
| Public transactions | About 7–9 owner transactions (wrap, fund WETH, two token policies, router, unpause, swap, optionally setAgent). Explicit approval needed | Fresh deployment + setup |
| Risk | Low to medium (thin Sepolia liquidity; mechanism proof only) | High for this timeline (new agent authority over a price-sensitive operation) |
| Recommendation | The only safe ambitious option before submission, **if** time allows. Local first, then a public run only with written authorization | Do not build for this submission |

Full analysis: `docs/CHALLENGE_AUDIT.md` §3.

## 6. Remaining weaknesses, ranked

1. Asset management is limited publicly (ETH only, no swaps).
2. The public run used a test wallet bridge, not MetaMask (R19).
3. The audit chain is not anchored on-chain (R11).
4. Repository visibility and merge to `main` are unconfirmed; videos are not uploaded.
5. Dev-tooling advisories (R6, R8).
6. No compliance screening; no external audit.
