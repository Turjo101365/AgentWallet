# Treasury A/B live attempt of 18 Oct 2026 — stopped before signing

**Result:** no Sepolia transaction. The sandbox `0x59a3…0d85` still holds 400000000000000 wei; agent nonce 1/1.

**Production after the stop:**
- execution disabled;
- invite `6b700ceb…` revoked;
- persisted limits and the Render environment ceilings restored to zero.

## Timeline (UTC)

| Time | Event (sandbox_demo audit id) |
|---|---|
| 14:46 | Persisted limits opened by SQL (owner-approved); Render env saved, then "Restart service" |
| 14:50:17 | `DEMO_INVITE_CREATED` (#74), 1 session, 1 h |
| 14:50:52 | `DEMO_EXECUTION_ENABLED` (#76) |
| 14:51:12 | `DEMO_SESSION_STARTED` (#77) |
| 14:51:29 / 14:51:44 | `TREASURY_OBLIGATION_CREATED` A (#78), B (#79) |
| 14:52:12 | `AGENT_TURN` FAILED (#80) |
| 14:52:23–25 | `PROPOSAL_CREATED` / `TREASURY_PAYMENT_PREPARED` A (#81–82), via the deterministic button |
| 14:52:36 | One confirmation → HTTP 429 `DEMO_DAILY_LIMIT`. No `DEMO_AUTHORIZATION_CONFIRMED`, no signature, no execution, no relay claim. |
| 14:53:06 / 14:53:08 | `DEMO_EXECUTION_DISABLED` (#83), `DEMO_INVITE_REVOKED` (#84) |

## Root causes

1. **Environment not applied.** In Render, "Save only" followed by "Restart service" kept the previous deploy's environment. The confirm path compared the amount against the env `DEMO_DAILY_AMOUNT_ETH` = 0 after the persisted limits had been opened.
2. **Unrefunded daily charge (code defect).** `demoService.confirm` charged `demo_daily_usage` and *then* applied that env check. The refund bookkeeping (`charged.global`) was set only after the check, so the refused, unsigned attempt left today's shared row at 1 / 1e14 wei.
3. **AI tool sequence.** GPT-4.1-mini called, in order:
   - `get_treasury_overview`
   - `generate_treasury_plan`
   - `prepare_treasury_payment`, rejected by trusted code: no plan recorded
   - `record_plan`

   The 4-call demo cap then ended the turn before the retry and the answer (7,566 input / 195 output tokens).

## Fixes (branch `fix/demo-quota-refund-ai-sequence`)

- **Daily cap:** the cap is `min(persisted dailyAmountEth, env ceiling)`, enforced inside the single atomic SQL charge. A refusal charges nothing, and any charged row is tracked for refund.
- **Refund rule (unchanged):** a refund happens only when the proposal is known not to be APPROVED, SUBMITTED or CONFIRMED. A handed-off or unknown outcome is never refunded.
- **AI turns:**
  - demo and personal AI turns get 6 model calls (output still 1,024 tokens per call; same daily AI quota);
  - the system note gives the plan-first order;
  - `prepare_treasury_payment` states that `record_plan` must come first;
  - the plan-first rule stays enforced by trusted code.

**Regressions:**
- `backend/test/treasury.production-semantics.test.js`:
  - the incident configuration (env 0, persisted limits open) leaves usage, session and chain untouched;
  - the exact live tool sequence completes;
  - A/B passes within the 0.00001 ETH gas ceilings at Sepolia-like fees;
  - the quota is charged exactly once;
  - cleanup works.
- Each fix fails these tests when reverted.
- Real GPT-4.1-mini (`backend/test/live/treasury.sequence.live.test.js`, opt-in): 2/2 runs used overview → plan → `record_plan` → prepare A only. COMPLETED in 5 calls, about $0.01.

## Shared daily usage record

Read-only checks show that today's `sandbox_demo.demo_daily_usage` row (tx_count 1, 100000000000000 wei) is attributable solely to the refused attempt:
- no execution and no relay claim or usage today (`public.sandbox_relay_*` holds only the 17 Oct payment `0x62ab63fa…`);
- the proposal is still AWAITING_APPROVAL and its demo action is unconfirmed;
- no `DEMO_AUTHORIZATION_CONFIRMED`;
- the 14 sessions created today sent 0 payments in total.

**Proposed correction (requires owner approval; not applied):**

```sql
UPDATE sandbox_demo.demo_daily_usage
   SET tx_count = tx_count - 1, amount_wei = amount_wei - 100000000000000
 WHERE day = DATE '2026-10-18' AND tx_count = 1 AND amount_wei = 100000000000000
RETURNING day, tx_count, amount_wei;
```

This record and the Neon query history are its audit trail. The application's hash-linked audit log is append-only and is not edited. The alternative is to wait for the 00:00 UTC reset.
