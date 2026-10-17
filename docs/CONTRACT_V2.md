# AgentWallet contract v1 vs v2

**Status (2026-10-17):** v2 is implemented and tested locally. It has a **complete public run** on Ethereum Sepolia, `0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`: 12/12 transactions SUCCESS and 26/26 read-only checks (`evidence/sepolia-v2-full/`). An earlier partial run (`0x23bA…4458`) stopped at its grant run, a day-boundary gas issue that is now fixed, and was safe-stopped. See [V2_PUBLIC_RUNS.md](V2_PUBLIC_RUNS.md).

The first complete public run was **v1** on Ethereum Sepolia, at [`0x8A44716Efabb6Ce401291B91D4427149CaF956a6`](https://sepolia.etherscan.io/address/0x8A44716Efabb6Ce401291B91D4427149CaF956a6). All 11 public transactions in `evidence/sepolia/` were made against v1. Nothing in this document changes them.

**Tested 2026-10-17 (local Hardhat only):**
- contracts 53/53;
- backend 145/145;
- authorization regressions 24/24, on v1 and v2;
- frontend 32/32;
- browser 4/4;
- end-to-end 8/8;
- real MetaMask 11/11;
- live gpt-4.1-mini 19/19.

See [SECURITY_SELF_ASSESSMENT.md §11.1](SECURITY_SELF_ASSESSMENT.md).

## What changed and why

| | v1 (deployed on Sepolia, frozen) | v2 (local build, `contracts/src/AgentWallet.sol`) |
|---|---|---|
| Agent entry point | `executeTransfer(intentId, token, recipient, amount)` | `executeApprovedTransfer(ApproveTransfer, ownerSignature)` and `executeGrantTransfer(AuthorizeTask, ownerSignature, intentId)`. `executeTransfer` is removed. |
| Who checks the owner's EIP-712 approval | Backend only | **The contract**, against the current `owner()` (EOA or ERC-1271 via OpenZeppelin `SignatureChecker`) |
| Signed execution deadline | Backend only (since Stage A, also at execution time) | Contract: `block.timestamp <= deadline`, else `ApprovalExpired` |
| Task grant bounds (runs, total, expiry) | Backend only | Contract: per-grant counters `grantRuns` and `grantSpent`; `GrantExhausted`, `GrantExpired`, `UnboundedGrant` |
| Revocation | `revokeAgent`, `emergencyStop`, `pause` | The same, plus `revokeGrant(digest)` and `cancelIntent(intentId)` |
| Simulation before the owner signs | `executeTransfer` static call | `simulateTransfer`: the same checks and the real send, then it always reverts (`SimulationSucceeded()` means it would succeed). It cannot move funds even if sent as a transaction. |
| Ownership change | Backend refuses old approvals | The contract refuses them (signatures are checked against the current owner) |
| Replay | `executedIntents` | The same, plus the EIP-712 domain (chain id and contract address) and the grant counters |
| Caps, allowlist, pause, re-entrancy guard, owner-only admin, swaps | — | Unchanged: the same checks in the same order (`_checkTransfer`), the same `TransferExecuted` event |
| Typed data the owner signs | `ApproveTransfer` and `AuthorizeTask` | **Identical** domains, types and field order. The MetaMask prompt and the frontend are unchanged. |

**What a stolen agent key or a compromised backend can do:**
- **v1:** move up to the daily cap per token per UTC day to any allowlisted recipient, with no owner signature.
- **v2:** only execute transfers the owner signed. Each signed approval executes once, before its deadline. Each signed grant executes only within its remaining runs, total and validity, and the caps still apply.

**What v2 does *not* enforce on-chain:** a grant's *schedule* (`scheduleHash`, `executionWindowSeconds`). A compromised agent could therefore use a grant's remaining runs earlier than scheduled, never beyond them. The owner can revoke the grant on-chain at any time.

## Signed authorizations, exactly as verified on-chain

**`ApproveTransfer`**
- Domain: `{ name: "AgentWallet Operator Approval", version: "1", chainId, verifyingContract }`
- Fields, in order:
  1. `string proposalId`
  2. `bytes32 intentId`
  3. `address token`
  4. `address recipient`
  5. `uint256 amount`
  6. `uint256 deadline`

**`AuthorizeTask`**
- Domain: `{ name: "AgentWallet Task Authorization", version: "1", chainId, verifyingContract }`
- Fields, in order:
  1. `string taskId`
  2. `address token`
  3. `address recipient`
  4. `uint256 amountPerRun`
  5. `uint256 maxRuns`
  6. `uint256 maxTotal`
  7. `uint256 validUntil`
  8. `bytes32 scheduleHash`
  9. `uint256 executionWindowSeconds`

`maxRuns = 0` or `maxTotal = 0` means that bound is unused. A grant with both at 0 is refused.

The contract test `computes exactly the digests the backend asks owners to sign` imports `backend/src/lib/approval.js` and `backend/src/lib/schedule.js` and checks that the contract's `approvalDigest` and `grantDigest` equal ethers' EIP-712 hash of the backend's typed data.

## Execution deadline

The `deadline` in `ApproveTransfer` is the proposal's expiry. It is shown to the owner on the approval card ("Execution deadline (signed)") and in the wallet's signing prompt. It is **never extended**:
- **Approval:** the backend refuses an approval with fewer than `APPROVAL_MIN_REMAINING_SECONDS` (default 15) left (`APPROVAL_TOO_LATE`).
- **Execution:** the executor refuses after the deadline (`APPROVAL_EXPIRED`), including on restart recovery.
- **On-chain (v2):** the contract reverts with `ApprovalExpired`.

## Backend compatibility

- The backend detects the version at start-up: `VERSION()` returns 2 on v2 and reverts on v1. It is reported as `contractVersion` in `/api/config` and on the Security page.
- **On v1** it calls `executeTransfer` through the frozen v1 ABI.
- **On v2** it calls `executeApprovedTransfer` or `executeGrantTransfer` with the stored owner signature.

The Stage A checks run before signing on **both** versions:
- Expiry.
- Approval signature re-verified against the exact stored row; the signer must still be the owner.
- Task grant typed data rebuilt from the task's columns and compared with the stored copy.
- Proposal fields compared with the grant.
- Cancelled or expired tasks refused.

The frozen v1 interface and bytecode are kept for this:
- `contracts/legacy/AgentWalletV1.sol`: an exact copy of the deployed source.
- `shared/abi/AgentWallet.v1.json`: ABI, creation and runtime bytecode. The runtime bytecode equals `eth_getCode` of the Sepolia contract; `submission/tools/verify-receipts.mjs` re-checks this on every run.
- `submission/tools/verify-receipts.mjs` and `verify-owner-approval.mjs` read the v1 ABI, so they keep verifying the 11 v1 transactions after `contracts/` is rebuilt as v2.

## Deploying v2

Both public v2 runs are done, and their targets (`sepolia-v2`, `sepolia-v2-full`) refuse to run again once their evidence folders hold a run. Any new public v2 run needs a new target and, in this order:
1. The team's explicit approval.
2. `CONFIRM_PUBLIC_DEPLOY=yes` (currently `no`).
3. The run script's approval flag.
4. Testnet ETH.

`contracts/scripts/deploy.js` records `contractVersion: 2`. **Claims must name the contract.** The v1 contract (`0x8A44…`) does **not** verify owner signatures. The v2 contracts (`0x3C93…`, `0x23bA…`) do, as shown by signatures recovered from public calldata. Their source is not verified on Etherscan, but their bytecode equals the compiled v2 artifact (`public-verify.json` in each evidence folder).
