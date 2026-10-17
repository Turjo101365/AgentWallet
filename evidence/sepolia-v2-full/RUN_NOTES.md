# Public run: AgentWallet contract v2 on Ethereum Sepolia, full run (2026-10-17)

**Contract (v2):** [`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`](https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F) · chain 11155111 · deployed in block 11932656

**Outcome: COMPLETE.** 12 of 12 transactions SUCCESS, between 07:10 and 07:19 UTC.

This is a **fresh deployment**, separate from the other runs:
- The first, partial v2 run (`evidence/sepolia-v2/`, contract `0x23bA…4458`) is frozen and unchanged.
- The v1 run (`evidence/sepolia/`, contract `0x8A44…956a6`) is frozen and unchanged.

**What this run proves publicly:**
1. An AI-drafted transfer was executed only with the owner's EIP-712 signature, **verified by the contract** (tx 6).
2. An AI-drafted scheduled payment was executed **autonomously** under a bounded, owner-signed task grant, with no per-transfer signature (tx 7). The contract counted it against the grant: run 1 of 1.
3. A second, recurring grant was **revoked on-chain** by the owner (tx 8). Afterwards, the agent's `eth_call` probe of that grant returned `GrantIsRevoked`, and nothing was sent.
4. Pause and unpause (txs 9–10), then `emergencyStop` (tx 11) and withdrawal of the remainder (tx 12).
5. **Final state:** paused, agent `0x0`, contract balance 0.

An AI-drafted over-cap transfer was rejected by the policy engine (`PER_TX_LIMIT`, `BALANCE_AND_RESERVE`). That rejection sent no transaction.

## Transactions

| # | Step | Tx | Block | Gas used / limit | Result |
|---|---|---|---|---|---|
| 1 | owner → deployer gas top-up (0.000018285) | [`0xf3bf0e07…`](https://sepolia.etherscan.io/tx/0xf3bf0e077cd36f9eb1d5528237000c68d5ebb02a3e7ecbbd1437916605af1bdf) | 11932651 | 21,000 / 21,000 | SUCCESS |
| 2 | owner → agent gas top-up (dust) | [`0xcf80f95f…`](https://sepolia.etherscan.io/tx/0xcf80f95f8d5e93b061777b2e8dbd92d2489275d1f27f8fd76d98cd202ea0319b) | 11932654 | 21,000 / 21,000 | SUCCESS |
| 3 | deployer deploys AgentWallet **v2** (caps 0.0002 ETH/tx, 0.0005 ETH/day) | [`0x879566e6…`](https://sepolia.etherscan.io/tx/0x879566e6943dbcde1653a9f081b197487118cf1a6799ed03bbda6a41cb21f4a5) | 11932656 | 20,316,239 / 20,478,646 | SUCCESS |
| 4 | owner `setRecipient` (team recipient key) | [`0x912f3e0a…`](https://sepolia.etherscan.io/tx/0x912f3e0a0da0f02ee737a810c5f3bb7801859f0491a0703cc8ae8aec656459ff) | 11932663 | 130,018 / 131,117 | SUCCESS |
| 5 | owner `deposit` 0.0004 ETH | [`0x17ac2f09…`](https://sepolia.etherscan.io/tx/0x17ac2f09e8767418eb1907fcc18231c19709ce82f36cdfceb4eab084746afa3e) | 11932664 | 22,707 / 23,043 | SUCCESS |
| 6 | **agent `executeApprovedTransfer`**: gpt-4.1-mini drafted it, the owner signed EIP-712, the contract verified the signature; 0.0001 ETH | [`0x564129e2…`](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e) | 11932667 | 282,966 / 354,846 | **SUCCESS** |
| — | AI-drafted over-cap transfer | no transaction | — | — | POLICY_REJECTED |
| 7 | **agent `executeGrantTransfer`**: autonomous, under an owner-signed one-run grant; 0.0001 ETH | [`0xbcdd8685…`](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e) | 11932685 | 412,346 / 511,950 | **SUCCESS** |
| 8 | **owner `revokeGrant`** (second, recurring grant `0xfaf76f97…`) | [`0x4b8b8efd…`](https://sepolia.etherscan.io/tx/0x4b8b8efdf4d5a709f320b58a2a7bea7289e7f9f410d7e20efab1829d886c14e6) | 11932688 | 129,357 / 130,453 | SUCCESS |
| 9 | owner `pause` | [`0x19576c61…`](https://sepolia.etherscan.io/tx/0x19576c61ccbdd0cea313be4894ccc59899569e7b7c7c7d4399145f1b50333ade) | 11932689 | 128,877 / 129,971 | SUCCESS |
| 10 | owner `unpause` | [`0xbfa8a88e…`](https://sepolia.etherscan.io/tx/0xbfa8a88eba16b05926c7a95cf3b0de0bc771ab942f08f70641c0f6cc762fcdd6) | 11932691 | 24,796 / 31,000 | SUCCESS |
| 11 | owner `emergencyStop` | [`0x80a42def…`](https://sepolia.etherscan.io/tx/0x80a42def2843143de5a8418cc798fb231f19aa042fdb04d2bf155736cf0b1713) | 11932692 | 132,453 / 144,632 | SUCCESS |
| 12 | owner `withdraw` 0.0002 ETH to owner | [`0xc3dff58a…`](https://sepolia.etherscan.io/tx/0xc3dff58a20a173604828f5b082283a21c2691cef94c34abc37b3a41088fa433e) | 11932693 | 33,893 / 44,656 | SUCCESS |

`public-receipts.json` holds every receipt, nonce, fee and timestamp.

**Tx 7 and the day-boundary fix.** Tx 7 is the step that failed in run 1. This time:
- It was estimated and mined at 07:17 UTC, nowhere near 00:00 UTC, so the day-boundary guard did not need to wait.
- It ran in the same UTC day as tx 6, so the `spentPerDay` slot already existed.
- It used 412,346 of 511,950 gas.

## Independent verification (read-only, after the run)

`public-verify.json` holds the results. Everything comes from public chain data only (bytecode, events, calldata, `eth_call`): **26 of 26 checks passed.**

**Bytecode and configuration:**
- The runtime bytecode equals the compiled v2 artifact (12,631 bytes) and differs from v1.
- `VERSION() = 2`.
- Owner, agent and caps match.

**Tx 6:**
- The EIP-712 signer recovered from calldata equals `owner()`.
- `approvalDigest` equals the local digest.
- The event matches the signed fields.
- It was mined before the signed deadline and sent by the agent key.

**Tx 7:**
- The grant signer recovered from calldata equals `owner()`.
- `GrantRunExecuted` records run 1 of 1.
- It ran within the grant's validity.
- There was no per-transfer owner signature.

**Revocation:** grant `0xfaf76f97…` is revoked on-chain.

**Final state:** `emergencyStop` executed; paused; agent revoked.

**Attack probes as the agent (`eth_call`, nothing sent):**

| Probe | Result |
|---|---|
| v1-style call with no owner signature | reverts |
| Replay of the executed approval | `IntentAlreadyExecuted` |
| The owner's signature with a different amount | `InvalidOwnerSignature` |
| A non-owner signature | `InvalidOwnerSignature` |
| The grant used beyond its run limit | `GrantExhausted` |
| A stranger submitting the approval | `NotAgent` |

**Final state, read after the run:** contract paused, `agent() = 0x0`, balance 0.

**Nonce deltas:** owner +9 (16 → 25), deployer +1 (2 → 3), agent +2 (4 → 6), recipient 0. That is exactly 12 transactions, with none pending.

The off-chain audit log of this run (25 entries) has a valid hash chain: `EVIDENCE.md`, from `scripts/collect-evidence.mjs`.

## Cost and keys

| Item | Value |
|---|---|
| Real gas fees, all 12 transactions | 0.000000000347 SepETH |
| Value moved | Only among the team's four testnet keys and the contract. 0.0002 ETH reached the recipient key; the 0.0002 remainder was withdrawn to the owner. |
| Mainnet | The keys are testnet-only (zero mainnet balance and nonce). Wallet signing used the test-only EIP-1193 bridge, as in v1, not MetaMask. |
| Gate | `CONFIRM_PUBLIC_DEPLOY` was set to `yes` by the team for this run and reset to `no` by the script when the run ended. |

## Files in this folder

**Produced by the run** (`scripts/sepolia-v2.mjs` → `scripts/sepolia-demo.mjs`):
- `screenshots/01–16`;
- `timeline.json`, `run-log.txt`;
- `EVIDENCE.md`, `evidence.json`;
- `recordings/raw/` and `recordings/agentwallet-demo.mp4`, both git-ignored; their SHA-256 values are in `MANIFEST.json`.

**Added after the run (read-only):**
- `public-receipts.json`;
- `public-verify.json`;
- this file;
- `MANIFEST.json`, regenerated to include them.
