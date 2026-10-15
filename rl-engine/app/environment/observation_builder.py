"""
Observation builder that extracts or synthesizes wallet telemetry.
"""
import time
from typing import Dict, Any, Optional

class ObservationBuilder:
    def __init__(self, chain_id: int = 84532):
        self.chain_id = chain_id

    def build_observation(
        self,
        wallet_address: str,
        native_balance_wei: str = "1000000000000000000",
        native_balance_eth: float = 1.0,
        daily_spent_eth: float = 0.0,
        daily_limit_eth: float = 0.05,
        per_tx_limit_eth: float = 0.01,
        base_fee_gwei: float = 15.0,
        mempool_congestion: float = 0.25,
        slippage_spread_bps: float = 15.0,
        is_contract_paused: bool = False,
        block_number: int = 6842109,
        timestamp: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Constructs standardized observation payload adhering to wallet-state schema.
        """
        ts = timestamp if timestamp is not None else int(time.time())
        return {
            "chainId": self.chain_id,
            "blockNumber": block_number,
            "walletAddress": wallet_address,
            "nativeBalanceWei": str(native_balance_wei),
            "nativeBalanceEth": float(native_balance_eth),
            "dailySpentEth": float(daily_spent_eth),
            "dailyLimitEth": float(daily_limit_eth),
            "perTxLimitEth": float(per_tx_limit_eth),
            "baseFeeGwei": float(base_fee_gwei),
            "mempoolCongestion": float(mempool_congestion),
            "slippageSpreadBps": float(slippage_spread_bps),
            "isContractPaused": bool(is_contract_paused),
            "timestamp": ts,
        }
