"""Read-only Base L2 base-fee replay. No keys, signing, or send methods.

python -m app.evaluation.base_replay fetch --output experiments/base-fees.json
python -m app.evaluation.base_replay evaluate --input experiments/base-fees.json --output experiments/base-replay.json

This measures L2 base fees only: L1 data fees, priority fees and transaction-specific
gas are excluded. Non-overlapping windows reduce, but do not remove, serial dependence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import httpx

from ..timing.features import timing_features
from ..timing.baselines import threshold_policy
from ..timing.env import GasTimingEnv


def rpc(url, method, params):
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    for attempt in range(3):
        try:
            response = httpx.post(url, json=payload, timeout=20)
            response.raise_for_status()
            result = response.json()
            if "error" in result:
                raise ValueError(str(result["error"]))
            return result["result"]
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def fetch(url, samples):
    if int(rpc(url, "eth_chainId", []), 16) != 8453:
        raise ValueError("Expected Base mainnet (8453)")
    latest = rpc(url, "eth_getBlockByNumber", ["finalized", False])
    head = int(latest["number"], 16)
    # Base has 2-second blocks; verify actual timestamps before evaluation.
    numbers = range(head - (samples - 1) * 450, head + 1, 450)
    def block(number):
        b = rpc(url, "eth_getBlockByNumber", [hex(number), False])
        return {"number": int(b["number"], 16), "hash": b["hash"],
                "timestamp": int(b["timestamp"], 16), "base_fee_wei": int(b["baseFeePerGas"], 16)}
    with ThreadPoolExecutor(max_workers=4) as pool:
        blocks = list(pool.map(block, numbers))
    return {"chain_id": 8453, "rpc_url": url, "collected_at": datetime.now(timezone.utc).isoformat(),
            "fee_component": "L2 baseFeePerGas only", "sample_seconds": 900, "blocks": blocks}


def evaluate(data, dataset_sha256):
    from ..agents.registry import registry
    blocks = data["blocks"]
    if data["chain_id"] != 8453 or len(blocks) < 64:
        raise ValueError("Need at least 64 Base samples")
    if any(b["base_fee_wei"] <= 0 for b in blocks):
        raise ValueError("Fees must be positive")
    if any(b["timestamp"] - a["timestamp"] != 900 or b["number"] <= a["number"]
           for a, b in zip(blocks, blocks[1:])):
        raise ValueError("Replay requires ordered, exactly 15-minute observations")
    unavailable = [name for name in ("PPO", "DQN") if not registry.get(name).available]
    if unavailable:
        raise ValueError(f"Unavailable trained policies: {unavailable}")
    fees = [b["base_fee_wei"] for b in blocks]
    policies = {"execute_immediately": lambda obs: 1, "threshold_10pct": threshold_policy(0.10)}
    policies.update({name.lower(): (lambda p: lambda obs: p.predict(obs)["action"])(registry.get(name))
                     for name in ("PPO", "DQN")})
    window, delay_cost = 16, 0.004
    starts = list(range(48, len(blocks) - window + 1, window))
    results = {}
    observed = []
    for name, policy in policies.items():
        costs, waits, forced, hindsight = [], [], [], []
        for start in starts:
            path = np.array(fees[start:start + window], dtype=float) / fees[start]
            hindsight.append(float(np.min(path + np.arange(window) * delay_cost)))
            for step in range(window):
                i = start + step
                hour = (blocks[i]["timestamp"] % 86400) / 3600
                obs = timing_features(fees[max(0, i - 47):i + 1], window - 1 - step, window, hour)
                if name == "execute_immediately":
                    observed.append(obs)
                action = policy(obs)
                if action == 1 or step == window - 1:
                    costs.append(float(path[step])); waits.append(step)
                    forced.append(step == window - 1 and action != 1)
                    break
        total = np.array(costs) + np.array(waits) * delay_cost
        results[name] = {"episodes": len(starts), "mean_l2_base_fee_saving_pct": float((1 - np.mean(costs)) * 100),
                         "mean_objective_gain": float(np.mean(1 - total)), "mean_wait_minutes": float(np.mean(waits) * 15),
                         "forced_at_deadline_pct": float(np.mean(forced) * 100),
                         "mean_objective_regret_vs_hindsight": float(np.mean(total - hindsight)),
                         "episode_fee_ratios": costs, "episode_wait_steps": waits}
    env = GasTimingEnv()
    synthetic = np.array([env.reset(seed=3_000_000 + i)[0] for i in range(1000)])
    real = np.array(observed)
    lo, hi = np.quantile(synthetic[:, :4], [0.01, 0.99], axis=0)
    shift = {"features": ["long_ema_ratio_log", "short_ema_ratio_log", "recent_min_ratio_log", "volatility"],
             "synthetic_p01": lo.tolist(), "synthetic_p99": hi.tolist(),
             "real_means": real[:, :4].mean(axis=0).tolist(),
             "fraction_outside_synthetic_p01_p99": ((real[:, :4] < lo) | (real[:, :4] > hi)).mean(axis=0).tolist()}
    return {"dataset_sha256": dataset_sha256, "chain_id": 8453,
            "from_timestamp": blocks[0]["timestamp"], "to_timestamp": blocks[-1]["timestamp"],
            "samples": len(blocks), "window_steps": window, "delay_cost": delay_cost,
            "models": {n: {"version": registry.get(n).version, "checkpoint_sha256": registry.get(n).metadata.get("checkpoint_sha256")} for n in ("PPO", "DQN")},
            "results": results, "distribution_shift": shift,
            "limitations": ["L2 base fees only; excludes L1 data fees, priority fees and gas usage",
                            "Small contiguous observational sample; no causal or total transaction savings claim",
                            "Action probabilities are policy preferences, not calibrated savings probabilities",
                            "No live transaction execution; policies remain advisory and opt-in"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["fetch", "evaluate"])
    parser.add_argument("--rpc", default="https://mainnet.base.org")
    parser.add_argument("--samples", type=int, default=256)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.mode == "fetch":
        if not 64 <= args.samples <= 10000:
            parser.error("samples must be between 64 and 10000")
        result = fetch(args.rpc, args.samples)
    else:
        if args.input is None:
            parser.error("evaluate requires --input")
        raw = args.input.read_bytes()
        result = evaluate(json.loads(raw), hashlib.sha256(raw).hexdigest())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
