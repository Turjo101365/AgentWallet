# Ethereum Sepolia: attempt 1 (stopped before deployment)

**Date:** 2026-10-16 (UTC). Authorized by Samprity. Recorded with `scripts/sepolia-demo.mjs --execute`.

## What happened (verifiable on-chain)

| Step | Result | Tx | Block |
|---|---|---|---|
| Owner → deployer gas top-up | Success | [`0x9dbdc3f4157796200af7f9ef5217a27c6e61da3bc15a9bdf39b8e93263eec7b7`](https://eth-sepolia.blockscout.com/tx/0x9dbdc3f4157796200af7f9ef5217a27c6e61da3bc15a9bdf39b8e93263eec7b7) | 11926396 |
| Owner → agent gas top-up | Success | [`0x37911cc9d9977f719c5e7d71c7162df39dee572fa1b6dccaa4028b32da1882d0`](https://eth-sepolia.blockscout.com/tx/0x37911cc9d9977f719c5e7d71c7162df39dee572fa1b6dccaa4028b32da1882d0) | 11926398 |
| Contract deployment | **Refused before broadcast** by the RPC: `insufficient funds for gas * price + value: have 245700000 want 618912545` | none | none |

Nothing else was sent. No contract was deployed (the deployer's nonce stayed 0). `CONFIRM_PUBLIC_DEPLOY` was reset to `no` automatically.

## Cause and fix

Sepolia's base fee was about 20 wei. The run budgeted gas money as live price × 3, but at near-zero prices the fee estimate moved several-fold between budgeting and sending, so the deployer's top-up was too small.

Investigation after the attempt found a second, larger factor. Ethereum Sepolia's nodes estimate this deployment at **14,393,315 gas** (confirmed on two independent RPCs; it measures 2,075,676 on Hardhat). ethers uses that estimate as the gas limit, and the sender must hold gas limit × max fee upfront: 14,393,315 × 43 wei = 618,912,545 wei, exactly the amount the RPC demanded.

**Fixes:**
- The budget assumes at least 0.5 gwei on Ethereum Sepolia (0.02 gwei on Base Sepolia).
- The deployer is funded from the node's live deployment estimate (+20%).
- The owner and agent call costs are scaled by the same live/local ratio.

Unused gas money stays in our own keys. Regression tests: `backend/test/base-sepolia.run.test.js`, the two "regression (first public attempt) …" cases. The local rehearsals didn't catch this, because Hardhat's fixed 1 gwei priority fee dominates its price.

`recordings/raw/agentwallet-sepolia-attempt-1-raw.webm` (44 s, unedited) shows the run up to the refusal.
