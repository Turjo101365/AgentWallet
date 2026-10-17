# On-chain execution evidence (chain 11155111)

Generated 2026-10-17T00:08:32.690Z by `scripts/collect-evidence.mjs` (read-only). Re-run the script to reproduce it from the chain.

| | |
|---|---|
| Contract | [`0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458`](https://sepolia.etherscan.io/address/0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458) |
| Deploy tx | [`0x2d2e7f77…18cb91`](https://sepolia.etherscan.io/tx/0x2d2e7f77ed786c1681af6524da8ab8d3aa5f6fbf9210a683f3561dc4f818cb91) (block 11930577) |
| Owner / agent | `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` / `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` |
| Transactions | 6 (0 reverted) |
| Agent transfers | 1: **0 autonomous** (task grant), 1 owner-approved (EIP-712) |
| On-chain checks | every transfer was sent by the on-chain agent to an allowlisted recipient within the per-tx and daily caps |
| AI agent | 1 of 1 transfers were drafted by the AI agent (log below) |
| Audit log hash chain | valid (21 entries) |

## Agent transfers

| Time (UTC) | Tx | Amount | Recipient | Authorization | Agent sent | Allowlisted | ≤ per-tx | ≤ daily |
|---|---|---|---|---|---|---|---|---|
| 2026-10-16T23:56:24.000Z | [`0x30714eb9…51aab1`](https://sepolia.etherscan.io/tx/0x30714eb92194cd5ad45b172af45acb67ed6b43f1fcbde98b0fd02e5c4e51aab1) | 0.0001 ETH | `0x82446B165d0d55051af76e3aD7852B0F3141904e` | OWNER_APPROVED | ✓ | ✓ | ✓ | ✓ |

## AI agent execution log

### Owner-approved transfer [`0x30714eb9…51aab1`](https://sepolia.etherscan.io/tx/0x30714eb92194cd5ad45b172af45acb67ed6b43f1fcbde98b0fd02e5c4e51aab1)

- **Instruction:** Send 0.0001 ETH to my approved recipient "Evidence recipient".
- **Model:** openai-compatible gpt-4.1-mini · 4 model calls · turn COMPLETED · 2026-10-16T23:55:54.628Z
- **Plan:** Propose a transfer of 0.0001 ETH to the approved recipient 'Evidence recipient'.: propose_transfer
- **Tool calls:** `list_recipients` OK, `record_plan` OK, `propose_transfer` OK
- **Agent reply:** The transfer proposal of 0.0001 ETH to the approved recipient "Evidence recipient" has passed the policy check and is now awaiting your approval and signature in the console. Please review and approve it there to proceed.
- **Then:** the owner signed this exact transfer (EIP-712); the agent key executed it

## All contract transactions

| Block | Time (UTC) | Tx | From | Events | Status | Gas used |
|---|---|---|---|---|---|---|
| 11930577 | 2026-10-16T23:53:48.000Z | [`0x2d2e7f77…18cb91`](https://sepolia.etherscan.io/tx/0x2d2e7f77ed786c1681af6524da8ab8d3aa5f6fbf9210a683f3561dc4f818cb91) | deployer | Deployment | SUCCESS | 20316239 |
| 11930586 | 2026-10-16T23:55:36.000Z | [`0x6da0058b…0c8ab5`](https://sepolia.etherscan.io/tx/0x6da0058bc825790e0d23b04d796bd16183c46d208e3dab09b6b21a98f20c8ab5) | owner | RecipientUpdated | SUCCESS | 130018 |
| 11930587 | 2026-10-16T23:55:48.000Z | [`0x2622580d…98a441`](https://sepolia.etherscan.io/tx/0x2622580df473a48bf1f95e412cbe7f8669d0c1f1f3af5c6d3d0e03f26f98a441) | owner | Deposited | SUCCESS | 22707 |
| 11930590 | 2026-10-16T23:56:24.000Z | [`0x30714eb9…51aab1`](https://sepolia.etherscan.io/tx/0x30714eb92194cd5ad45b172af45acb67ed6b43f1fcbde98b0fd02e5c4e51aab1) | agent | TransferExecuted | SUCCESS | 282966 |
| 11930641 | 2026-10-17T00:06:36.000Z | [`0x67f74c28…3d1a4a`](https://sepolia.etherscan.io/tx/0x67f74c28b9fdf3e23e4b15a971cb02c04acabae18558eec1ba38b13bc23d1a4a) | owner | Paused + AgentUpdated + EmergencyStop | SUCCESS | 132453 |
| 11930643 | 2026-10-17T00:07:00.000Z | [`0x63f135cd…94a4da`](https://sepolia.etherscan.io/tx/0x63f135cd9c27a511a216a0b107d1f1ef2ddfd8b6c26a840c849f433ca194a4da) | owner | Withdrawn | SUCCESS | 33903 |
