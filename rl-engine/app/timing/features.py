"""
Observation features for the execution-timing policy.

The SAME function is used in training (synthetic gas) and in serving (gas samples the backend
recorded from the real chain), so there is no train/serve skew in feature computation.
All price features are ratios, which makes them independent of the chain's absolute fee level.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np

OBSERVATION_DIM = 8
SHORT_SPAN = 4
LONG_SPAN = 24
VOL_WINDOW = 8
MIN_WINDOW = 8


def _ema(values: Sequence[float], span: int) -> float:
    alpha = 2.0 / (span + 1.0)
    ema = values[0]
    for v in values[1:]:
        ema = alpha * v + (1 - alpha) * ema
    return ema


def timing_features(gas_history: Sequence[float], steps_remaining: int, window_steps: int, hour_of_day: float) -> np.ndarray:
    """
    gas_history     recent gas prices, oldest first, at a fixed sampling interval; last item = now
    steps_remaining decision points left before the deadline (0 = must execute now)
    window_steps    total length of the execution window in steps
    hour_of_day     UTC hour in [0, 24)
    """
    if len(gas_history) == 0:
        raise ValueError("gas_history must contain at least one sample")
    if any((not math.isfinite(g)) or g <= 0 for g in gas_history):
        raise ValueError("gas prices must be positive finite numbers")
    hist = [float(g) for g in gas_history[-max(LONG_SPAN * 2, VOL_WINDOW + 1):]]
    now = hist[-1]
    ema_short = _ema(hist, SHORT_SPAN)
    ema_long = _ema(hist, LONG_SPAN)
    logs = np.log(np.array(hist[-(VOL_WINDOW + 1):]))
    vol = float(np.std(np.diff(logs))) if len(logs) > 1 else 0.0
    recent_min = min(hist[-MIN_WINDOW:])
    remaining = max(0, int(steps_remaining)) / max(1, int(window_steps))
    angle = 2.0 * math.pi * (hour_of_day % 24.0) / 24.0

    vec = np.array(
        [
            math.log(now / ema_long),        # 0 current vs long-run level (negative = cheap)
            math.log(now / ema_short),       # 1 short-term momentum
            math.log(now / recent_min),      # 2 distance above the recent minimum
            vol,                             # 3 recent volatility of log price
            remaining,                       # 4 fraction of window left
            math.sin(angle),                 # 5 time of day
            math.cos(angle),                 # 6
            1.0 if steps_remaining <= 0 else 0.0,  # 7 deadline flag
        ],
        dtype=np.float32,
    )
    return np.clip(vec, -5.0, 5.0)
