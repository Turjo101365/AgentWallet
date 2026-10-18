# Final autonomous QA and Treasury verification — 18 October 2026

**Branch:** `qa/final-treasury-verification`, based on release `a6b3576` (PR #13). All changes are local and uncommitted. Nothing was committed, pushed, deployed, funded, signed or broadcast. No production setting, invite or session was created or changed.

## 1. Assessment: CONDITIONAL GO

The local Treasury workflow is fully verified end to end. The public sandbox currently satisfies every arithmetic and contract precondition for **one** 0.0001 ETH payment.

Before that payment can run, the admin must:
- set six temporary limits;
- create one single-session invite;
- enable execution;
- clean up immediately afterwards.

The fixes below are **not deployed**. The approved payment does not depend on them (see §7, Risks).

## 2. Confirmed issues and fixes

| # | Issue | Evidence | Fix | Regression |
|---|---|---|---|---|
| 1 | **A demo payment refused at authorization time consumed quota.** Both the session's payment count and the shared daily quota were used up, although nothing was handed to the executor. Example: a reserve breach found at approval (`POLICY_FAILED_AT_APPROVAL`), or an expired deadline. With production limits of 1, a refused payment would use up the only allowed payment. | Reproduced: the daily count went 2 → 3 on a refused payment. | `demoService.confirm` keeps the charge until `proposals.approve` succeeds. It refunds only when the proposal is known not to be APPROVED, SUBMITTED or CONFIRMED. Once the executor has the approval, timeouts and unknown outcomes are never refunded. | `treasury.scenario.test.js` #8 (fails on old code, passes with the fix) |
| 2 | **The remaining-payments count shown to a session used the environment ceiling** (e.g. 3) instead of the effective admin limit (e.g. 0 or 1). The error message had the same problem. Enforcement was already correct. | Banner showed "3 left" while the effective limit was lower. | `status()` and the limit message use the effective limits. | scenario #10 (fails on old code, passes with the fix) |
| 3 | **The demo receipt said "LIVE · Verified on Ethereum Sepolia" on a local chain**, contradicting the LOCAL SIMULATION banner. | Local browser screenshot. | The receipt label and link follow the backend's network config. Wording on Sepolia is unchanged. | `consumerUx.test.jsx` (fails on old code, passes with the fix); browser spec asserts the SIMULATED label |
| — | Intermittent: `api.execution.test.js` "daily-limit reservations…" failed once in the baseline. It expected CONFIRMED and got FAILED. | Did not reproduce in 4 later runs (2 single-file runs, 1 targeted run, 1 full suite). | **Not a quota/accounting defect.** The reservation and approval-count assertions passed before it; only the later settlement of one payment failed. No product change. A diagnostic now prints the failure reason if it recurs. | Cause unverified |

**Test-only correction:** demo AI turns are capped at 4 model calls. A scenario script had been written with 5 steps and was fixed; this is not a product defect.

## 3. Test results (final run, same tree)

| Suite | Pass | Fail | Skip |
|---|---|---|---|
| Contracts (Hardhat) | 53 | 0 | 0 |
| Backend (includes 16 new scenario/AI tests) | 228 | 0 | 1 (opt-in isolated PostgreSQL; no URL provided) |
| Frontend unit | 71 | 0 | 0 |
| RL | 25 | 0 | 0 |
| End-to-end | 8 | 0 | 0 |
| Browser, local (wallet + new judge Treasury journey) | 7 | 0 | 3 (hosted spec, opt-in) |
| Browser, hosted read-only (new, zero mutating requests) | 3 | 0 | 0 |
| Production build (`VITE_APP_MODE=judge`, HTTPS API) | built | — | — (existing chunk-size warning only) |

The baseline before any changes was 211 passed, 1 failed (the intermittent test above), 1 skipped.

**Artifacts:**
- Screenshots: `work/qa-browser/01–07*.png` (local) and `work/qa-browser/hosted/h1–h4*.png`.
- Traces: `frontend/test-results/judge.treasury.local-*/trace.zip`.
- JSON report: `frontend/test-results/browser-results.json`.
- Logs and preflight data: session scratchpad `qa/`.

## 4. Local Treasury workflow (LOCAL Hardhat chain; simulated, not public evidence)

Starting point: treasury 0.0004 ETH, reserve 0.0003, A = 0.0001 (HIGH), B = 0.0001 (NORMAL), both to an approved recipient. It ran through the same demo-wallet path the hosted site uses.

**Exact-wei arithmetic.** The policy check is `balance ≥ amount + in-flight + reserve`:
- For A: 4e14 ≥ 1e14 + 0 + 3e14, which holds (equality).
- Gas is paid by the separate agent wallet, so the contract ends at exactly 3e14 = reserve.
- B would need 4e14 against 3e14 available, so it is refused with `BALANCE_AND_RESERVE`.
- The relay guard floor (`minTreasuryEth`) is satisfied: 3e14 ≥ its floor.

**Verified:**
- one-use invite admission and no second session;
- the plan pays A and defers B;
- the AI reads the trusted plan and prepares A only (proposal id = obligation id);
- the model's false claim "paid" changes nothing;
- A executes only after explicit confirmation;
- `executeApprovedTransfer` is sent by the agent, with a `TransferExecuted` event matching the intent, recipient and amount;
- contract −1e14 exactly, recipient +1e14, agent −(gasUsed × price);
- the obligation is PAID with the transaction hash;
- duplicate confirm → 409, and preparing again replays the existing proposal;
- B → POLICY_REJECTED; confirm → 409; no transaction;
- the reserve is not lowered by an injected tool;
- the audit chain is valid;
- refused at approval → quota refunded (after the fix);
- a revoked invite → writes refused.

**Covered by existing suites and re-run green:**
- nonce handling and concurrency (single-flight plus durable relay and treasury gates);
- failed and unknown transaction recovery;
- authorization expiry;
- PostgreSQL-specific checks, which need an opt-in database.

**Browser (local):**
1. expired and revoked invites refused;
2. a double-click admits once (one POST);
3. obligation create and edit;
4. plan shown;
5. reload keeps the session (no new POST);
6. AI-prepared payment;
7. one confirm POST and a receipt labeled SIMULATED;
8. reserve rejection with no transaction;
9. explore mode cannot record or prepare.

## 5. AI reliability (mocked model, deterministic)

- The tool menu includes the treasury read, plan and prepare tools; reserve, signing and scheduling tools are absent.
- These are refused by trusted code, with no proposal created:
  - malformed ids;
  - unknown obligations;
  - an extra `amount` field;
  - an action called before the plan is recorded.
- Non-allowlisted recipients and unsupported tokens are refused.
- An insufficient treasury leads to DEFER and POLICY_REJECTED.
- Provider failures leave no side effects:
  - a timeout → FAILED;
  - a truncated response → FAILED, and no tools are run;
  - a refusal → REFUSED.
- A runaway turn stops at the 4-call cap.

**No paid model calls were made in this QA.** Real GPT-4.1-mini behavior is covered by earlier release checks, not re-verified here.

## 6. Public Sepolia read-only preflight (block 11941261, 2026-10-18 13:06 UTC)

| Item | Value |
|---|---|
| Sandbox | `0x59a33154288009e030aa2072De46D32fC7d40d85`, v2, 12,631 bytes |
| Balance | 400000000000000 wei (0.0004 ETH) |
| Owner / agent | `0x98cd…f680` / `0x341E…A7d6`, equal to the backend's demo keys; not paused |
| ETH policy | enabled; per transaction 1e14; daily 3e14; spent today 0 (day 20744) |
| Recipient `0xd85c…04F5` | allowlisted; a plain wallet (EOA) |
| Agent gas wallet | 1499999987403042 wei; nonce 1 latest = 1 pending |
| Owner | nonce 1 latest = 1 pending; no conflicting transactions |
| Fees | base 15 wei; maxFee 32 wei |
| Reference gas | The earlier sandbox payment `0x62ab63fa…` used 466,554 gas with a limit of 577,773, at 27 wei, a fee of 12,596,958 wei. That was also the first payment of its UTC day. |
| Hosted app (public GETs) | health ready; execution **disabled**; per-session, daily-count, daily-amount and the three gas limits are all **0**; `maxAmountEth` 0.0001; `minTreasuryEth` 0.0002; `minAgentGasEth` 0.0005 |
| Evidence contract `0x3C93…582F` | paused, agent 0x0, balance 0. Untouched. |
| Not readable without an admin session | the effective policy reserve. Expected 0.0003; the admin must confirm it. |

**Feasibility.**
- Policy check: 4e14 ≥ 1e14 + 3e14 passes.
- Relay guard: 3e14 ≥ 2e14 passes.
- Contract caps pass.
- Agent gas: 1.5e15 − about 1.9e7 ≥ 5e14 passes.

**Result: feasible** once the admin sets the temporary limits below.

## 7. Approval request: one real Treasury-driven payment

| Field | Value |
|---|---|
| Sandbox contract | `0x59a33154288009e030aa2072De46D32fC7d40d85` (Ethereum Sepolia 11155111) |
| Recipient | `0xd85cdB676877ccdc8873B63DEf51B456568604F5` |
| Payment A | **0.0001 ETH = 100000000000000 wei**, HIGH |
| Payment B (rejection demo) | 0.0001 ETH, NORMAL; expected to be refused with no transaction |
| Current balance / effective reserve | 0.0004 ETH / 0.0003 ETH (reserve to be confirmed by the admin) |
| Expected gas | about 470k used; limit about 580k (estimate × 1.2; the executor cap is 1.5M); fee about 1.3–1.9e7 wei, paid by the agent wallet |
| Maximum permitted gas (temporary) | `maxGasPerTxEth` = `sessionGasEth` = `dailyGasEth` = **0.00001 ETH**. That is about 540,000× the current max cost. If fees exceed it, the payment fails safely with nothing sent. |
| Other temporary limits | `maxTxPerSession` **1**, `dailyTxLimit` **1**, `dailyAmountEth` **0.0001**; `maxAmountEth` stays 0.0001; execution **enabled** |
| Authentication / signature flow | Owner/Admin signs in with SIWE (allowlisted wallet) → admin console sets the limits, creates **one** invite (1 session, expires in 1 h) and enables execution → a judge enters with the invite → records A and B in Treasury → prepares A (optionally via the AI: one paid GPT-4.1-mini turn, at most about $0.04) → explicitly confirms the demo payment → the server's demo owner key signs the EIP-712 approval → the agent sends `executeApprovedTransfer`. |
| Expected evidence | **1** transaction from agent `0x341E…` (nonce 1 → 2) to the sandbox, selector `0x75f1157f`, status 1. `TransferExecuted(intentId, 0x0, 0xd85c…, 1e14, day, spentToday = 1e14)`. Sandbox 4e14 → 3e14; recipient +1e14; owner nonce unchanged. Obligation A PAID with this hash. B → POLICY_REJECTED (`BALANCE_AND_RESERVE`), no transaction. Audit includes `DEMO_AUTHORIZATION_CONFIRMED` and `EXECUTION_CONFIRMED`. |
| Pre-run check | Re-run the read-only preflight right before enabling: balance, not paused, no pending nonces, fee ≤ cap. Avoid the last 2 minutes before 00:00 UTC (the guard would delay the payment). |
| Cleanup (immediately after the receipt) | Disable execution. Set `maxTxPerSession`, `dailyTxLimit`, `dailyAmountEth` and the three gas limits back to **0**. Revoke the invite. Verify via public `/api/demo/status` and chain reads. |

**Risks and remaining uncertainties:**
1. **The fixes in §2 are not deployed.** The planned flow does not hit defect 1: A is confirmed once, and B is refused at preparation, before any confirmation. With a limit of 1, defect 2 would display "3 left" while the server still enforces 1.
2. **First hosted Treasury execution.** Advisory locking through the hosted Neon connection is still unverified on production.
3. **The reserve is application policy, not on-chain.**
4. **The intermittent local test** cause is unverified.
5. **Fee spikes or RPC outages** fail the payment closed, with nothing sent. The funds stay reserved until the receipt is reconciled.
6. **The effective reserve** must be read back by the admin before enabling.

**Not authorized by this report:** enabling execution, creating invites, changing limits, deploying, or any transaction. Each needs your explicit approval.

## 8. Exact changes

- `backend/src/services/demoService.js`:
  - refund on refusal at approval time;
  - the remaining count and limit message use the effective limits.
- `frontend/src/components/proposals/ProposalCard.jsx`: the receipt label follows the network (Sepolia wording unchanged).
- New tests:
  - `backend/test/treasury.scenario.test.js`;
  - `frontend/tests/browser/judge.treasury.local.spec.js`;
  - `frontend/tests/browser/judge.hosted.readonly.spec.js` (opt-in);
  - an added case in `frontend/tests/consumerUx.test.jsx`.
- `backend/test/api.execution.test.js`: assertion diagnostic only.
- Pre-existing untracked files were left untouched: `frontend/public/_headers`, `_redirects`, `scripts/judge-live-smoke.mjs`.
