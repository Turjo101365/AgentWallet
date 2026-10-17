# Public run: AgentWallet contract v2 on Ethereum Sepolia (2026-10-17)

**Contract (v2):** [`0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458`](https://sepolia.etherscan.io/address/0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458) · chain 11155111

**Outcome: PARTIAL.**

**Proven publicly:**
- Contract v2 is deployed; its bytecode equals the compiled v2 artifact.
- An AI-drafted transfer was executed **only with the owner's EIP-712 signature, verified by the contract**.
- The emergency stop and withdrawal leave the contract paused, with the agent revoked and a zero balance.

**Not proven publicly:**
- A bounded autonomous grant run (it reverted, out of gas; see below).
- On-chain grant revocation (not reached).

The v1 public run (`evidence/sepolia/`, contract `0x8A44…956a6`) is separate and unchanged.

## Transactions

| # | Step | Tx | Block | Result |
|---|---|---|---|---|
| 1 | owner → deployer gas top-up | [`0xed1583a0…a8db523a`](https://sepolia.etherscan.io/tx/0xed1583a094efa3a583f49aedd08478cafb839c48586c99a32b1f51fba8db523a) | 11930573 | SUCCESS |
| 2 | owner → agent gas top-up | [`0xa7b57f6c…86e64aae`](https://sepolia.etherscan.io/tx/0xa7b57f6cb85b32e186fb29b6b44657fc9a9771c1d3a4e97dbf7f006486e64aae) | 11930575 | SUCCESS |
| 3 | deployer deploys AgentWallet **v2** (caps 0.0002 ETH/tx, 0.0005 ETH/day) | [`0x2d2e7f77…f818cb91`](https://sepolia.etherscan.io/tx/0x2d2e7f77ed786c1681af6524da8ab8d3aa5f6fbf9210a683f3561dc4f818cb91) | 11930577 | SUCCESS |
| 4 | owner `setRecipient` (the team's recipient key) | [`0x6da0058b…20c8ab5`](https://sepolia.etherscan.io/tx/0x6da0058bc825790e0d23b04d796bd16183c46d208e3dab09b6b21a98f20c8ab5) | 11930586 | SUCCESS |
| 5 | owner `deposit` 0.0004 ETH | [`0x2622580d…f98a441`](https://sepolia.etherscan.io/tx/0x2622580df473a48bf1f95e412cbe7f8669d0c1f1f3af5c6d3d0e03f26f98a441) | 11930587 | SUCCESS |
| 6 | **agent `executeApprovedTransfer`**: gpt-4.1-mini drafted it, the owner signed EIP-712, the **contract verified the signature**; 0.0001 ETH to the recipient | [`0x30714eb9…e51aab1`](https://sepolia.etherscan.io/tx/0x30714eb92194cd5ad45b172af45acb67ed6b43f1fcbde98b0fd02e5c4e51aab1) | 11930590 | **SUCCESS** |
| — | AI-drafted over-cap transfer | no transaction | — | POLICY_REJECTED (PER_TX_LIMIT, BALANCE_AND_RESERVE) |
| 7 | agent `executeGrantTransfer` (AI-drafted one-time payment under an owner-signed grant) | [`0xb1a4fff1…6943cbce`](https://sepolia.etherscan.io/tx/0xb1a4fff1c1aeef329528412d1a170658c03085bb8467535ce949e9666943cbce) | 11930608 | **REVERTED: out of gas** |
| 8 | owner `emergencyStop` (recovery) | [`0x67f74c28…bc23d1a4a`](https://sepolia.etherscan.io/tx/0x67f74c28b9fdf3e23e4b15a971cb02c04acabae18558eec1ba38b13bc23d1a4a) | 11930641 | SUCCESS |
| 9 | owner `withdraw` 0.0003 ETH to owner (recovery) | [`0x63f135cd…94a4da`](https://sepolia.etherscan.io/tx/0x63f135cd9c27a511a216a0b107d1f1ef2ddfd8b6c26a840c849f433ca194a4da) | 11930643 | SUCCESS |

Receipts, gas and events for each transaction: `public-receipts.json`.

## Why transaction 7 failed, and what happened next

**The facts:**
- **Out of gas:** `gasUsed == gasLimit == 511,950`.
- **Not a logic or security revert:** the same call replays successfully via `eth_call` at block 11930607.
- **Why:** the backend executor sends `gas estimate × 1.2`. The grant run writes two new storage slots (`grantRuns`, `grantSpent`). Under Ethereum Sepolia's current gas repricing, the real cost of new-slot writes exceeded that margin; `eth_estimateGas` now returns 525,711.
- **Why rehearsals didn't catch it:** the local rehearsals ran on Hardhat, which has no such repricing.

**Effect:**
- The revert rolled back everything: no transfer, intent unused, grant run count 0.
- The backend recorded the run as `TX_REVERTED` (non-transient), so it was **not retried**.

**Stopping and recovery:**
- The scripted run stopped itself at this point and reset the deployment gate.
- **No transfer was repeated and no new sequence was improvised.**
- With the team's approval, the owner then ran the pre-tested recovery (`emergencyStop`, then `withdraw` of the remaining balance): transactions 8–9.
- The planned steps that did **not** run: grant revocation, `pause`, `unpause`. `emergencyStop` covers the pause.

**Fix still open:** the executor's gas margin for v2 grant runs on repriced public chains. It is documented as a known limitation and not yet changed.

## Independent verification (read-only, 2026-10-17)

`public-verify.json` holds the results. Everything comes from public chain data only (bytecode, events, calldata, `eth_call` at historical blocks): **20 of 20 applicable checks passed.**

**Bytecode and configuration:**
- The runtime bytecode equals the compiled v2 artifact (12,631 bytes) and differs from v1.
- `VERSION() = 2`.
- Owner, agent and caps match.

**Transaction 6:**
- The EIP-712 signature in its calldata recovers to `owner()`.
- The contract's `approvalDigest` equals the local digest.
- The event matches the signed intent, token, recipient and amount.
- It was mined before the signed deadline and sent by the agent key.

**Final state:** paused, agent revoked (0x0), contract balance 0.

**Attack probes as the agent, at block 11930590 (eth_call, nothing sent):**

| Probe | Result |
|---|---|
| No owner signature | reverts |
| Replay of the executed approval | `IntentAlreadyExecuted` |
| The owner's signature with a different amount | `InvalidOwnerSignature` |
| A non-owner signature | `InvalidOwnerSignature` |
| A stranger submitting a valid approval | `NotAgent` |

**Not applicable on this deployment:**
- grant-run checks (no successful grant run);
- grant-revocation checks (not reached).

The off-chain audit log of this run (21 entries) is valid: `EVIDENCE.md`, from `scripts/collect-evidence.mjs`.

## Cost and keys

| Item | Value |
|---|---|
| Real gas spent across the run and recovery | ≈ 0.00002 SepETH |
| Value moved | Only among the team's four testnet keys and the contract. 0.0001 ETH reached the recipient key; the 0.0003 remainder was withdrawn to the owner. |
| Mainnet | The keys are testnet-only (zero mainnet balance and nonce). Wallet signing used the test-only EIP-1193 bridge, as in v1, not MetaMask. |

## Files in this folder

- `screenshots/01–11`: captured by the recorded run up to step 7.
- `recordings/raw/`: the partial raw video. It is git-ignored, and its SHA-256 is in `MANIFEST.json`. The run stopped before the video was finalized.
- Added afterwards:
  - `EVIDENCE.md`, `evidence.json` (collector);
  - `public-receipts.json`, `public-verify.json`;
  - this file;
  - `MANIFEST.json`.
