"""
Synthetic gas-price process used for training and evaluation.

This is a *model* of fee dynamics, not market data:
    log g_t = mu + daily(t) + x_t + s_t
    x_t     = x_{t-1} * (1 - theta) + sigma * N(0, 1)        mean-reverting noise (Ornstein-Uhlenbeck)
    s_t     = s_{t-1} * spike_decay + J_t                     congestion spikes, J_t ~ Bernoulli(p) * Exp(scale)
    daily   = amplitude * sin(2*pi*hour/24 + phase)           diurnal cycle

Units are arbitrary (the agent only sees ratios), so a policy trained here is scale-free and can
be applied to chains whose absolute fees differ by orders of magnitude (Base Sepolia vs Hardhat).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List

import numpy as np


@dataclass(frozen=True)
class GasProcessConfig:
    step_minutes: int = 15
    theta: float = 0.08
    sigma: float = 0.12
    daily_amplitude: float = 0.35
    spike_probability: float = 0.03
    spike_scale: float = 0.8
    spike_decay: float = 0.75
    warmup_steps: int = 32


@dataclass
class GasProcess:
    config: GasProcessConfig
    rng: np.random.Generator
    hour0: float = 0.0
    phase: float = 0.0
    _x: float = 0.0
    _s: float = 0.0
    _t: int = 0
    history: List[float] = field(default_factory=list)

    @classmethod
    def create(cls, config: GasProcessConfig, rng: np.random.Generator) -> "GasProcess":
        proc = cls(config=config, rng=rng, hour0=float(rng.uniform(0, 24)), phase=float(rng.uniform(-0.6, 0.6)))
        for _ in range(config.warmup_steps):
            proc.step()
        return proc

    def hour_of_day(self, t: int | None = None) -> float:
        t = self._t if t is None else t
        return (self.hour0 + t * self.config.step_minutes / 60.0) % 24.0

    def step(self) -> float:
        c = self.config
        self._x = self._x * (1.0 - c.theta) + c.sigma * float(self.rng.standard_normal())
        jump = float(self.rng.exponential(c.spike_scale)) if self.rng.random() < c.spike_probability else 0.0
        self._s = self._s * c.spike_decay + jump
        daily = c.daily_amplitude * math.sin(2.0 * math.pi * self.hour_of_day() / 24.0 + self.phase)
        price = math.exp(daily + self._x + self._s)
        self.history.append(price)
        self._t += 1
        return price
