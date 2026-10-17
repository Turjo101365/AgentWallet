# AgentWallet.sol

> **Two versions.** This page describes **v2**, the current source. **v1** is the version deployed on Ethereum Sepolia
> (`0x8A44…956a6`). Its source is frozen in [contracts/legacy/AgentWalletV1.sol](../contracts/legacy/AgentWalletV1.sol),
> and its ABI and bytecode in [shared/abi/AgentWallet.v1.json](../shared/abi/AgentWallet.v1.json). v1's only agent entry
> point is `executeTransfer(intentId, token, recipient, amount)`, with no signature. v2's complete public run is on
> Ethereum Sepolia at `0x3C9389E704331B8a12381F9ab5A68a7F3F59582F` (12/12 SUCCESS); an earlier partial run (`0x23bA…4458`) is
> safe-stopped. See [V2_PUBLIC_RUNS.md](V2_PUBLIC_RUNS.md).
> Comparison: [CONTRACT_V2.md](CONTRACT_V2.md).

Source: [contracts/src/AgentWallet.sol](../contracts/src/AgentWallet.sol)
- Solidity 0.8.24, evmVersion cancun, optimizer 200 runs
- OpenZeppelin 5.6.1: Ownable2Step, Pausable, ReentrancyGuard, SafeERC20, SignatureChecker (EOA + ERC-1271), MessageHashUtils
- Not upgradeable (deliberate)

## Roles
- **owner**: custodian. Two-step transfer; `renounceOwnership` reverts.
- **agent**: may only call `executeApprovedTransfer` and `executeGrantTransfer`, each carrying an owner signature the contract verifies. It may also call the `simulateTransfer` and `checkTransfer` dry runs, which cannot move funds. It can never equal the owner or the pending owner, and it cannot accept ownership.

## Agent entry points (v2)

```solidity
function executeApprovedTransfer(TransferApproval calldata a, bytes calldata ownerSignature)
    external onlyAgent whenNotPaused nonReentrant
function executeGrantTransfer(TaskGrant calldata g, bytes calldata ownerSignature, bytes32 intentId)
    external onlyAgent whenNotPaused nonReentrant
function simulateTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
    external   // agent only; runs every check AND the real send, then ALWAYS reverts:
               // SimulationSucceeded() = would succeed, otherwise the real error. Cannot move funds.
function checkTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
    external view onlyAgent whenNotPaused   // limits only, no send; used for the pre-signature gas estimate
```

**`executeApprovedTransfer`** reverts unless:
- `block.timestamp <= a.deadline` (`ApprovalExpired`);
- `ownerSignature` is the current `owner()`'s EIP-712 signature over `a`: domain "AgentWallet Operator Approval", v1, this chain and this contract, type `ApproveTransfer` (`InvalidOwnerSignature`).

**`executeGrantTransfer`** reverts unless:
- `block.timestamp <= g.validUntil` (`GrantExpired`);
- at least one of `maxRuns`/`maxTotal` is non-zero (`UnboundedGrant`);
- the grant digest is not revoked (`GrantIsRevoked`);
- the signature is `owner()`'s over `g`: domain "AgentWallet Task Authorization", type `AuthorizeTask` (`InvalidOwnerSignature`);
- the grant's on-chain `grantRuns`/`grantSpent` stay within `maxRuns`/`maxTotal` (`GrantExhausted`).

It emits `GrantRunExecuted(grantDigest, intentId, runs, spent)`.

Both then apply the v1 transfer checks below, unchanged. `token == address(0)` means native ETH. The call reverts with a custom error unless all of these hold:
- `intentId` is non-zero, has not been executed and was not cancelled by the owner (`IntentIsCancelled`);
- `isRecipientAllowed[recipient]`;
- `tokenPolicy(token).enabled`;
- `0 < amount <= perTxLimit`;
- `spentPerDay[token][today] + amount <= dailyLimit` (UTC day = `block.timestamp / 1 days`);
- the balance is sufficient.

State (`executedIntents`, `spentPerDay`) is written before the external transfer. It emits
`TransferExecuted(intentId, token, recipient, amount, day, spentToday)`.

## Owner functions
| Function | Notes |
|---|---|
| `setAgent(address)` / `revokeAgent()` | Agent must be non-zero and not the owner or pending owner |
| `setRecipient(address, bool)` | Rejects zero and the wallet itself |
| `setTokenPolicy(token, enabled, perTx, daily)` | ERC-20 must be a contract; enabled requires `perTx > 0`, `daily >= perTx` |
| `pause()` / `unpause()` | Blocks `executeTransfer` only; deposits and owner withdrawals still work |
| `emergencyStop()` | Pause + revoke agent in one transaction |
| `withdraw(token, to, amount)` | Owner withdrawal at any time |
| `emergencyWithdraw(token, to, amount)` | Only while paused |
| `revokeGrant(bytes32 grantDigest)` (v2) | The grant can never execute again |
| `cancelIntent(bytes32 intentId)` (v2) | Voids a signed, not-yet-executed approval |

**Views:**
- `tokenPolicy`, `remainingDailyAllowance`, `currentDay`, `walletBalance`, `tokenBalance`, `isRecipientAllowed`, `executedIntents`, `spentPerDay`.
- v2 adds `VERSION` (= 2), `approvalDigest`, `grantDigest`, `grantRuns`, `grantSpent`, `grantRevoked` and `cancelledIntents`.

## Custom errors
`NotAgent`, `InvalidAddress`, `AgentCannotBeOwner`, `RenounceDisabled`, `RecipientNotAllowed`,
`TokenNotEnabled`, `InvalidAmount`, `InvalidLimits`, `InvalidToken`, `ZeroIntent`,
`IntentAlreadyExecuted`, `PerTxLimitExceeded`, `DailyLimitExceeded`, `InsufficientBalance`,
`NativeTransferFailed`. v2 adds `ApprovalExpired`, `InvalidOwnerSignature`, `GrantExpired`, `GrantIsRevoked`, `GrantExhausted`,
`UnboundedGrant`, `IntentIsCancelled` and `SimulationSucceeded` (raised only by the always-reverting `simulateTransfer`). All of these come with OpenZeppelin's `OwnableUnauthorizedAccount`, `EnforcedPause`,
`ExpectedPause`, `SafeERC20FailedOperation`.

The backend decodes these errors from simulation failures and shows them in the UI.

## Deployment

**Local** (chain 31337):

```bash
npm run chain          # terminal 1: Hardhat node
npm run deploy:local   # writes contracts/deployments/localhost.json
```

The local deploy:
- uses Hardhat accounts #0 owner, #1 agent;
- allowlists #2/#3;
- deploys the test-only `MockERC20` "mUSDC" (6 decimals);
- funds the wallet with 5 ETH and 10,000 mUSDC;
- sets ETH caps of 0.01/0.05 and mUSDC caps of 100/250.

**Base Sepolia** (84532): requires explicit approval. Set these in `contracts/.env`:
- `DEPLOYER_PRIVATE_KEY`
- `OWNER_ADDRESS`
- `AGENT_ADDRESS` (must differ from the owner)
- optionally `NATIVE_PER_TX_ETH` / `NATIVE_DAILY_ETH`
- `CONFIRM_PUBLIC_DEPLOY=yes`

Then run `cd contracts && npm run deploy:base_sepolia`. Without `CONFIRM_PUBLIC_DEPLOY=yes` the script refuses.

After compiling, `npm run export-abi` refreshes [shared/abi/AgentWallet.json](../shared/abi/AgentWallet.json), which the backend loads. It never touches `AgentWallet.v1.json`. The backend detects the deployed version via `VERSION()` and uses the v1 ABI for a v1 deployment.

## Tests
`cd contracts && npx hardhat test`. `AgentWallet.test.js` and `AgentWallet.swap.test.js` are the original suites; every agent transfer in them now carries an owner signature. `AgentWallet.v2.test.js` covers:
- a compromised agent key;
- forged and substituted fields;
- cross-chain and cross-contract replay;
- expired, cancelled, exhausted, unbounded and revoked authorizations;
- ownership changes;
- an ERC-1271 owner;
- digest equality with the backend's typed data.
The test-only contracts in `src/mocks/` (mock token, misbehaving tokens, reentrant agent, reverting
recipient) must never be deployed to a public network as real assets.
