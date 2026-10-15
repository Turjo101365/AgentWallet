# PPO vs DQN: Measured Results (Execution Timing)

Both policies were trained on 2026-10-15 with `python -m app.training.train --algo {ppo,dqn}`:
- Stable-Baselines3 2.9.0, PyTorch 2.14.1+cpu, Gymnasium 1.4.0, Python 3.14.6, CPU only.
- 200 000 timesteps, seed 42.
- Configs: `rl-engine/configs/{ppo,dqn}.yaml`.

The numbers below are copied from each checkpoint's `metadata.json`. They come from **2 000
held-out test episodes** (seeds 1 000 000–1 001 999) of the **synthetic** gas process. They measure
fee savings in a simulator, not real-market performance.

| Metric | Execute immediately | Threshold 10% | **PPO** | **DQN** | Hindsight oracle |
|---|---|---|---|---|---|
| Mean fee vs window start | 1.000 | 1.035 | **0.918** | **0.930** | 0.722 |
| Mean fee saving | 0% | −3.46% | **8.20%** | **6.99%** | 27.82% |
| Fee saving 95% CI | — | [−6.52, −0.74] | **[6.16, 9.96]** | **[5.02, 8.56]** | — |
| Objective gain (fee + delay) | 0 | −0.055 | **+0.056** | **+0.050** | — |
| Mean wait (15-min steps) | 0 | 5.12 | 6.47 | 4.99 | — |
| Forced at deadline | 0% | 13.1% | 2.1% | 3.25% | — |
| Episodes worse than immediate | 0% | 19.3% | 17.2% | 19.05% | — |
| Regret vs oracle | 0.278 | 0.313 | 0.196 | 0.208 | 0 |

| | PPO | DQN |
|---|---|---|
| Model version | `ppo-timing-bf448d29024c-s42-t200000` | `dqn-timing-926aa6612f69-s42-t200000` |
| Training time | 188 s | 342 s |
| Checkpoint size | 148 KB | 104 KB |

## Reading the results

- Both learned policies beat executing immediately on held-out episodes, and the confidence intervals exclude zero.
- PPO is somewhat better than DQN on this task, but the CIs overlap; with one seed each this is not a robust ranking.
- A naive threshold rule is *worse* than doing nothing (it waits into spikes and gets forced at the deadline). The task is not trivial.
- About 17–19% of individual episodes still cost more than executing immediately: the policy pays off on average, not every time.
- The oracle shows large remaining headroom (28%). That gap is the cost of not knowing the future.
- Tests check the policies' behaviour on real environment states, not hand-picked states. Neither is a simple "cheap → execute" rule; for example, DQN executes more often in the highest-priced quartile of first-step states, conditioning on momentum and volatility.

## What these numbers do not show

- **Real-chain performance:** no real fee data was used. On a local Hardhat chain the PPO model output WAIT with probability 0.99998 on smoothly decaying fees, an input unlike its training data. The deterministic deadline then forced execution (E2E evidence in TEST_RESULTS.md). Calibrating on recorded Base Sepolia fees is open work.
- **Seed variance:** one training seed per algorithm.
- **Any claim about returns:** the only quantity optimized is the network fee paid for an already-authorized payment.

## Reproduce

```bash
cd rl-engine
.venv/Scripts/python -m pip install -r requirements-train.txt --extra-index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m app.training.train --algo ppo
.venv/Scripts/python -m app.training.train --algo dqn
```

Training writes `models/<algo>/best_model.zip` and `metadata.json`. The model version encodes the
config hash, seed and timesteps. Changing any hyperparameter changes the version.
