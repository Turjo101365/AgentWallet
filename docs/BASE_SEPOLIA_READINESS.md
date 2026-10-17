> **Status 2026-10-17.** The Ethereum Sepolia run in this runbook was **completed on 2026-10-16** with contract **v1** (`0x8A44…956a6`,
> `evidence/sepolia/`). That target is now **frozen**: `--network sepolia --execute` and the v1 demo refuse to run, so the v1 evidence
> cannot be overwritten. The commands below are the historical record of how it was run. Contract v2's first public run (`sepolia-v2`) is
> partial and now frozen too; the full v2 run (separate, guarded `sepolia-v2-full` target, `scripts/sepolia-v2.mjs`) completed
> on 2026-10-17: 12/12 SUCCESS, contract `0x3C93…582F`, `evidence/sepolia-v2-full/`. See [V2_PUBLIC_RUNS.md](V2_PUBLIC_RUNS.md). Base Sepolia was never executed.

# Deliverable 06: Public-Testnet Execution-Evidence Runbook

Prepared 2026-10-16. **Nothing has been deployed, signed or sent on any public network.** The whole run is one command, gated by two explicit approvals.

**Organizer guidance:** "There are no restrictions on on-chain transactions." (see [ORGANIZER_GUIDANCE.md](ORGANIZER_GUIDANCE.md)). The team treats public-testnet transactions as acceptable, as a working assumption; the reply doesn't name any network.

## ✅ Executed: Ethereum Sepolia, 2026-10-16

The recorded public run succeeded on its second attempt. **Contract `0x8A44716Efabb6Ce401291B91D4427149CaF956a6`**, 11 successful transactions, two AI-agent-drafted transfers (one owner-approved, one autonomous under a signed grant), all confirmed on Blockscout.

- Evidence: [`evidence/sepolia/RUN_NOTES.md`](../evidence/sepolia/RUN_NOTES.md), [`EVIDENCE.md`](../evidence/sepolia/EVIDENCE.md).
- Attempt 1 (stopped before deployment): [`evidence/sepolia-attempt-1/ATTEMPT_NOTES.md`](../evidence/sepolia-attempt-1/ATTEMPT_NOTES.md).

## Primary route: Ethereum Sepolia (chain 11155111)

**Why:** every Base Sepolia faucet we tried needs mainnet ETH or LINK, or a login that failed. Bridging was ruled out. Ethereum Sepolia has a verified free faucet that needs no account and no mainnet balance, and the app now supports it alongside Base Sepolia and the local chain, without changing either.

| | Ethereum Sepolia | Base Sepolia (alternative, unchanged) |
|---|---|---|
| Free faucet | **pk910 PoW** (`https://sepolia-faucet.pk910.de`): no account, no mainnet balance, works for new wallets. Captcha plus about 20 min of browser mining; minimum claim 0.05 SepETH. Live check 2026-10-16: payout wallet funded (~12,185 SepETH) and actively paying | Faucets need mainnet ETH, mainnet LINK, or a login |
| Budget (`npm run sepolia:plan`, live gas) | **≥ 0.0006 ETH to the owner**; one pk910 claim covers it about 80× | ≥ 0.000686 ETH |
| Backend profile / port / database | `backend/.env.sepolia` / 4200 / `backend/data/sepolia` | `backend/.env.base-sepolia` / 4100 / `backend/data/base-sepolia` |
| Deployment record / evidence | `contracts/deployments/sepolia.json` / `evidence/sepolia/` | `contracts/deployments/base_sepolia.json` / `evidence/base-sepolia/` |
| Explorer | `https://sepolia.etherscan.io` | `https://sepolia.basescan.org` |
| Run | `npm run sepolia:execute -- --i-approve-sepolia-transactions` | `npm run base-sepolia:execute -- --i-approve-base-sepolia-transactions` |

The same four wallets work on both chains (an EVM address is chain-independent): owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba`, recipient `0x82446B165d0d55051af76e3aD7852B0F3141904e`, deployer `0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67`, agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D`.

**Steps:**
1. **Samprity (the only manual step, because faucets require a human captcha):**
   - open `https://sepolia-faucet.pk910.de`;
   - paste the owner address `0x10A0d3247a1446fD30ba40D14e4272206278b5ba`;
   - solve the captcha, then click **Start Mining**;
   - leave the tab open until it shows at least 0.05 SepETH, then click **Stop Mining** and **Claim**.

   No wallet connection, signature or payment is involved.
2. Claude checks the balance read-only (`npm run sepolia:plan`).
3. 🔒 **Samprity approves:** set `CONFIRM_PUBLIC_DEPLOY=yes`, then run `npm run sepolia:execute -- --i-approve-sepolia-transactions`. This runs the same sequence that passed the local rehearsal (table below), with 2 confirmations per step.
   - Both transfers are **drafted by the AI agent** (gpt-4.1-mini from `backend/.env`): "Send 0.0001 ETH to my approved recipient …" and "Schedule a one-time payment of 0.0001 ETH … at <time>".
   - The run checks each draft's recipient, amount, token, status and schedule before the owner signs, and refuses any mismatch.
   - This makes about 6–8 calls to your **paid OpenAI key**, well under US$0.01 at gpt-4.1-mini prices. That is the only real-money cost. Without an LLM configured, the run drafts through the API instead and the evidence has no AI log.
4. `CONFIRM_PUBLIC_DEPLOY` is set back to `no`. The evidence is in `evidence/sepolia/EVIDENCE.md` (with Etherscan links) and `evidence.json`. It includes every transaction hash with its receipt (status, block, gas), the classification of each transfer as AUTONOMOUS or OWNER_APPROVED, and the replayed cap and allowlist checks. It also has an **AI agent execution log** for each transfer the agent drafted: the instruction, the model, the plan, every tool call with its status and input, and the agent's reply.
5. Optional: `cd contracts && npx hardhat verify --network sepolia <contract> 0x10A0d3247a1446fD30ba40D14e4272206278b5ba 0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D 200000000000000 500000000000000` (Sourcify; Etherscan too if `ETHERSCAN_API_KEY` is set).

**What changed to support it (verified, not yet committed):**
- The network registry entry for 11155111 (Etherscan explorer, 2 confirmations, 2000-block log range; publicnode accepted 10,000).
- The Hardhat `sepolia` network, and the deploy script with `SEPOLIA_NATIVE_*` caps.
- The console's wallet network parameters.
- The run script's `--network` targets and the collector's per-network defaults.
- The new git-ignored profile.

Every mainnet stays refused (tested: chains 1, 8453, 137, 10, 42161, 56). Sepolia gets the same public-network key guards as Base Sepolia (tested). Nothing on the local or Base Sepolia paths changed.

**Limitations:**
- Sepolia gas is volatile. The run budgets the live price ×3, and refuses gas top-ups above 0.01 ETH, so if gas spikes sharply it stops before sending anything.
- The backend profile caps gas at 5 gwei (`MAX_FEE_PER_GAS_GWEI`), so above that the policy engine rejects agent executions until gas falls.
- pk910 mining time depends on the computer and the faucet load.

### Recorded demonstration (`scripts/sepolia-demo.mjs`)

The public run can be **recorded end to end** instead of run headless:

```bash
npm run demo:sepolia -- --i-approve-sepolia-transactions
```

This needs `CONFIRM_PUBLIC_DEPLOY=yes`. The recording is one continuous Playwright video of a single browser tab (1440×900):
- an on-screen run log for the owner top-ups and the deployment;
- the deployment on **Blockscout**;
- the real AgentWallet console: connect wallet, network switch, SIWE sign-in, recipient allowlist, deposit;
- the AI agent: instruction, plan, tool calls, draft;
- the 14 risk checks, the owner's EIP-712 approval and on-chain execution;
- the AI-drafted over-cap transfer rejected by policy, the auto-approval limit, the AI-drafted scheduled payment, the owner-signed grant and autonomous execution;
- pause, unpause, emergency stop, withdrawal, transaction history, the hash-chained audit log;
- each key transaction on Blockscout.

| Output (`evidence/sepolia/`) | |
|---|---|
| `recordings/raw/agentwallet-sepolia-raw.webm` | Unedited recording (git-ignored: upload separately; SHA-256 in `MANIFEST.json`) |
| `recordings/agentwallet-demo.mp4` | Concise cut: title cards plus trimmed genuine clips, with long waits trimmed to their start and end, never reordered or altered (git-ignored) |
| `screenshots/NN-step.png`, `timeline.json`, `run-log.txt` | One screenshot per step; step times; all hashes with Blockscout and Etherscan links |
| `EVIDENCE.md`, `evidence.json` | Receipts, AUTONOMOUS / OWNER_APPROVED classification, replayed on-chain checks, AI-agent execution log, audit-chain check |
| `MANIFEST.json` | SHA-256 of every file |

**Honest limits:**
- **Wallet:** the console uses a **test-only EIP-1193 wallet bridge, not MetaMask**. It signs in code with the owner key, and only SIWE for this console, EIP-712 for this contract, and transactions to this contract. Every video card says so. Real-MetaMask behaviour is evidenced separately (`METAMASK_DEMO.md` §5, 11/11, local chain). Recording real MetaMask on the public run would mean typing the owner key and a wallet password into MetaMask, which this automation does not do.
- **Explorer:** Etherscan blocks automated browsers with a Cloudflare check, so the video shows **Blockscout**. Etherscan links are still in the evidence for manual viewing.
- **Secrets:** a scan fails the run if any private key or the OpenAI key appears in any text output. The UI never displays keys.

**Rehearsed:** `npm run demo:rehearse` (local chain, throwaway keys, test LLM stub) passed all 15 steps on 2026-10-16. That run produced 9 contract transactions, a raw recording and a polished cut, and passed the secret scan; frames were inspected for readability.

---

The rest of this document covers the Base Sepolia route, which remains fully supported.

## Status

| Item | Status |
|---|---|
| Four testnet-only keys, git-ignored, verified distinct and not public Hardhat keys | ✅ |
| `OWNER_ADDRESS` / `AGENT_ADDRESS` in `contracts/.env` | ✅ match the keys |
| Recipient allowlist | ✅ **Automated:** the run's first owner transaction after deployment (`setRecipient`). It can't be set before the contract exists |
| Separate backend profile; local demo untouched | ✅ `config.profile.test.js` |
| Indexer within the RPC's 200-block log limit | ✅ `indexer.range.test.js` |
| Source verification config (Sourcify; Etherscan V2 optional) | ✅ |
| Automated run with plan / rehearse / execute modes | ✅ `scripts/base-sepolia-run.mjs`; rehearsal passes (`base-sepolia.run.test.js`) |
| Evidence collector | ✅ `evidence.collector.test.js` |
| Funding the owner (≥ 0.000686 testnet ETH) | ⏳ **Needs Samprity:** see "Funding" |
| Organizer confirmation that testnet hashes qualify | ⏳ Samprity |
| Approval to execute | ⏳ Samprity |

## Wallets (Base Sepolia, chain 84532)

| Role | Address | Key file (git-ignored) | Job |
|---|---|---|---|
| Owner | `0x10A0d3247a1446fD30ba40D14e4272206278b5ba` | `secrets/base-sepolia-wallets.env` | Custody: allowlist, deposit, EIP-712 approval, task grant, pause, emergency stop, withdraw. **Only faucet target** |
| Recipient | `0x82446B165d0d55051af76e3aD7852B0F3141904e` | `secrets/base-sepolia-wallets.env` | Receives the two transfers. No funding needed |
| Deployer | `0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67` | `contracts/.env` | Pays deploy gas only. Topped up by the owner during the run |
| Agent | `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D` | `backend/.env.base-sepolia` | `executeTransfer` only. Topped up by the owner during the run |

The local demo keeps its own settings (`backend/.env`, chain 31337, caps 0.01 / 0.05 ETH, ports 4000 / 5173). None of the above touches it.

## Funding

`npm run base-sepolia:plan` (read-only) computes the budget from the live gas price ×3 plus the L1 data fee from Base's on-chain `GasPriceOracle`:

| | Testnet ETH |
|---|---|
| Owner: 0.0004 deposit (0.0002 comes back on withdrawal) + gas for 8 owner txs | 0.000410 |
| Deployer top-up (deploy gas + L1 fee) | 0.000069 |
| Agent top-up (0.0002 gas floor + 2 executions) | 0.000207 |
| **Fund the owner with** | **≥ 0.000686**, i.e. **7 faucet claims; claim 8 (0.0008) for headroom** |

Measured on 2026-10-16: 0.011 gwei gas price, and L1 fees of about 7 × 10⁻¹⁵ ETH for the deploy. The rehearsal finished with headroom left over from exactly this budget.

**Can funding be automated?** Not without your involvement.

| Faucet | Automatable? | What it requires |
|---|---|---|
| Coinbase CDP faucet, portal | No | Sign in to a free CDP account and claim in the browser (0.0001 ETH per claim, up to 0.1 ETH/day) |
| Coinbase CDP faucet, API (`requestFaucet`) | Yes, after setup | A free CDP account **plus** an API key and wallet secret that only you can create. The official SDK needs Node 22+; this machine has Node 20.19.5 |
| Other listed faucets (thirdweb, Alchemy, QuickNode, LearnWeb3) | No | Sign-in, CAPTCHA, or a mainnet balance |

No faucet gives testnet ETH without an account or human verification, and bypassing those isn't on the table. The quickest path is **8 portal claims to the owner address**.

## Exact sequence (`npm run base-sepolia:execute -- --i-approve-base-sepolia-transactions`)

This is identical to the rehearsal that passed on 2026-10-16. Each on-chain step waits for 2 confirmations.

| # | Signer | Transaction / action | Value | Evidence |
|---|---|---|---|---|
| 1 | Owner | Top up the deployer | ≈0.000069 | tx |
| 2 | Owner | Top up the agent | ≈0.000207 | tx |
| 3 | Deployer | Deploy `AgentWallet(owner, agent, 0.0002 ETH/tx, 0.0005 ETH/day)` | gas | deploy tx; `contracts/deployments/base_sepolia.json` |
| 4 | Owner | `setRecipient(recipient, true)` | gas | `RecipientUpdated` |
| 5 | Owner | `deposit()` | 0.0004 | `Deposited` |
| 6 | — | Backend starts with `backend/.env.base-sepolia` on :4100 | — | — |
| 7 | Owner → Agent | SIWE sign-in; proposal of 0.0001 ETH; owner EIP-712 approval; the agent executes | 0.0001 to the recipient | `TransferExecuted` (OWNER_APPROVED) |
| 8 | — | Proposal of 0.0003 ETH (above the cap) | none | `POLICY_REJECTED` (PER_TX_LIMIT); no tx |
| 9 | Owner → Scheduler → Agent | Auto-approval limit 0.0001; one-time task; owner signs the grant; the scheduler executes on its own | 0.0001 to the recipient | `TransferExecuted` (AUTONOMOUS) |
| 10 | Owner | `pause()`, `unpause()`, `emergencyStop()` | gas | `Paused`, `Unpaused`, `EmergencyStop` |
| 11 | Owner | `withdraw` the remainder to the owner | ≈0.0002 back | `Withdrawn` |
| 12 | — | Evidence collection (read-only) | — | `evidence/base-sepolia/EVIDENCE.md`, `evidence.json` |

**Safety gates:**
- **Two explicit approvals:** the command flag **and** `CONFIRM_PUBLIC_DEPLOY=yes` in `contracts/.env`.
- **Chain check:** the chain must be 84532.
- **Destination check:** value can only go to the four roles or the deployed contract.
- **Ceilings:** at most 0.001 ETH per deposit or payment, and 0.01 ETH per gas top-up.
- **Balance check:** the owner balance is checked before anything is sent.
- **Re-runnable:** after a failure it reuses the existing deployment and skips the allowlist and deposit if done. Later steps (transfers, task, emergency controls) run again.

**Afterwards (optional):** `cd contracts && npx hardhat verify --network base_sepolia <contract> 0x10A0d3247a1446fD30ba40D14e4272206278b5ba 0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D 200000000000000 500000000000000` publishes the verified source on Sourcify (and on BaseScan if `ETHERSCAN_API_KEY` is set).

## Evidence report contents

`scripts/collect-evidence.mjs` is read-only.

- **Contract:** address and deploy tx, with BaseScan links.
- **Every contract transaction:** sender role (deployer / owner / agent), decoded events, status and gas.
- **Each agent transfer, classified:**
  - **AUTONOMOUS:** `approval_kind = TASK_GRANT`; its stored signature is the task grant's, and there is no per-transfer owner signature.
  - **OWNER_APPROVED:** an EIP-712 owner signature for that exact transfer.
- **Checks replayed from the chain's own events:** sent by the on-chain agent; recipient allowlisted; within the per-tx and daily caps (matching `spentToday`).
- **Audit-log hash-chain verification.**

## Commands

| Command | Effect |
|---|---|
| `npm run base-sepolia:plan` | Read-only: roles, balances, live budget |
| `npm run base-sepolia:check` | Read-only preflight: what's missing |
| `npm run base-sepolia:rehearse` | Full sequence on a throwaway local chain |
| `npm run base-sepolia:execute -- --i-approve-base-sepolia-transactions` | The real run (also needs `CONFIRM_PUBLIC_DEPLOY=yes`) |
| `npm run evidence:collect` | Re-collect evidence at any time (read-only) |
| `npm run base-sepolia:start` | Interactive console on Base Sepolia (:5174), after deployment |
