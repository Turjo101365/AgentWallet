# Ethereum Sepolia public run: notes

**Date:** 2026-10-16 (UTC). Authorized by Samprity Haque. Command: `npm run demo:sepolia -- --i-approve-sepolia-transactions`. This was the second attempt; the first stopped before deployment, see `../sepolia-attempt-1/ATTEMPT_NOTES.md`.

## Result

| | |
|---|---|
| Network | Ethereum Sepolia, chain 11155111 (public testnet; free test ETH from the pk910 PoW faucet; no real money, no bridging) |
| Contract | `0x8A44716Efabb6Ce401291B91D4427149CaF956a6`: [Blockscout](https://eth-sepolia.blockscout.com/address/0x8A44716Efabb6Ce401291B91D4427149CaF956a6) · [Etherscan](https://sepolia.etherscan.io/address/0x8A44716Efabb6Ce401291B91D4427149CaF956a6) |
| Transactions | 11, all SUCCESS: 2 gas top-ups, the deployment (14,278,824 gas), allowlist, deposit, 2 agent transfers, pause, unpause, emergency stop, withdrawal |
| AI agent | gpt-4.1-mini drafted both transfers. Their logs (instruction, plan, tool calls, reply) are in `EVIDENCE.md` |
| Autonomous execution | `0xedeb6b97…e3cec3`: executed by the scheduler under the owner-signed task grant, with no per-transfer owner signature (`approval_kind = TASK_GRANT`) |
| Policy rejection | An AI-drafted 0.0003 ETH transfer was rejected off-chain (PER_TX_LIMIT, BALANCE_AND_RESERVE); nothing was sent. See screenshot 08 and the audit log |
| Integrity | Audit hash chain valid (22 entries). Each wallet's nonce afterwards matched exactly the transactions in this report (owner 10 including attempt 1, deployer 1, agent 2, recipient 0) |

The full hash list with receipts is in `EVIDENCE.md`, `evidence.json` and `timeline.json`.

## Files

| File | What it is |
|---|---|
| `recordings/raw/agentwallet-sepolia-raw.webm` | **Unedited** recording of the whole run (10 min 29 s) |
| `recordings/raw/explorer-verification.webm` | Separate read-only explorer verification, recorded afterwards (see below) |
| `recordings/agentwallet-demo.mp4` | Concise cut (5 min 18 s): title cards plus trimmed genuine clips. Long waits are trimmed to their start and end; nothing is reordered within a step or altered |
| `screenshots/`, `explorer/` | One screenshot per step; one per explorer page |
| `EVIDENCE.md`, `evidence.json`, `timeline.json`, `run-log.txt` | Receipts, classification, replayed on-chain checks, AI-agent logs, step times, the run log |
| `explorer/verification.json` | What Blockscout showed for each item, and when |
| `MANIFEST.json` | SHA-256 of every file |

Videos are git-ignored because of their size; upload them separately. Their SHA-256 hashes are in `MANIFEST.json`.

## Honest limitations

- **Wallet:** the console used a **test-only EIP-1193 wallet bridge, not MetaMask**. It signed in code with the owner key, and only SIWE for this console, EIP-712 for this contract, and transactions to this contract. Real-MetaMask behaviour is evidenced separately (`docs/METAMASK_DEMO.md` §5, local chain).
- **Live explorer clips:** in the raw recording, Blockscout was still indexing. It showed the new contract as an EOA and the last transaction as Pending, and it displayed sponsored ads. A separate **read-only explorer verification** was therefore recorded at 2026-10-16 10:22 UTC, after indexing. Each page was reloaded until it showed Success, and third-party ad requests were blocked; every page carries an on-screen note saying so. The polished cut uses that verification instead of the live explorer clips. The raw run recording is unchanged.
- **Etherscan** blocks automated browsers with a Cloudflare check, so the recordings show Blockscout. Etherscan links are in the evidence.
- **Cleanup hang (fixed afterwards):** after the run finished and wrote all evidence, its cleanup hung. A double "stop" on an already-killed backend process waited forever. As a result, `CONFIRM_PUBLIC_DEPLOY` stayed at `yes` for a few minutes until it was reset to `no` by hand. Wallet nonces confirm nothing was sent in that window. Fixes: an idempotent process stop, the gate reset moved to run first and immediately after the last public transaction, and bounded cleanup steps. Regression tests: `backend/test/deploy.gate.test.js`.
