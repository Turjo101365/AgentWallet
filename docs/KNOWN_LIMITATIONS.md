# Known Limitations

As of the end of Phase 2 (2026-10-15).

## LLM agent
- **No real model was exercised in this environment.** No API key or local model server was available. The agent loop, tool validation, policy integration, memory and failure handling are verified with a scripted test provider, and the Anthropic wire format with an injected-fetch contract test. *How well a real model understands the example commands is unmeasured.* Set `ANTHROPIC_API_KEY` (or an OpenAI-compatible endpoint) and run the console to evaluate it; an eval set is the next step.
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
- **Not deployed on Base Sepolia.** Needs explicit approval and testnet ETH.
- **Fee-on-transfer and rebasing tokens** are not accounted for.
- **The indexer rewinds 12 blocks** on a reorg; deeper reorgs are not handled.

## Environment
- **Memory:** the dev machine had about 0.6 GB free RAM. Under that pressure a backend process once failed to start (V8 "out of memory: Zone" while compiling PGlite WASM). On constrained hosts use PostgreSQL via `DATABASE_URL`.
- **Not browser-tested:** frontend pages were checked by component tests and production build only, not with MetaMask in a browser (dev servers could not be started from this session).
- **Docker** images and compose are written but unbuilt; Docker is not installed. The RL image now installs PyTorch CPU to load checkpoints.
- **No dependency vulnerability scan** (`npm audit`, `pip-audit`) has been run.
