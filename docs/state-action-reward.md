# RL Task Definition: Gas-Aware Execution Timing

Phase 2 replaced the earlier 4-action "treasury" MDP. That MDP rewarded spending money: +3.0 for a
0.01 ETH transfer to a fixed address. The RL component now has one narrow advisory job, and
cannot affect who is paid or how much.

## Decision

A payment is already authorized: owner-signed grant, recipient, amount. It must settle within an
execution window of W decision steps (15 minutes each in training). At each step the policy
chooses:

| Action | Meaning |
|---|---|
| 0 `WAIT` | Defer one step |
| 1 `EXECUTE` | Submit now |

At the last step execution is **forced**. In production the scheduler enforces the deadline itself;
the model can only defer inside the window.

## Observation (8 features, `rl-engine/app/timing/features.py`)

| # | Feature | Definition |
|---|---|---|
| 0 | level | `log(gas_now / EMA_24(gas))`; negative = cheaper than usual |
| 1 | momentum | `log(gas_now / EMA_4(gas))` |
| 2 | distance from recent low | `log(gas_now / min(last 8))` |
| 3 | volatility | std of log returns over the last 8 steps |
| 4 | time left | `steps_remaining / window_steps` |
| 5–6 | time of day | `sin`, `cos` of the UTC hour |
| 7 | deadline flag | 1 when `steps_remaining = 0` |

All price features are **ratios**, so the policy is independent of the absolute fee level. The same
function is used in training and serving, so there is no feature skew.

## Reward

```
on EXECUTE (or forced at deadline):  r = -(gas_at_execution / gas_at_window_start)
on each WAIT:                         r = -delay_cost        (0.004 by default)
```

- Executing immediately always scores exactly −1.0.
- The policy gains only by executing when the fee is lower than at the window start, by more than the delay cost it accumulates.
- Every episode settles exactly one payment, so there is no incentive to spend.

## Data

The gas price is **synthetic** (`rl-engine/app/timing/gas_process.py`):

```
log g_t = daily(t) + x_t + s_t
x_t = (1 - θ) x_{t-1} + σ ε_t           mean-reverting noise   (θ = 0.08, σ = 0.12)
s_t = 0.75 s_{t-1} + Bernoulli(0.03)·Exp(0.8)   congestion spikes
daily(t) = 0.35 · sin(2π hour/24 + φ)
```

It is a modelling assumption, not market data. Real fee dynamics differ: L2 base fees on Base
Sepolia, or a Hardhat node whose base fee decays toward zero with no load. See
KNOWN_LIMITATIONS.md.

## Evaluation protocol

- **Seed sets:** training seeds are drawn by SB3 from the training seed; validation seeds start at 500 000 (checkpoint selection); test seeds start at 1 000 000 (reported numbers only).
- **Paired comparison:** every policy runs on the same episodes, so comparisons are paired.
- **Baselines:** execute immediately (what the system does without a model), a 10%-below-average threshold rule, and a hindsight **oracle** (uses future prices; a lower bound, not a policy).
- **Reported metrics:** fee saving vs immediate (mean and 95% bootstrap CI), objective gain including delay, mean wait, deadline-forced rate, share of episodes worse than immediate, and regret vs the oracle.

Results: [ppo-vs-dqn.md](ppo-vs-dqn.md).
