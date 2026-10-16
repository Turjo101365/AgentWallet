# Known Limitations

As of the end of Phase 2 (2026-10-15), with 2026-10-17 additions:
- **Contract v2 is local only.** The public Sepolia contract is v1. On it, the owner's approval and task grants are verified by the backend, not the contract, so a stolen agent key could spend within the caps to allowlisted recipients until `emergencyStop`. v2 closes this on-chain but is not deployed ([CONTRACT_V2.md](CONTRACT_V2.md)).
- **On v2, a grant's schedule is enforced off-chain.** The contract enforces its signature, expiry, remaining runs and total, and revocation.
- **Public signing used a test-only wallet bridge.** Real MetaMask was verified on local Hardhat chains (11/11 on v2).

## LLM agent
- **Real-model coverage is limited.** gpt-4.1-mini was exercised by the live safety suite (19/19 assertions × 4 runs, `LIVE_LLM_VERIFICATION.md`) and drafted both public Sepolia transfers. Beyond those, how well a real model understands arbitrary commands is unmeasured; a broader eval set is the next step.
- **Strict tool schemas use nullable type unions** (`["string","null"]`). Accepted by the JSON Schema used, but not verified against the live Anthropic strict-mode validator.
- **One provider per process;** no automatic provider failover beyond Anthropic's server-side refusal fallback.
- **No streaming:** each turn returns when complete (at most 8 model calls by default).
- **Token symbols must match exactly.** "USDC" does not silently map to the local test token "mUSDC"; the agent is instructed to ask.

## Autonomous execution
- **Every autonomous run still needs an owner-configured auto-approval limit** to run without a human. By default nothing auto-executes; runs escalate.
- **Missed recurring occurrences are skipped, not caught up.** For example, the backend was down for a week.
- **Weekly schedules are UTC only.** There is no timezone or calendar handling (holidays, month-end).
- **A transaction that is submitted cannot be cancelled** by cancelling its task. Only pending and escalated runs are closed.
- **Single-instance assumptions remain** for the in-process mutexes. Tasks and runs coordinate across instances through DB leases and compare-and-set (verified with two scheduler instances on one database), but rate limits and the approval/executor mutexes are per process.
- **Conditional triggers:** only `gas_below_gwei` and `balance_above`, polled at `CONDITION_CHECK_SECONDS`.

## RL execution timing
- **Trained only on a synthetic gas process.** Not calibrated on real fee data. On a local Hardhat chain (smoothly decaying base fee) PPO advised WAIT with probability 0.99998, an out-of-distribution input. The deterministic deadline forced execution as designed.
- **One training seed per algorithm.** PPO vs DQN differences are within overlapping confidence intervals.
- **The serving cadence must match training:** 15-minute gas samples (`GAS_SAMPLE_INTERVAL_SECONDS=900`). Shorter intervals in demos change the meaning of "steps" and are out of distribution.
- **Checkpoints are ignored by git** (`rl-engine/models/*/*.zip`). `metadata.json` files are also untracked; regenerate with `npm run train:ppo` / `train:dqn`, or decide to commit the ~250 KB of artifacts.

## Portfolio
- **No swaps or DEX integration.** Allocation drift is reported with an explicit "not supported" note; nothing rebalances.
- **Local prices are synthetic mock feeds.** For Base Sepolia, Chainlink feed addresses must be verified and added to the deployment record; none are configured by default.
- **History starts at the first balance snapshot.** Older history is not reconstructed (ERC-20 transfers into the wallet are not contract events).
- **Projected outflows** consider active and pending tasks over 7 days, assuming every run succeeds.

## Chain and contract (unchanged from Phase 1)
- **Daily caps use UTC calendar days**, so up to 2× the cap can move within 24 hours around midnight.
- **Deployed on Ethereum Sepolia, not on Base Sepolia.** The Sepolia run (2026-10-16) is in `evidence/sepolia/`. Base Sepolia is prepared and rehearsed but not executed (faucet constraints). The Sepolia contract is now emergency-stopped (paused, agent revoked); any new public demonstration needs owner transactions and explicit approval.
- **Fee-on-transfer and rebasing tokens** are not accounted for.
- **The indexer rewinds 12 blocks** on a reorg; deeper reorgs are not handled.

## Environment
- **Memory:** the dev machine had about 0.6 GB free RAM. Under that pressure a backend process once failed to start (V8 "out of memory: Zone" while compiling PGlite WASM). On constrained hosts use PostgreSQL via `DATABASE_URL`.
- **Browser coverage:** the console is tested with Playwright through a test wallet bridge (3 flows) and with the real MetaMask 13.52.0 extension on a local chain (11/11 rows on 2026-10-15; 10 PASS + 1 BLOCKED-by-paid-LLM on 2026-10-16). The public Sepolia run used the test-only bridge, not MetaMask.
- **Docker** images and compose are written but unbuilt; Docker is not installed. The RL image now installs PyTorch CPU to load checkpoints.
- **No dependency vulnerability scan** (`npm audit`, `pip-audit`) has been run.
