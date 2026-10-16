# Execution evidence (Deliverable 06)

Ethereum Sepolia (chain 11155111), a public testnet. Contract [`0x8A44716Efabb6Ce401291B91D4427149CaF956a6`](https://sepolia.etherscan.io/address/0x8A44716Efabb6Ce401291B91D4427149CaF956a6). Run on 2026-10-16, about 10:04–10:13 UTC, authorized by the team owner.

**Independent receipt verification:** `node submission/tools/verify-receipts.mjs` read every transaction, receipt and block from `ethereum-sepolia-rpc.publicnode.com` at 2026-10-16 15:19:19 UTC. Result: **11/11 SUCCESS**. Raw data: `receipts-verified.json`; recording: `evidence/submission/footage/term-receipts.webm`.

**Explorer confirmation:** Blockscout, recorded after the run at 2026-10-16 10:22:13 UTC. All pages confirmed: true. Screenshots are in `evidence/sepolia/explorer/`; video in `evidence/sepolia/recordings/raw/explorer-verification.webm`.

**Contract state now** (read-only): paused = true, agent = `0x0000000000000000000000000000000000000000` (revoked by the emergency stop), owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba`.

**Roles:**
- owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba`
- agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D`
- deployer `0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67`
- recipient `0x82446B165d0d55051af76e3aD7852B0F3141904e`

All four are distinct, testnet-only keys.

## Highlights

| | Tx | Block | Status | Explorer |
|---|---|---|---|---|
| **Contract deployment** | `0x7d7492bf…ae1ad3` | 11926653 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3) |
| **Owner-approved AI transaction** | `0x2c83a855…2e37fb` | 11926668 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb) |
| **Autonomous AI transaction** | `0xedeb6b97…e3cec3` | 11926686 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3) |
| **Pause** | `0x2a2eeb50…bd211b` | 11926689 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0x2a2eeb5084f9dba38e177d2b4528b7242356c5dcb51796c203fa5b9a3bbd211b) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x2a2eeb5084f9dba38e177d2b4528b7242356c5dcb51796c203fa5b9a3bbd211b) |
| **Unpause** | `0x00b0dc31…f2f3d0` | 11926691 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0x00b0dc316138f8cef8b329e4ff91a469612a8207317615442012bfee21f2f3d0) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x00b0dc316138f8cef8b329e4ff91a469612a8207317615442012bfee21f2f3d0) |
| **Emergency stop** | `0xfe627133…e53a8d` | 11926692 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0xfe627133719dc4493552259d250ebb7fe31fb86ead7e2034569eea99ede53a8d) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xfe627133719dc4493552259d250ebb7fe31fb86ead7e2034569eea99ede53a8d) |
| **Withdraw** | `0x6c8fb074…a5cff5` | 11926693 | SUCCESS | [Etherscan](https://sepolia.etherscan.io/tx/0x6c8fb074172a800c3d85eaa2eb54b5675dcf3e204fd7c7c276e67104d6a5cff5) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x6c8fb074172a800c3d85eaa2eb54b5675dcf3e204fd7c7c276e67104d6a5cff5) |

## All 11 transactions

### 1. top-up deployer

| Field | Value |
|---|---|
| Transaction hash | `0x15a0af74a4699276674af409d99ee8c55b6f51d41f64ebbf8a69a745e40b6378` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0x15a0af74a4699276674af409d99ee8c55b6f51d41f64ebbf8a69a745e40b6378) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x15a0af74a4699276674af409d99ee8c55b6f51d41f64ebbf8a69a745e40b6378) |
| Block · time | 11926649 · 2026-10-16 10:04:00 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → deployer `0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67` · 0.0086359887543 ETH |
| Method | `ETH transfer (no calldata)` · gas used 21000 |
| Events | — (plain ETH transfer) |
| Authorization | Owner key, run script (gas for the deployer) |
| AI decision | — |
| Audit log | — (before the backend started) |
| Video | 07-contract-deployment (run log); raw run step `deploy` (`timeline.json`); explorer verification 12.3–22.0 s |
| Screenshot | `evidence/sepolia/explorer/02-tx-top-up-deployer.png` |

### 2. top-up agent

| Field | Value |
|---|---|
| Transaction hash | `0xdc3cec9386e058646587d45aa8fcf6ef8d3b6911631c5a217503b43549ab1cb9` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0xdc3cec9386e058646587d45aa8fcf6ef8d3b6911631c5a217503b43549ab1cb9) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xdc3cec9386e058646587d45aa8fcf6ef8d3b6911631c5a217503b43549ab1cb9) |
| Block · time | 11926651 · 2026-10-16 10:04:24 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` · 0.0006853949766 ETH |
| Method | `ETH transfer (no calldata)` · gas used 21000 |
| Events | — (plain ETH transfer) |
| Authorization | Owner key, run script (gas for the agent key) |
| AI decision | — |
| Audit log | — |
| Video | 07-contract-deployment (run log); raw run step `deploy` (`timeline.json`); explorer verification 22.0–31.7 s |
| Screenshot | `evidence/sepolia/explorer/03-tx-top-up-agent.png` |

### 3. deploy

| Field | Value |
|---|---|
| Transaction hash | `0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3) |
| Block · time | 11926653 · 2026-10-16 10:04:48 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | deployer `0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67` → contract creation → `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `contract creation` · gas used 14278824 |
| Events | `OwnershipTransferred` (previousOwner=0x00000000…, newOwner=0x10A0d324…); `AgentUpdated` (previousAgent=0x00000000…, newAgent=0x30D53BD3…); `TokenPolicyUpdated` (token=0x00000000…, enabled=true, perTxLimit=200000000000000, dailyLimit=500000000000000) |
| Authorization | Deployer key; `CONFIRM_PUBLIC_DEPLOY=yes` + `--i-approve-sepolia-transactions` |
| AI decision | — |
| Audit log | — |
| Video | 07-contract-deployment; raw run step `deploy` (`timeline.json`); explorer verification 31.7–41.2 s |
| Screenshot | `evidence/sepolia/explorer/04-tx-deploy.png` |

### 4. owner setRecipient

| Field | Value |
|---|---|
| Transaction hash | `0xf6306fe567bd2286a4f066529896cc444cd29a77d07b1a84944f3b5d59b36299` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0xf6306fe567bd2286a4f066529896cc444cd29a77d07b1a84944f3b5d59b36299) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xf6306fe567bd2286a4f066529896cc444cd29a77d07b1a84944f3b5d59b36299) |
| Block · time | 11926663 · 2026-10-16 10:06:48 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `setRecipient(address,bool)` · gas used 129974 |
| Events | `RecipientUpdated` (recipient=0x82446B16…, allowed=true) |
| Authorization | Owner wallet transaction (console, test bridge) |
| AI decision | — |
| Audit log | #3 RECIPIENT_LABEL_SET (label only) |
| Video | 15-end-to-end (context); raw run 161–186 s; raw run step `allowlist` (`timeline.json`); explorer verification 41.2–51.0 s |
| Screenshot | `evidence/sepolia/explorer/05-tx-owner-setrecipient.png` |

### 5. owner deposit

| Field | Value |
|---|---|
| Transaction hash | `0xe593d6d3c778ed09476cf1997e90699bd4b7909d433a0653dd64388512968ba1` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0xe593d6d3c778ed09476cf1997e90699bd4b7909d433a0653dd64388512968ba1) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xe593d6d3c778ed09476cf1997e90699bd4b7909d433a0653dd64388512968ba1) |
| Block · time | 11926664 · 2026-10-16 10:07:00 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` · 0.0004 ETH |
| Method | `deposit()` · gas used 22707 |
| Events | `Deposited` (from=0x10A0d324…, amount=400000000000000) |
| Authorization | Owner wallet transaction (console, test bridge) |
| AI decision | — |
| Audit log | — |
| Video | raw run 186–198 s; raw run step `deposit` (`timeline.json`); explorer verification 51.0–60.5 s |
| Screenshot | `evidence/sepolia/explorer/06-tx-owner-deposit.png` |

### 6. owner-approved transfer (AI-drafted)

| Field | Value |
|---|---|
| Transaction hash | `0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb) |
| Block · time | 11926668 · 2026-10-16 10:08:00 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `executeTransfer(bytes32,address,address,uint256)` · gas used 450221 |
| Events | `TransferExecuted` (intentId=0x2e1cc848…, token=0x00000000…, recipient=0x82446B16…, amount=100000000000000, day=20742, spentToday=100000000000000) |
| Authorization | Owner EIP-712 `ApproveTransfer` signature (test bridge, programmatic) |
| AI decision | gpt-4.1-mini: list_recipients → record_plan → propose_transfer (proposal 2556bd41); 14/14 policy checks passed |
| Audit log | #4 PROPOSAL_CREATED, #5 AGENT_TURN, #6 PROPOSAL_APPROVED, #7 EXECUTION_SUBMITTED, #8–#9 EXECUTION_CONFIRMED |
| Video | 02-ai-command, 05-owner-approval, 08-public-verification; raw run step `approve` (`timeline.json`); explorer verification 60.5–70.1 s |
| Screenshot | `evidence/sepolia/explorer/07-tx-owner-approved-transfer-ai-drafted-.png` |

### 7. autonomous transfer (AI-drafted task, grant-approved)

| Field | Value |
|---|---|
| Transaction hash | `0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3) |
| Block · time | 11926686 · 2026-10-16 10:11:36 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `executeTransfer(bytes32,address,address,uint256)` · gas used 168701 |
| Events | `TransferExecuted` (intentId=0x547f6acd…, token=0x00000000…, recipient=0x82446B16…, amount=100000000000000, day=20742, spentToday=200000000000000) |
| Authorization | Owner-signed EIP-712 `AuthorizeTask` grant (once); the run was auto-approved by the grant within the 0.0001 ETH auto-approval limit; no per-transfer signature (`approval_kind = TASK_GRANT`) |
| AI decision | gpt-4.1-mini: record_plan → list_recipients → schedule_payment (task aa334b60) |
| Audit log | #13 TASK_CREATED, #14 AGENT_TURN, #15 TASK_AUTHORIZED, #16 TASK_RUN_CREATED, #17 PROPOSAL_CREATED, #18 PROPOSAL_APPROVED_BY_GRANT, #19 TASK_RUN_AUTO_APPROVED, #20 EXECUTION_SUBMITTED, #21 EXECUTION_CONFIRMED, #22 TASK_RUN_CONFIRMED |
| Video | 06-autonomous-execution, 08-public-verification, 14-innovation, 15-end-to-end; raw run step `grant` (`timeline.json`); explorer verification 70.1–79.8 s |
| Screenshot | `evidence/sepolia/explorer/08-tx-autonomous-transfer-ai-drafted-task-gran.png` |

### 8. owner pause

| Field | Value |
|---|---|
| Transaction hash | `0x2a2eeb5084f9dba38e177d2b4528b7242356c5dcb51796c203fa5b9a3bbd211b` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0x2a2eeb5084f9dba38e177d2b4528b7242356c5dcb51796c203fa5b9a3bbd211b) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x2a2eeb5084f9dba38e177d2b4528b7242356c5dcb51796c203fa5b9a3bbd211b) |
| Block · time | 11926689 · 2026-10-16 10:12:12 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `pause()` · gas used 128920 |
| Events | `Paused` (account=0x10A0d324…) |
| Authorization | Owner wallet transaction |
| AI decision | — |
| Audit log | — (on-chain only) |
| Video | 09-emergency-controls; raw run step `controls` (`timeline.json`); explorer verification 79.8–89.5 s |
| Screenshot | `evidence/sepolia/explorer/09-tx-owner-pause.png` |

### 9. owner unpause

| Field | Value |
|---|---|
| Transaction hash | `0x00b0dc316138f8cef8b329e4ff91a469612a8207317615442012bfee21f2f3d0` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0x00b0dc316138f8cef8b329e4ff91a469612a8207317615442012bfee21f2f3d0) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x00b0dc316138f8cef8b329e4ff91a469612a8207317615442012bfee21f2f3d0) |
| Block · time | 11926691 · 2026-10-16 10:12:36 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `unpause()` · gas used 24743 |
| Events | `Unpaused` (account=0x10A0d324…) |
| Authorization | Owner wallet transaction |
| AI decision | — |
| Audit log | — (on-chain only) |
| Video | 09-emergency-controls; raw run step `controls` (`timeline.json`); explorer verification 89.5–99.3 s |
| Screenshot | `evidence/sepolia/explorer/10-tx-owner-unpause.png` |

### 10. owner emergencyStop

| Field | Value |
|---|---|
| Transaction hash | `0xfe627133719dc4493552259d250ebb7fe31fb86ead7e2034569eea99ede53a8d` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0xfe627133719dc4493552259d250ebb7fe31fb86ead7e2034569eea99ede53a8d) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0xfe627133719dc4493552259d250ebb7fe31fb86ead7e2034569eea99ede53a8d) |
| Block · time | 11926692 · 2026-10-16 10:12:48 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `emergencyStop()` · gas used 132409 |
| Events | `Paused` (account=0x10A0d324…); `AgentUpdated` (previousAgent=0x30D53BD3…, newAgent=0x00000000…); `EmergencyStop` (revokedAgent=0x30D53BD3…) |
| Authorization | Owner wallet transaction |
| AI decision | — |
| Audit log | — (on-chain only) |
| Video | 09-emergency-controls, 14-innovation; raw run step `controls` (`timeline.json`); explorer verification 99.3–108.7 s |
| Screenshot | `evidence/sepolia/explorer/11-tx-owner-emergencystop.png` |

### 11. owner withdraw

| Field | Value |
|---|---|
| Transaction hash | `0x6c8fb074172a800c3d85eaa2eb54b5675dcf3e204fd7c7c276e67104d6a5cff5` |
| Explorer | [Etherscan](https://sepolia.etherscan.io/tx/0x6c8fb074172a800c3d85eaa2eb54b5675dcf3e204fd7c7c276e67104d6a5cff5) · [Blockscout](https://eth-sepolia.blockscout.com/tx/0x6c8fb074172a800c3d85eaa2eb54b5675dcf3e204fd7c7c276e67104d6a5cff5) |
| Block · time | 11926693 · 2026-10-16 10:13:00 UTC |
| Status | **SUCCESS** (receipt), Blockscout: Success |
| From → to | owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` → AgentWallet `0x8A44716Efabb6Ce401291B91D4427149CaF956a6` |
| Method | `withdraw(address,address,uint256)` · gas used 33876 |
| Events | `Withdrawn` (token=0x00000000…, to=0x10A0d324…, amount=200000000000000) |
| Authorization | Owner wallet transaction |
| AI decision | — |
| Audit log | — (on-chain only) |
| Video | raw run 543–553 s; raw run step `withdraw` (`timeline.json`); explorer verification 108.7–118.4 s |
| Screenshot | `evidence/sepolia/explorer/12-tx-owner-withdraw.png` |

## Off-chain evidence from the same run

- **Policy rejection, no transaction:** an AI-drafted 0.0003 ETH transfer failed `PER_TX_LIMIT` and `BALANCE_AND_RESERVE`. It was never signed or broadcast, so there is deliberately **no hash**.
  - Proof: audit #10 `PROPOSAL_POLICY_REJECTED` has no `txHash`.
  - The agent key sent exactly 2 transactions (nonce check in `RUN_NOTES.md`), both listed above.
  - Clip `04-rejected-transaction`.
- **Audit hash chain:** 22 entries, valid, head below. Recomputed independently on a copy of the run database:

```
CHAIN VALID  22 entries · head 8ba71bb20caa7d6c7a3a992013e44f091a6b658dd175661eb013f9685a660198
  #7 EXECUTION_SUBMITTED → 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb
  #8 EXECUTION_CONFIRMED → 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb
  #9 EXECUTION_CONFIRMED → 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb
  #20 EXECUTION_SUBMITTED → 0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3
  #21 EXECUTION_CONFIRMED → 0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3
```

## Files (originals unchanged; SHA-256 in `evidence/sepolia/MANIFEST.json`)

| File | What |
|---|---|
| `evidence/sepolia/EVIDENCE.md`, `evidence.json` | Receipts, classification, AI-agent logs (generated by `scripts/collect-evidence.mjs`) |
| `evidence/sepolia/timeline.json`, `run-log.txt`, `RUN_NOTES.md` | Step times, the run log, honest limitations |
| `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | Unedited 10 min 29 s screen recording of the whole run (git-ignored, upload separately) |
| `evidence/sepolia/recordings/raw/explorer-verification.webm`, `explorer/` | Post-run read-only explorer verification |
| `receipts-verified.json` (this folder) | Today's independent receipt re-verification |

**Limitations:**
- The public run signed with a test-only EIP-1193 bridge, not the MetaMask extension. Real MetaMask was tested on a local chain only (clip 12).
- Live explorer clips in the raw recording show "Pending" and third-party ads; the post-run verification replaces them.
- Etherscan blocks automated browsers, so the recordings use Blockscout.
