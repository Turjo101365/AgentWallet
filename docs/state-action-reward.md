# State, Action, and Reward Function Design

## 1. State Representation ($S_t$)

The state space provides the agent with an accurate snapshot of both internal wallet constraints and external EVM network dynamics.

```
State Vector s_t = [
    s[0]: Normalized Native Balance (ETH)
    s[1]: Daily Spending Ratio (Spent / Daily Limit)
    s[2]: Remaining Spending Headroom
    s[3]: Normalized Gas Base Fee (Gwei / 50.0)
    s[4]: Mempool Congestion Factor [0.0 - 1.0]
    s[5]: Observed Pool Spread / Slippage (bps / 100.0)
    s[6]: Diurnal Gas Cycle Factor [-1.0, 1.0]
    s[7]: Contract Operational Status (1.0 = Active, 0.0 = Paused)
]
```

### Observation Normalization
Raw values are clipped and scaled to avoid exploding gradients:
- `balance_eth`: Scaled relative to standard reserve target (e.g., 2.0 ETH).
- `gas_price_gwei`: Clipped at 100 Gwei, normalized by dividing by 50 Gwei.
- `slippage_bps`: Clipped between 0 and 200 bps, normalized by dividing by 100.

---

## 2. Action Space ($A$)

The action space is discrete, consisting of 4 distinct choices:

| Action Index | Label | Execution Behavior | Parameter Bounds |
|---|---|---|---|
| `0` | `HOLD` | Defer action to next observation epoch. No calldata created. | N/A |
| `1` | `MICRO_PAYMENT` | Execute sub-limit payment or top-up. | Amount: 0.005 ETH |
| `2` | `STANDARD_REBALANCE` | Standard operational transfer / rebalance. | Amount: 0.010 ETH (contract limit) |
| `3` | `DEFENSIVE_STABILIZE` | Hold assets; signal pause due to abnormal gas or volatility. | Amount: 0.0 ETH |

---

## 3. Reward Function Formulation ($R(s, a, s')$)

The composite reward balances operational efficiency, gas frugality, and strict adherence to safety limits:

$$R(s, a, s') = R_{\text{utility}}(a) + R_{\text{gas}}(s, a) + R_{\text{slippage}}(s, a) + R_{\text{safety}}(s, a)$$

### Component 1: Operational Utility ($R_{\text{utility}}$)
Rewards the agent for fulfilling necessary liquidity disbursements:
- If action is `MICRO_PAYMENT` and liquidity was required: $+1.5$
- If action is `STANDARD_REBALANCE` and liquidity was required: $+3.0$
- If action is `HOLD` when market is hostile (gas $> 35$ Gwei): $+0.5$ (Reward for patience)

### Component 2: Gas Penalty ($R_{\text{gas}}$)
Penalizes conducting operations during elevated base fees:

$$R_{\text{gas}} = -w_{\text{gas}} \cdot \left(\frac{\text{BaseFeeGwei}}{10}\right)^{1.5}$$

where $w_{\text{gas}} = 0.4$. If the agent executes a transfer during 45 Gwei gas, it incurs a substantial penalty.

### Component 3: Slippage / Spread Penalty ($R_{\text{slippage}}$)
Penalizes trading or transferring into thin liquidity pools:

$$R_{\text{slippage}} = -w_{\text{slip}} \cdot \frac{\text{SlippageSpreadBps}}{20}$$

where $w_{\text{slip}} = 0.3$.

### Component 4: Safety Violation Penalty ($R_{\text{safety}}$)
If the agent selects an action that would violate contract limits:
- Exceeding daily spending limit: $-10.0$ penalty
- Exceeding single tx limit: $-10.0$ penalty
- Attempting transaction while contract is paused: $-15.0$ penalty

This strong negative feedback trains the policy to steer clear of boundary conditions even before the deterministic validator intervenes.

---

## 4. Episode Dynamics & Termination

- **Episode Length:** 100 timesteps per training episode (simulating 100 sequential blocks or market intervals).
- **Early Termination:**
  - Balance drops below minimum required reserve ($0.05$ ETH).
  - Agent triggers 3 severe limit violations in a single episode.
- **Success Criteria:** Completing the episode with healthy treasury reserves and maximized net operational utility.
