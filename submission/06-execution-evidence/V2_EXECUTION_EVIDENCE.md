# Deliverable 06, addendum: contract v2 execution evidence (Ethereum Sepolia)

This addendum sits beside the v1 evidence (`EXECUTION_EVIDENCE.md`, `receipts-verified.json`, contract `0x8A44…956a6`). The v1 files are unchanged.

## Full v2 run, 2026-10-17: 12/12 SUCCESS

**Contract:** [`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`](https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F), chain 11155111, block 11932656.

| # | Step | Tx |
|---|---|---|
| 1 | owner → deployer gas top-up | [`0xf3bf0e07…`](https://sepolia.etherscan.io/tx/0xf3bf0e077cd36f9eb1d5528237000c68d5ebb02a3e7ecbbd1437916605af1bdf) |
| 2 | owner → agent gas top-up | [`0xcf80f95f…`](https://sepolia.etherscan.io/tx/0xcf80f95f8d5e93b061777b2e8dbd92d2489275d1f27f8fd76d98cd202ea0319b) |
| 3 | deploy AgentWallet v2 | [`0x879566e6…`](https://sepolia.etherscan.io/tx/0x879566e6943dbcde1653a9f081b197487118cf1a6799ed03bbda6a41cb21f4a5) |
| 4 | owner `setRecipient` | [`0x912f3e0a…`](https://sepolia.etherscan.io/tx/0x912f3e0a0da0f02ee737a810c5f3bb7801859f0491a0703cc8ae8aec656459ff) |
| 5 | owner `deposit` 0.0004 ETH | [`0x17ac2f09…`](https://sepolia.etherscan.io/tx/0x17ac2f09e8767418eb1907fcc18231c19709ce82f36cdfceb4eab084746afa3e) |
| 6 | **AI-drafted transfer, owner EIP-712 signature verified on-chain** (`executeApprovedTransfer`, 0.0001) | [`0x564129e2…`](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e) |
| — | AI-drafted over-cap transfer | policy rejected, no tx |
| 7 | **AI-drafted payment executed autonomously under a bounded grant** (`executeGrantTransfer`, 0.0001) | [`0xbcdd8685…`](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e) |
| 8 | **owner revokes a second grant on-chain** (`revokeGrant`) | [`0x4b8b8efd…`](https://sepolia.etherscan.io/tx/0x4b8b8efdf4d5a709f320b58a2a7bea7289e7f9f410d7e20efab1829d886c14e6) |
| 9 | owner `pause` | [`0x19576c61…`](https://sepolia.etherscan.io/tx/0x19576c61ccbdd0cea313be4894ccc59899569e7b7c7c7d4399145f1b50333ade) |
| 10 | owner `unpause` | [`0xbfa8a88e…`](https://sepolia.etherscan.io/tx/0xbfa8a88eba16b05926c7a95cf3b0de0bc771ab942f08f70641c0f6cc762fcdd6) |
| 11 | owner `emergencyStop` | [`0x80a42def…`](https://sepolia.etherscan.io/tx/0x80a42def2843143de5a8418cc798fb231f19aa042fdb04d2bf155736cf0b1713) |
| 12 | owner `withdraw` 0.0002 ETH | [`0xc3dff58a…`](https://sepolia.etherscan.io/tx/0xc3dff58a20a173604828f5b082283a21c2691cef94c34abc37b3a41088fa433e) |

**Final state:** paused, agent `0x0`, contract balance 0.

**Read-only verification:** 26/26 checks from public chain data:
- bytecode;
- signer recovery from calldata;
- grant accounting;
- revocation;
- final state;
- six attack probes.

**Receipts** for all 12 transactions: `v2-receipts-verified.json` (a copy of `evidence/sepolia-v2-full/public-receipts.json`).

**Originals:** `evidence/sepolia-v2-full/`, with `RUN_NOTES.md`, `EVIDENCE.md`, `public-verify.json`, 16 screenshots and `MANIFEST.json` (25 files hashed; videos git-ignored).

## Earlier partial v2 run (same day)

Contract `0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458` (`evidence/sepolia-v2/`):
- Its owner-signed transfer succeeded.
- Its grant run reverted out of gas because the UTC day changed between gas estimation and inclusion.
- It was then safe-stopped.

The cause and the fix are in `docs/V2_PUBLIC_RUNS.md`. Its evidence is kept unchanged.

**Not claimed:** source verification on Etherscan; an external audit; MetaMask for the public signing (a test-only EIP-1193 bridge was used).
