# On-chain execution evidence (chain 11155111)

Generated 2026-10-16T10:14:35.922Z by `scripts/collect-evidence.mjs` (read-only). Re-run the script to reproduce it from the chain.

| | |
|---|---|
| Contract | [`0x8A44716Efabb6Ce401291B91D4427149CaF956a6`](https://sepolia.etherscan.io/address/0x8A44716Efabb6Ce401291B91D4427149CaF956a6) |
| Deploy tx | [`0x7d7492bf…ae1ad3`](https://sepolia.etherscan.io/tx/0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3) (block 11926653) |
| Owner / agent | `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` / `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` |
| Transactions | 9 (0 reverted) |
| Agent transfers | 2: **1 autonomous** (task grant), 1 owner-approved (EIP-712) |
| On-chain checks | every transfer was sent by the on-chain agent to an allowlisted recipient within the per-tx and daily caps |
| AI agent | 2 of 2 transfers were drafted by the AI agent (log below) |
| Audit log hash chain | valid (22 entries) |

## Agent transfers

| Time (UTC) | Tx | Amount | Recipient | Authorization | Agent sent | Allowlisted | ≤ per-tx | ≤ daily |
|---|---|---|---|---|---|---|---|---|
| 2026-10-16T10:08:00.000Z | [`0x2c83a855…2e37fb`](https://sepolia.etherscan.io/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb) | 0.0001 ETH | `0x82446B165d0d55051af76e3aD7852B0F3141904e` | OWNER_APPROVED | ✓ | ✓ | ✓ | ✓ |
| 2026-10-16T10:11:36.000Z | [`0xedeb6b97…e3cec3`](https://sepolia.etherscan.io/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3) | 0.0001 ETH | `0x82446B165d0d55051af76e3aD7852B0F3141904e` | AUTONOMOUS (task "0.0001 ETH once at 2026-10-16T10:11:19.000Z", run aa334b60-22ca-408f-a6dc-aab45967557d:1792145479) | ✓ | ✓ | ✓ | ✓ |

## AI agent execution log

### Owner-approved transfer [`0x2c83a855…2e37fb`](https://sepolia.etherscan.io/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb)

- **Instruction:** Send 0.0001 ETH to my approved recipient "Evidence recipient".
- **Model:** openai-compatible gpt-4.1-mini · 4 model calls · turn COMPLETED · 2026-10-16T10:07:12.468Z
- **Plan:** Create a transfer proposal to send 0.0001 ETH to the approved recipient Evidence recipient.: propose_transfer
- **Tool calls:** `list_recipients` OK, `record_plan` OK, `propose_transfer` OK
- **Agent reply:** The transfer proposal to send 0.0001 ETH to the approved recipient "Evidence recipient" has been created and is currently awaiting your approval and signature in the console. Let me know if you need assistance with anything else.
- **Then:** the owner signed this exact transfer (EIP-712); the agent key executed it

### Autonomous transfer [`0xedeb6b97…e3cec3`](https://sepolia.etherscan.io/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3)

- **Instruction:** Schedule a one-time payment of 0.0001 ETH to my approved recipient "Evidence recipient" at 2026-10-16T10:11:19Z, valid for 1 day.
- **Model:** openai-compatible gpt-4.1-mini · 4 model calls · turn COMPLETED · 2026-10-16T10:08:49.312Z
- **Plan:** Schedule a one-time payment of 0.0001 ETH to 'Evidence recipient' at 2026-10-16T10:11:19Z, valid for 1 day: list_recipients → schedule_payment
- **Tool calls:** `record_plan` OK, `list_recipients` OK, `schedule_payment` OK
- **Agent reply:** I have scheduled a one-time payment of 0.0001 ETH to the approved recipient "Evidence recipient" at 2026-10-16T10:11:19Z. The task is pending your authorization in the Automation page. The payment will be valid for 1 day and will remain inactive until you sign the task grant. Each execution will be subject to policy checks and may require approval.
- **Then:** the owner signed the task grant (EIP-712); the scheduler executed the run with no per-transfer signature

## All contract transactions

| Block | Time (UTC) | Tx | From | Events | Status | Gas used |
|---|---|---|---|---|---|---|
| 11926653 | 2026-10-16T10:04:48.000Z | [`0x7d7492bf…ae1ad3`](https://sepolia.etherscan.io/tx/0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3) | deployer | Deployment | SUCCESS | 14278824 |
| 11926663 | 2026-10-16T10:06:48.000Z | [`0xf6306fe5…b36299`](https://sepolia.etherscan.io/tx/0xf6306fe567bd2286a4f066529896cc444cd29a77d07b1a84944f3b5d59b36299) | owner | RecipientUpdated | SUCCESS | 129974 |
| 11926664 | 2026-10-16T10:07:00.000Z | [`0xe593d6d3…968ba1`](https://sepolia.etherscan.io/tx/0xe593d6d3c778ed09476cf1997e90699bd4b7909d433a0653dd64388512968ba1) | owner | Deposited | SUCCESS | 22707 |
| 11926668 | 2026-10-16T10:08:00.000Z | [`0x2c83a855…2e37fb`](https://sepolia.etherscan.io/tx/0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb) | agent | TransferExecuted | SUCCESS | 450221 |
| 11926686 | 2026-10-16T10:11:36.000Z | [`0xedeb6b97…e3cec3`](https://sepolia.etherscan.io/tx/0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3) | agent | TransferExecuted | SUCCESS | 168701 |
| 11926689 | 2026-10-16T10:12:12.000Z | [`0x2a2eeb50…bd211b`](https://sepolia.etherscan.io/tx/0x2a2eeb5084f9dba38e177d2b4528b7242356c5dcb51796c203fa5b9a3bbd211b) | owner | Paused | SUCCESS | 128920 |
| 11926691 | 2026-10-16T10:12:36.000Z | [`0x00b0dc31…f2f3d0`](https://sepolia.etherscan.io/tx/0x00b0dc316138f8cef8b329e4ff91a469612a8207317615442012bfee21f2f3d0) | owner | Unpaused | SUCCESS | 24743 |
| 11926692 | 2026-10-16T10:12:48.000Z | [`0xfe627133…e53a8d`](https://sepolia.etherscan.io/tx/0xfe627133719dc4493552259d250ebb7fe31fb86ead7e2034569eea99ede53a8d) | owner | Paused + AgentUpdated + EmergencyStop | SUCCESS | 132409 |
| 11926693 | 2026-10-16T10:13:00.000Z | [`0x6c8fb074…a5cff5`](https://sepolia.etherscan.io/tx/0x6c8fb074172a800c3d85eaa2eb54b5675dcf3e204fd7c7c276e67104d6a5cff5) | owner | Withdrawn | SUCCESS | 33876 |
