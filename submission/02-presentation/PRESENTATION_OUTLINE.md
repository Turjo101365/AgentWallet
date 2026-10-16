# Presentation (Deliverable 02): outline and speaker notes

**Files:**
- `AgentWallet-deck.pdf`: 15 slides, 1920×1080.
- `deck.html`: editable source. Open it in a browser and print to PDF to re-export.
- `assets/`: genuine frames from the public-run replay, explorer verification, terminals and MetaMask.

**Target length:** about 9:30, under the 10-minute limit. Each slide lists the matching mini-clip, so you can embed or replace screenshots with video.

| # | Slide | Time | Speaker notes | Embed |
|---|---|---|---|---|
| 1 | The AI plans. You authorize. The contract enforces. | 0:30 | "We built a treasury an AI agent can operate without ever being trusted with the money. It ran on Ethereum Sepolia: 11 transactions, all successful." | — |
| 2 | Give an AI a wallet, and it can lose the money | 0:40 | Three failure modes: hallucinated recipients, prompt injection, runaway autonomy. "Telling the model to be careful is not a control." | — |
| 3 | Every payment crosses four gates | 0:45 | The model plans; trusted code runs 14 block-pinned checks, including a simulation; the owner signs one transfer or one bounded grant; the contract enforces caps and the allowlist. "Each gate is independent." | — |
| 4 | Architecture | 0:45 | Three trust boundaries. The owner key stays in the wallet; the backend holds only an agent key the contract limits to `executeTransfer`; the chain is the final judge. | clip 13 |
| 5 | A treasury command deck | 0:35 | Live public data; the PUBLIC TESTNET vs LOCAL SIMULATION banner; explorer links on every public transaction. | clip 01 |
| 6 | Plain English in, a draft out | 0:40 | The real public-run turn: list_recipients → record_plan → propose_transfer, ending AWAITING_APPROVAL. "It can draft, never sign." | clip 02 |
| 7 | The AI drafted 0.0003 ETH. Policy said no. | 0:40 | PER_TX_LIMIT and BALANCE_AND_RESERVE failed; nothing signed; the agent key sent exactly 2 transactions all run. | clips 03, 04 |
| 8 | One signature per transfer, or one grant for many | 0:40 | ApproveTransfer vs AuthorizeTask. **Say plainly:** public signing used a test-only wallet bridge; real MetaMask was verified locally. | clips 05, 12 |
| 9 | The agent paid on its own, inside a grant | 0:50 | Walk the UTC timeline. The owner signs once at 10:09; the transfer mines at 10:11:36 in block 11926686 without another signature. "This is the autonomous on-chain execution." | **clip 06** |
| 10 | Who can do what, and who enforces it | 0:40 | Tiers T0–T5; which are contract-enforced vs backend; a viewer gets 403 on every write. | clip 10 |
| 11 | Stop everything in one transaction | 0:35 | Pause, unpause, emergency stop (revokes the agent atomically), withdraw: all public. "The contract is still stopped today." | clip 09 |
| 12 | 11 public transactions. All successful. | 0:35 | Independent receipt check; independent audit-chain recomputation tying AI decisions to transaction hashes. | clips 08, 11 |
| 13 | Tested like it holds money | 0:30 | Counts. Mention adversarial cases: re-entrancy, forged signatures, prompt injection, loosening attempts. | clip 10 (terminals) |
| 14 | What we don't claim | 0:35 | The limitations. Next: policy-bounded rebalancing with the swap primitive already deployed. **It is a proposal, not a feature.** | — |
| 15 | Autonomous where it's safe. Human where it matters. | 0:20 | Contract, autonomous transaction, repository. | — |

**Total ≈ 9:30.**

## Accuracy checklist before presenting

- [ ] Repository link is public.
- [ ] Do not say "MetaMask" for the public run.
- [ ] Do not say the organizers approved a specific testnet. Quote: "There are no restrictions on on-chain transactions."
- [ ] Rebalancing, RL timing on a public chain, and on-chain audit anchoring are **not** implemented. Present them as roadmap.
- [ ] Every hash on a slide matches `submission/06-execution-evidence/EXECUTION_EVIDENCE.md`.
