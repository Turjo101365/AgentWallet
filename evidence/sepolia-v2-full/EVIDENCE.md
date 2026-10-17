# On-chain execution evidence (chain 11155111)

Generated 2026-10-17T07:20:13.855Z by `scripts/collect-evidence.mjs` (read-only). Re-run the script to reproduce it from the chain.

| | |
|---|---|
| Contract | [`0x3C9389E704331B8a12381F9ab5A68a7F3F59582F`](https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F) |
| Deploy tx | [`0x879566e6…21f4a5`](https://sepolia.etherscan.io/tx/0x879566e6943dbcde1653a9f081b197487118cf1a6799ed03bbda6a41cb21f4a5) (block 11932656) |
| Owner / agent | `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` / `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` |
| Transactions | 10 (0 reverted) |
| Agent transfers | 2: **1 autonomous** (task grant), 1 owner-approved (EIP-712) |
| On-chain checks | every transfer was sent by the on-chain agent to an allowlisted recipient within the per-tx and daily caps |
| AI agent | 2 of 2 transfers were drafted by the AI agent (log below) |
| Audit log hash chain | valid (25 entries) |

## Agent transfers

| Time (UTC) | Tx | Amount | Recipient | Authorization | Agent sent | Allowlisted | ≤ per-tx | ≤ daily |
|---|---|---|---|---|---|---|---|---|
| 2026-10-17T07:13:24.000Z | [`0x564129e2…c0702e`](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e) | 0.0001 ETH | `0x82446B165d0d55051af76e3aD7852B0F3141904e` | OWNER_APPROVED | ✓ | ✓ | ✓ | ✓ |
| 2026-10-17T07:17:00.000Z | [`0xbcdd8685…4a2d6e`](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e) | 0.0001 ETH | `0x82446B165d0d55051af76e3aD7852B0F3141904e` | AUTONOMOUS (task "0.0001 ETH once at 2026-10-17T07:16:39.000Z", run 8c0de5ff-ef3e-46e2-8793-930589a672ba:1792221399) | ✓ | ✓ | ✓ | ✓ |

## AI agent execution log

### Owner-approved transfer [`0x564129e2…c0702e`](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e)

- **Instruction:** Send 0.0001 ETH to my approved recipient "Evidence recipient".
- **Model:** openai-compatible gpt-4.1-mini · 4 model calls · turn COMPLETED · 2026-10-17T07:12:57.084Z
- **Plan:** Propose a transfer of 0.0001 ETH to the recipient 'Evidence recipient': propose_transfer
- **Tool calls:** `list_recipients` OK, `record_plan` OK, `propose_transfer` OK
- **Agent reply:** I have created a proposal to transfer 0.0001 ETH to the recipient "Evidence recipient." The proposal has passed the policy checks but is currently awaiting your approval and signature in the console to proceed.
- **Then:** the owner signed this exact transfer (EIP-712); the agent key executed it

### Autonomous transfer [`0xbcdd8685…4a2d6e`](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e)

- **Instruction:** Schedule a one-time payment of 0.0001 ETH to my approved recipient "Evidence recipient" at 2026-10-17T07:16:39Z, valid for 1 day.
- **Model:** openai-compatible gpt-4.1-mini · 4 model calls · turn COMPLETED · 2026-10-17T07:14:09.420Z
- **Plan:** Schedule a one-time payment of 0.0001 ETH to 'Evidence recipient' at 2026-10-17T07:16:39Z, valid for 1 day: list_recipients → schedule_payment
- **Tool calls:** `record_plan` OK, `list_recipients` OK, `schedule_payment` OK
- **Agent reply:** I have scheduled a one-time payment of 0.0001 ETH to the recipient "Evidence recipient" at 2026-10-17T07:16:39Z. The task is currently pending your authorization. It will remain inactive until you sign the task grant on the Automation page. Each run is subject to policy checks and may require approval if it exceeds auto-approval limits.
- **Then:** the owner signed the task grant (EIP-712); the scheduler executed the run with no per-transfer signature

## All contract transactions

| Block | Time (UTC) | Tx | From | Events | Status | Gas used |
|---|---|---|---|---|---|---|
| 11932656 | 2026-10-17T07:11:00.000Z | [`0x879566e6…21f4a5`](https://sepolia.etherscan.io/tx/0x879566e6943dbcde1653a9f081b197487118cf1a6799ed03bbda6a41cb21f4a5) | deployer | Deployment | SUCCESS | 20316239 |
| 11932663 | 2026-10-17T07:12:24.000Z | [`0x912f3e0a…6459ff`](https://sepolia.etherscan.io/tx/0x912f3e0a0da0f02ee737a810c5f3bb7801859f0491a0703cc8ae8aec656459ff) | owner | RecipientUpdated | SUCCESS | 130018 |
| 11932664 | 2026-10-17T07:12:48.000Z | [`0x17ac2f09…6afa3e`](https://sepolia.etherscan.io/tx/0x17ac2f09e8767418eb1907fcc18231c19709ce82f36cdfceb4eab084746afa3e) | owner | Deposited | SUCCESS | 22707 |
| 11932667 | 2026-10-17T07:13:24.000Z | [`0x564129e2…c0702e`](https://sepolia.etherscan.io/tx/0x564129e213f1142da1d9d52e9b3e15eeff42852198cb7d3bcd84242eb6c0702e) | agent | TransferExecuted | SUCCESS | 282966 |
| 11932685 | 2026-10-17T07:17:00.000Z | [`0xbcdd8685…4a2d6e`](https://sepolia.etherscan.io/tx/0xbcdd8685f552b89ba37352a6768189d8d1e7b104c4d01c111a0e8fa5cf4a2d6e) | agent | TransferExecuted + GrantRunExecuted | SUCCESS | 412346 |
| 11932688 | 2026-10-17T07:17:36.000Z | [`0x4b8b8efd…6c14e6`](https://sepolia.etherscan.io/tx/0x4b8b8efdf4d5a709f320b58a2a7bea7289e7f9f410d7e20efab1829d886c14e6) | owner | GrantRevoked | SUCCESS | 129357 |
| 11932689 | 2026-10-17T07:17:48.000Z | [`0x19576c61…333ade`](https://sepolia.etherscan.io/tx/0x19576c61ccbdd0cea313be4894ccc59899569e7b7c7c7d4399145f1b50333ade) | owner | Paused | SUCCESS | 128877 |
| 11932691 | 2026-10-17T07:18:12.000Z | [`0xbfa8a88e…2fcdd6`](https://sepolia.etherscan.io/tx/0xbfa8a88eba16b05926c7a95cf3b0de0bc771ab942f08f70641c0f6cc762fcdd6) | owner | Unpaused | SUCCESS | 24796 |
| 11932692 | 2026-10-17T07:18:24.000Z | [`0x80a42def…0b1713`](https://sepolia.etherscan.io/tx/0x80a42def2843143de5a8418cc798fb231f19aa042fdb04d2bf155736cf0b1713) | owner | Paused + AgentUpdated + EmergencyStop | SUCCESS | 132453 |
| 11932693 | 2026-10-17T07:18:36.000Z | [`0xc3dff58a…fa433e`](https://sepolia.etherscan.io/tx/0xc3dff58a20a173604828f5b082283a21c2691cef94c34abc37b3a41088fa433e) | owner | Withdrawn | SUCCESS | 33893 |
