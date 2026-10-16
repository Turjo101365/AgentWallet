# Frozen AgentWallet v1

`AgentWalletV1.sol` is a byte-identical copy of the contract source deployed on Ethereum Sepolia at
`0x8A44716Efabb6Ce401291B91D4427149CaF956a6` (the 11-transaction public run of 2026-10-16). It is
kept outside `contracts/src`, so the v2 build does not compile it, and it is kept unedited so its
compiler metadata still matches the deployed bytecode (solc 0.8.24, optimizer 200 runs, EVM cancun).

`shared/abi/AgentWallet.v1.json` holds its ABI, creation bytecode and runtime bytecode. The runtime
bytecode was compared against `eth_getCode` on Sepolia on 2026-10-17 and is identical (8,727 bytes).
The v1 evidence verifiers in `submission/tools/` and the backend's legacy-compatibility tests use it.

In v1, `executeTransfer` is callable by the agent key alone: the owner's EIP-712 approval and task
grants are checked by the backend only. v2 (`contracts/src/AgentWallet.sol`) checks them on-chain.
