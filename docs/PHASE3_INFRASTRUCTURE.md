# Phase 3 infrastructure and RL evidence — 2026-10-15

## Verified locally

- RL suite: **25 tests passed**, including genuine PPO/DQN inference, corruption/hash rejection, replay validation, and deterministic replay on constant fees.
- The existing trained checkpoints load successfully. Metadata now records each checkpoint's SHA-256; the registry checks it before deserializing. Training writes this field for new models. Legacy metadata without a hash remains loadable for compatibility; image packaging requires hashes.
- `scripts/package_models.py` produced a distributable archive containing both checkpoints, metadata, and a hash manifest. It rejects missing or mismatched files. Only accept checkpoint archives from a trusted source: SB3 files contain serialized Python objects; hashes provide integrity relative to trusted metadata, not authenticity by themselves.
- Read-only Base mainnet JSON-RPC collection succeeded. No signing or transaction submission is implemented in the collector.

## Container changes and outstanding execution gate

Docker and PostgreSQL executables are absent from PATH and standard Windows installation directories on this machine. Container builds, persistent PostgreSQL migration execution, container restart recovery and measured container memory usage **have not been verified**.

The RL Docker image now copies models into the image and verifies packaging during build. The compose bind mount was removed so a host directory cannot silently override the packaged checkpoints. Missing checkpoints now fail the image build with an explicit error; distribute the model archive or train both algorithms before building. Existing checkpoints are deliberately ignored by Git.

Docker ignore files exclude local virtual environments, dependencies, secrets, caches and generated files from build contexts. Inference uses `torch.inference_mode()` so score extraction does not construct autograd graphs. The RL image sets OMP, MKL and OpenBLAS thread counts to one to reduce CPU oversubscription. These are concrete mitigations; there is no measured claim that all memory pressure is resolved. Backend tests already run sequentially.

Run these commands after Docker is available, from the repository root:

```powershell
node rl-engine/scripts/python.js scripts/package_models.py --output experiments/agentwallet-models.zip
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
docker compose logs --no-color postgres deployer rl-engine backend
docker compose exec postgres psql -U agentwallet -d agentwallet -c 'SELECT version FROM schema_migrations ORDER BY version;'
docker compose restart backend rl-engine postgres
docker compose ps
docker compose exec postgres psql -U agentwallet -d agentwallet -c 'SELECT version FROM schema_migrations ORDER BY version;'
```

Use configured DB user/name if different. Before restart, create a local wallet session, proposal and automation through the app; verify their records and behavior after restart. Confirm migrations are applied once and retained, rollback on a deliberately failing migration in a disposable database, and executor reconciliation of an in-flight local payment. These steps remain an execution gate, not passing evidence.

The Hardhat chain is ephemeral. Restarting it discards chain state while PostgreSQL persists; a normal backend/PostgreSQL restart must leave the chain running. A full local chain reset requires fresh deployment and deliberate database reconciliation. Do not claim chain-reset recovery is verified or automatically delete the database to hide the discrepancy.

## Real Base replay

Dataset: `rl-engine/evidence/base-fees-2026-10-15.json`.

Result: `rl-engine/evidence/base-replay-2026-10-15.json`.

Dataset SHA-256: `5be48ace158c3e733653febed5d57fb49c0a2770ef93e54ab12ae77a8efaba9c`.

The dataset contains 256 finalized Base block samples from **2026-10-12 20:33:39 UTC through 2026-10-15 12:18:39 UTC**, spaced exactly 900 seconds apart. Block numbers, hashes, timestamps and base fees are retained. The replay verifies chain ID, positive fees, ordered block numbers and uniform timestamps. It uses 48 historical observations followed by thirteen non-overlapping, 16-step windows, with delay cost 0.004 per step. All policies see the same windows and only past/current observations. Hindsight is used only as an evaluation bound.

| Policy | Mean L2 base-fee saving vs immediate | Mean wait | Mean objective gain |
|---|---:|---:|---:|
| Immediate | 0.000% | 0.0 min | 0.00000 |
| Threshold 10% | 3.169% | 201.9 min | -0.02216 |
| PPO | 3.345% | 92.3 min | 0.00884 |
| DQN | 3.285% | 72.7 min | 0.01347 |

These are a **small observational replay**, not production savings. Most windows have flat base fees; one declining-fee window dominates average savings. L1 data fees, priority fees, gas consumption, slippage and transaction execution are excluded. No statistical significance or profitability is claimed. Thirteen temporally adjacent episodes cannot establish generalization.

Distribution shift is substantial: **84.6%** of window-start volatility observations fall outside the 1st–99th percentile interval of 1,000 reproducible synthetic initial observations. Thus the existing synthetic benchmarks do not establish calibration on Base. PPO action probabilities are policy preferences, and DQN Q values are reward estimates; neither is a calibrated probability of savings. Keep RL advisory and opt-in. Longer chronological holdouts covering congestion regimes and transaction-specific total fees are needed before operational claims.

Reproduce the existing report without network access:

```powershell
node rl-engine/scripts/python.js -m app.evaluation.base_replay evaluate --input evidence/base-fees-2026-10-15.json --output experiments/base-replay-reproduced.json
node rl-engine/scripts/python.js -m unittest discover -s tests -v
```

Collect a new read-only dataset (a different time range produces different results):

```powershell
node rl-engine/scripts/python.js -m app.evaluation.base_replay fetch --samples 256 --output experiments/base-fees-new.json
```

Checkpoint hashes:

- PPO: `f3290973274227843a78c368ac11cb06a249ece72803827b50d78f178af235d1`
- DQN: `41555168e021b4f38f7e7db59715eb385328edfd4db0542a836464d01c115157`

Verified host versions: Python 3.14, torch 2.14.1+cpu, stable-baselines3 2.9.0, numpy 2.5.4, gymnasium 1.4.0. Container requirements still use compatible ranges and Python 3.12; Linux/Python 3.12 checkpoint compatibility must be established by the blocked Docker run before calling that image validated. API dependency version drift and a FastAPI/httpx deprecation warning remain follow-up items.
