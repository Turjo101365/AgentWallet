# AgentWallet.sol

Source: [contracts/src/AgentWallet.sol](../contracts/src/AgentWallet.sol)
- Solidity 0.8.24, evmVersion cancun, optimizer 200 runs
- OpenZeppelin 5.6.1: Ownable2Step, Pausable, ReentrancyGuard, SafeERC20
- Not upgradeable (deliberate)

## Roles
- **owner**: custodian. Two-step transfer; `renounceOwnership` reverts.
- **agent**: may only call `executeTransfer`. It can never equal the owner or the pending owner, and it cannot accept ownership.

## Agent entry point

```solidity
function executeTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
    external onlyAgent whenNotPaused nonReentrant
```

`token == address(0)` means native ETH. The call reverts with a custom error unless all of these hold:
- `intentId` is non-zero and has not been executed before;
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

**Views:** `tokenPolicy`, `remainingDailyAllowance`, `currentDay`, `walletBalance`, `tokenBalance`, `isRecipientAllowed`, `executedIntents`, `spentPerDay`.

## Custom errors
`NotAgent`, `InvalidAddress`, `AgentCannotBeOwner`, `RenounceDisabled`, `RecipientNotAllowed`,
`TokenNotEnabled`, `InvalidAmount`, `InvalidLimits`, `InvalidToken`, `ZeroIntent`,
`IntentAlreadyExecuted`, `PerTxLimitExceeded`, `DailyLimitExceeded`, `InsufficientBalance`,
`NativeTransferFailed`, plus OpenZeppelin's `OwnableUnauthorizedAccount`, `EnforcedPause`,
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

After compiling, `npm run export-abi` refreshes [shared/abi/AgentWallet.json](../shared/abi/AgentWallet.json), which the backend loads.

## Tests
`cd contracts && npx hardhat test`: 30 tests (see [TEST_RESULTS.md](TEST_RESULTS.md)).
The test-only contracts in `src/mocks/` (mock token, misbehaving tokens, reentrant agent, reverting
recipient) must never be deployed to a public network as real assets.
