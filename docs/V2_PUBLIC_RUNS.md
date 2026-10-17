# Contract v2 on Ethereum Sepolia: public runs

The v1 public run (`evidence/sepolia/`, contract `0x8A44…956a6`) is separate, frozen and unchanged.

| Run | Contract | Evidence | Status |
|---|---|---|---|
| v2 run 1 (2026-10-17) | [`0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458`](https://sepolia.etherscan.io/address/0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458) | `evidence/sepolia-v2/`, `contracts/deployments/sepolia-v2.json` | **Partial**, stopped at tx 7, safe-stopped. Frozen. |
| v2 run 2 (full, 2026-10-17) | [`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`](https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F) | `evidence/sepolia-v2-full/`, `contracts/deployments/sepolia-v2-full.json` | **Complete.** 12/12 SUCCESS, 26/26 read-only checks; ends paused, agent revoked, balance 0. |

## Run 1: what is proven publicly

- **Deployment.** v2 is deployed, and its runtime bytecode equals the compiled v2 artifact.
- **Owner-signed transfer verified on-chain.** Tx 6, [`0x30714eb9…`](https://sepolia.etherscan.io/tx/0x30714eb92194cd5ad45b172af45acb67ed6b43f1fcbde98b0fd02e5c4e51aab1): gpt-4.1-mini drafted the transfer, the owner signed EIP-712, and the agent called `executeApprovedTransfer`. The contract verified the signature. The signature recovers to `owner()` from public calldata.
- **Attack probes.** Five were run as the agent with `eth_call` at block 11930590, all refused: no signature, replay, changed amount, non-owner signer, and a stranger as sender.
- **Final state after recovery.** Paused, agent revoked, contract balance 0. Recovery was tx 8 `emergencyStop` and tx 9 `withdraw`.

**Not proven by run 1:**
- an autonomous transfer under a grant (tx 7 reverted, see below);
- on-chain grant revocation;
- `pause` / `unpause` (not reached).

Every transaction, read-only check and file is listed in `evidence/sepolia-v2/RUN_NOTES.md` and `public-verify.json` (20/20 checks).

## Run 1, tx 7: root cause (corrected)

Tx 7: [`0xb1a4fff1…`](https://sepolia.etherscan.io/tx/0xb1a4fff1c1aeef329528412d1a170658c03085bb8467535ce949e9666943cbce), `executeGrantTransfer`, block 11930608, out of gas (`gasUsed == gasLimit == 511,950`).

> The first explanation in `evidence/sepolia-v2/RUN_NOTES.md` blamed Sepolia gas repricing and said that `eth_estimateGas` does not reflect real execution cost. **That explanation is wrong.**
>
> The run notes are kept unchanged as historical evidence. This section replaces their explanation.

**The cause was the UTC day changing between gas estimation and inclusion.**
- The contract charges every transfer to `spentPerDay[token][block.timestamp / 1 days]`.
- The executor estimated the transfer in the last seconds of day 20742. That day's slot already held 0.0001 ETH from tx 6.
- Block 11930608 has timestamp **00:00:00 UTC**, day 20743. That day's slot was empty, so the same transfer had to create a new storage slot.

Measured read-only on public Sepolia data (historical `eth_estimateGas` / `eth_call`):

| Block | UTC day | `spentPerDay` slot | `eth_estimateGas` | Call at 511,950 gas |
|---|---|---|---|---|
| 11930606 / 11930607 | 20742 | 0.0001 ETH (non-zero) | 426,625 | succeeds |
| 11930608 | 20743 | 0 (fresh) | **525,711** | **out of gas**; succeeds at 700,000 |

- The executor sent `426,625 × 1.20 = 511,950`. The fresh-slot premium on Sepolia was **99,086 gas**, more than the 85,325-gas margin.
- The estimate was correct for the block it was made in. Gas pricing alone did not cause the failure; the day change did.
- On Hardhat the same premium is about 17,100 gas against a ~145,000 estimate, inside the 20% margin. That is why local rehearsals never hit it.

**Effect.** The revert rolled back everything: no transfer, the intent stayed unused and the grant run count stayed 0. The backend recorded `TX_REVERTED`, which is non-transient, so it did not retry.

## The fix

Changes are in `backend/src/services/executorService.js` and `backend/src/config/env.js`:

| Setting | Default | What it does |
|---|---|---|
| `DAY_BOUNDARY_GUARD_SECONDS` | 120 | If chain time is within this many seconds of 00:00 UTC, the executor waits for the new UTC day before estimating. The chain time used is the later of the latest block and the wall clock. The wait is audited as `EXECUTION_DAY_BOUNDARY_WAIT`, and the authorization is re-checked afterwards. If the day never changes, the run fails with `DAY_BOUNDARY_WAIT_TIMEOUT`, which is transient, so the scheduler retries. |
| `EXECUTOR_GAS_MARGIN_PCT` | 20 (5–100) | Margin over `eth_estimateGas`. Unchanged by default; now explicit. |
| `EXECUTOR_GAS_LIMIT_CAP` | 1,500,000 | Explicit upper bound. If `estimate × margin` is above it, the run fails with `GAS_LIMIT_ABOVE_CAP` and **nothing is sent**. Sepolia's worst measured case is 525,711 × 1.2 ≈ 630,900. |

The margin was not raised blindly: the guard removes the case that broke the estimate, and the cap bounds what a bad estimate can ever cost.

**Regression test: `backend/test/gas.dayboundary.test.js`.** It reproduces tx 7 on a local chain using controlled chain time. The margin is lowered to 5% so that the Hardhat fresh-slot premium exceeds it, as on Sepolia:

1. Without the guard, the old behaviour: estimated before 00:00 UTC, mined after, `TX_REVERTED` with `gasUsed == gasLimit`, state rolled back. The same call succeeds with twice the gas.
2. With the guard: the wait is audited, estimated in the new day, `CONFIRMED`.
3. Cap below the estimate: `GAS_LIMIT_ABOVE_CAP`, agent nonce unchanged, no transaction sent.

## Run 2: the full run (complete)

Contract [`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`](https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F), deployed in block 11932656. Run with the team's explicit approval on 2026-10-17, 07:10–07:19 UTC, through `scripts/sepolia-v2.mjs` (target `sepolia-v2-full`). The gate was reset to `no` by the script afterwards.

| # | Step | Tx | Result |
|---|---|---|---|
| 1–2 | owner tops up deployer and agent | `0xf3bf0e07…`, `0xcf80f95f…` | SUCCESS |
| 3 | deploy v2 | `0x879566e6…` | SUCCESS |
| 4–5 | `setRecipient`, `deposit` 0.0004 | `0x912f3e0a…`, `0x17ac2f09…` | SUCCESS |
| 6 | **agent `executeApprovedTransfer`**: AI-drafted, owner EIP-712 signature verified on-chain | [`0x564129e2…`](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e) | SUCCESS |
| — | AI over-cap draft | no tx | POLICY_REJECTED |
| 7 | **agent `executeGrantTransfer`**: autonomous, under a one-run owner-signed grant | [`0xbcdd8685…`](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e) | SUCCESS (412,346 / 511,950 gas) |
| 8 | **owner `revokeGrant`** on a second, recurring grant; agent probe → `GrantIsRevoked` | [`0x4b8b8efd…`](https://sepolia.etherscan.io/tx/0x4b8b8efdf4d5a709f320b58a2a7bea7289e7f9f410d7e20efab1829d886c14e6) | SUCCESS |
| 9–10 | `pause`, `unpause` | `0x19576c61…`, `0xbfa8a88e…` | SUCCESS |
| 11 | `emergencyStop` | [`0x80a42def…`](https://sepolia.etherscan.io/tx/0x80a42def2843143de5a8418cc798fb231f19aa042fdb04d2bf155736cf0b1713) | SUCCESS |
| 12 | `withdraw` 0.0002 to owner | `0xc3dff58a…` | SUCCESS |

**Verification (read-only, public chain data only): 26/26** (`public-verify.json`):
- the bytecode equals the v2 artifact;
- tx 6's signer and tx 7's grant signer, both recovered from calldata, equal `owner()`;
- `GrantRunExecuted` records run 1 of 1;
- the grant is revoked on-chain;
- final state: paused, agent `0x0`, balance 0;
- six attack probes refused.

**Nonce deltas:** owner +9, deployer +1, agent +2, recipient 0. That is exactly 12 transactions.

**Real gas fees:** 0.000000000347 SepETH. Value moved only among the team's four testnet keys and the contract.

Full detail: `evidence/sepolia-v2-full/RUN_NOTES.md`; hashes in `MANIFEST.json` (25 files).

## Why run 2 is a fresh deployment

`emergencyStop` sets the agent to `address(0)` and pauses. Reactivating run 1's contract would need the owner to call `setAgent` and `unpause`. That would be legitimate owner functions, but:
- it would make run 1's terminal "stopped" state no longer final;
- the old one-run grant would stay usable until 2026-10-17 23:57 UTC;
- run 1's evidence would mix with the new run.

A fresh deployment keeps run 1 frozen as evidence. `scripts/base-sepolia-run.mjs` marks run 1's target `sepolia-v2` as `frozen`, and adds its deployment, database and evidence paths to `PROTECTED_V1_PATHS`. Run 2 uses the separate `sepolia-v2-full` target.
