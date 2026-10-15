# PPO vs DQN Architecture & Comparative Analysis

## 1. Algorithmic Overview

AgentWallet supports two foundational Reinforcement Learning paradigms to evaluate algorithmic decision-making in autonomous treasury management:

| Dimension | Proximal Policy Optimization (PPO) | Deep Q-Network (DQN) |
|---|---|---|
| **Class** | Policy-gradient, Actor-Critic | Value-based, Q-learning |
| **Policy Type** | Stochastic (outputs probability distribution $\pi(a\|s)$) | Deterministic via argmax ($\arg\max_a Q(s, a)$) |
| **Exploration** | Entropy bonus in objective function | $\epsilon$-greedy decaying schedule |
| **Data Efficiency** | On-policy (requires fresh rollout buffer) | Off-policy (Experience Replay Buffer) |
| **Network Architecture** | Dual-headed / Twin networks: Actor $\pi_\theta$ + Critic $V_\phi$ | Single Q-Network $Q_\theta$ + Target Network $Q_{\theta^-}$ |
| **Objective Function** | Clipped surrogate objective $L^{CLIP}(\theta)$ | Bellman Mean Squared Error loss against $Q_{\theta^-}$ |
| **Best Suited For** | Smooth continuous probability distribution over decisions | Discrete value estimation with high sample reuse |

---

## 2. Mathematical Formulations

### Proximal Policy Optimization (PPO)
PPO stabilizes policy updates by constraining the policy probability ratio $r_t(\theta) = \frac{\pi_\theta(a_t | s_t)}{\pi_{\theta_{old}}(a_t | s_t)}$:

$$L^{CLIP}(\theta) = \hat{\mathbb{E}}_t \left[ \min\left(r_t(\theta)\hat{A}_t, \, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon)\hat{A}_t\right) \right]$$

where $\hat{A}_t$ is the Generalized Advantage Estimator (GAE) computed using the Critic network $V_\phi(s)$.

### Deep Q-Network (DQN)
DQN minimizes the temporal difference error between predicted action values and the Bellman target:

$$L(\theta) = \mathbb{E}_{(s, a, r, s')} \left[ \left( r + \gamma \max_{a'} Q_{\theta^-}(s', a') - Q_\theta(s, a) \right)^2 \right]$$

The target network weights $\theta^-$ are updated periodically every $C$ steps or via Polyak averaging:

$$\theta^- \leftarrow \tau \theta + (1 - \tau)\theta^-$$

---

## 3. Shared Environment & Discrete Action Space

To ensure an unbiased and reproducible comparison, both agents operate in an identical Gymnasium environment with identical action and observation spaces.

### Shared Action Space
The action space consists of 4 discrete actions:

```python
ACTION_HOLD = 0                 # Do nothing; observe next block
ACTION_MICRO_PAYMENT = 1        # Issue sub-limit payment (0.005 ETH)
ACTION_STANDARD_REBALANCE = 2   # Issue standard liquidity payment (0.010 ETH)
ACTION_DEFENSIVE_STABILIZE = 3  # Signal defensive pause / low-risk hold
```

### Shared Observation Vector (8 Dimensions)
Every state $s_t \in \mathbb{R}^8$ is normalized within $[0, 1]$ or $[-1, 1]$:
1. `norm_balance`: Current native balance normalized by initial treasury cap.
2. `norm_daily_spent`: Cumulative ETH spent today normalized by `dailySpendingLimit`.
3. `daily_limit_headroom`: Remaining spending allowance ratio $(1 - \text{daily\_spent}/\text{limit})$.
4. `norm_base_fee`: Gas base fee normalized by peak gas threshold (50 Gwei).
5. `mempool_congestion`: Relative ratio of pending high-priority transactions.
6. `slippage_spread_bps`: Normalized liquidity pool spread in basis points.
7. `time_of_day_phase`: Cyclical feature $\sin(2\pi \cdot t / 86400)$ for circadian gas patterns.
8. `contract_status`: Binary flag ($1.0 = \text{Active}, 0.0 = \text{Paused}$).

---

## 4. Comparative Evaluation Metrics

In `evaluation/compare_agents.py`, both trained checkpoints are evaluated against an identical 500-step test scenario:

- **Mean Cumulative Reward:** Total reward accumulated over treasury lifecycle.
- **Gas Efficiency Ratio:** Realized treasury output divided by total gas fees consumed.
- **Safety Violation Rate:** Percentage of actions proposing illegal transactions (caught by safety validator).
- **Execution Latency:** Average forward-pass inference time in milliseconds.
- **Decision Entropy / Confidence:** Shannon entropy for PPO vs Q-value margin for DQN.
