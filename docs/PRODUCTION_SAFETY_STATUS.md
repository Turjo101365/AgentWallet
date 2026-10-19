# Production safety status — interrupted Sepolia session closed

**Result: PASS.** Verified 2026-10-18 18:02–18:09 UTC (2026-10-19 local) using the existing DPAPI-protected Render API credential and the Neon `DATABASE_URL` it holds. No transaction was signed or broadcast. Execution was not enabled, no invite was created, and no financial record was changed.

Scripts and raw output are in the git-ignored `work/` folder:
- `video-audit-state.mjs`: read-only. Output in `video-audit-state-before.json` and `video-audit-state-after.json`.
- `video-audit-cleanup.mjs`: the approved write. Output in `video-audit-cleanup.json`.

## 1. State found before cleanup (independently verified)

| Item | Found | Matches the interrupted report? |
|---|---|---|
| Persisted execution switch (`sandbox_demo.demo_settings`) | `execution_enabled = false` | Yes |
| Persisted limits (`sandbox_demo`) | **Open**: maxTxPerSession 1, dailyTxLimit 1, dailyAmountEth 0.0001, maxGasPerTxEth / sessionGasEth / dailyGasEth 0.00001 (`updated_by = owner-approved-retry`, 15:29 UTC) | Yes |
| Render env ceilings (six keys) | **Saved nonzero**: 1 / 1 / 0.0001 / 0.00001 ×3 | Yes |
| Live Render deploy | `dep-dbae8sm7…`, commit `cd078f7` (= `origin/main`), finished 15:24 UTC, before the env edits | Yes: the running process predates the nonzero env |
| Active invites | none. Latest `6b700ceb` revoked 14:53 UTC | Yes |
| Unexpired sessions | none | Yes |
| Treasury / relay execution gates | both `null` | — |
| Today's shared daily usage (18 Oct UTC) | `tx_count 0`, `amount_wei 0` (already corrected) | Yes |
| Latest execution | `738c5116` CONFIRMED, tx `0x62ab63fa…`, 17 Oct 13:01 UTC: the earlier legitimate demo payment | No new execution |
| Latest proposal | `0843cc57` AWAITING_APPROVAL (the refused 18 Oct attempt; never signed) | — |
| Audit chain (`sandbox_demo`) | valid, 87 entries | — |
| Chain (block 11942718) | sandbox `0x59a3…0d85` balance 400000000000000 wei; agent nonce latest 1 = pending 1; owner nonce latest 1 = pending 1 | Unchanged since 17 Oct |

**No transaction was signed, submitted or broadcast during the interrupted attempt.** Both signer nonces still equal 1, with no pending transactions. The sandbox balance is unchanged at 0.0004 ETH. The executions table holds no row after 17 Oct, and both execution gates are empty.

## 2. Cleanup performed (approved)

1. **Neon (`sandbox_demo.demo_settings`).** A single guarded `UPDATE … WHERE id=1 AND execution_enabled=false` merged zeros into the six keys: `maxTxPerSession`, `dailyTxLimit`, `dailyAmountEth`, `maxGasPerTxEth`, `sessionGasEth`, `dailyGasEth`. `updated_by` is `video-audit-safety-cleanup`. Other keys, reserve floors and usage rows were not touched. The `public` schema was already zero and disabled, and was left as is.
2. **Render env.** The six keys were set to `0` with per-key `PUT /env-vars/{key}`, not a full-list replace: `DEMO_MAX_TX_PER_SESSION`, `DEMO_DAILY_TX_LIMIT`, `DEMO_DAILY_AMOUNT_ETH`, `DEMO_MAX_GAS_PER_TX_ETH`, `DEMO_SESSION_GAS_ETH`, `DEMO_DAILY_GAS_ETH`. The values were read back before deploying. `DEMO_MAX_AMOUNT_ETH` stays at 0.0001, as the zero-ceiling runbook in `docs/TREASURY_CONTROLLED_DEPLOYMENT.md` specifies.
3. **Applied with a real deploy, not a restart.** `dep-dbagkt49v7es738eq3v0` was a deploy of the same commit `cd078f715cf2…`, so no code changed. It went live at 18:06:45 UTC.

## 3. Verified final state

| Check | Result |
|---|---|
| `GET /api/demo/status` (running backend) | `executionEnabled: false`, `busy: false`; limits maxTxPerSession **0**, dailyTxLimit **0**, dailyAmountEth **0**, maxGasPerTxEth **0**, sessionGasEth **0**, dailyGasEth **0**; maxAmountEth 0.0001, minTreasury 0.0002, minAgentGas 0.0005; today 0 / 0.0 |
| `GET /api/config` | `executorEnabled: false`, `executorAddress: null` (root/evidence container) |
| Render env readback | all six = `0` |
| Live deploy | `dep-dbagkt49…` live, commit `cd078f7` |
| Neon `sandbox_demo` | `execution_enabled false`; six limits zero; no active invite; no unexpired session; gates null |
| Daily usage rows | unchanged (18 Oct: 0 / 0; 17 Oct: 1 / 1e14) |
| Executions / proposals | identical before and after |
| Audit chain | valid. 87 → 88 entries. The new entry (#88, 18:06:38) is the `POLICY_SETTINGS_UPDATED / approved-demo-ceiling` record that the backend writes on every boot (#86 and #87 are the same kind, from earlier wake-ups). It was not written by the cleanup; this cleanup appends no audit row, the same as the admin `setLimits` path. |
| Chain (block 11942742) | balance 400000000000000 wei; agent and owner nonces 1/1. Unchanged |
| Evidence contract `0x3C93…582F` | paused, agent revoked, balance 0 (live read from `/evidence`) |

## 4. Not touched
- incident records, audit history and evidence files;
- the corrected daily-usage row and all other financial rows;
- invites and the execution switch;
- reserve floors, the allowlist and on-chain state;
- Vercel.

## 5. Residual notes
- Proposal `0843cc57` is still `AWAITING_APPROVAL`. It cannot execute: there is no invite, execution is disabled, the limits are zero, and its signed-approval TTL has long passed. It was left as historical record.
- The Render Free instance spins down when idle. The first request after idle takes about 1 minute, and each boot appends one policy-settings audit entry.
