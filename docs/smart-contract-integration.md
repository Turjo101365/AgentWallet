# Smart Contract Integration & Deployment Guide

## 1. Smart Contract Architecture (`AgentWallet.sol`)

The `AgentWallet.sol` smart contract provides non-custodial, programmable spending limits on EVM networks. It is backwards-compatible with Remix IDE prototypes and can be compiled and deployed via Remix or Hardhat.

### Key State Variables
- `owner`: Deployer / treasury multisig with permission to modify limits, authorize agents, pause, or execute emergency withdrawals.
- `authorizedAgent`: Address authorized to call `executePayment`. This can be a dedicated backend relayer, an operator key, or the user's operational wallet.
- `perTransactionLimit`: Hard ceiling on any single transfer (default `0.01 ether`).
- `dailySpendingLimit`: Hard ceiling on cumulative spending across a 24-hour UTC window (default `0.05 ether`).
- `paused`: Emergency circuit breaker boolean flag.
- `dailySpent[uint256 day]`: Cumulative ETH spent on calendar day `block.timestamp / 1 days`.

---

## 2. Security Assertions in `executePayment`

```solidity
function executePayment(
    address payable recipient,
    uint256 amount
) external onlyAgent whenNotPaused {
    require(recipient != address(0), "Invalid recipient");
    require(recipient != address(this), "Invalid recipient");
    require(amount > 0, "Amount must be positive");
    require(amount <= perTransactionLimit, "Per-transaction limit exceeded");
    require(address(this).balance >= amount, "Insufficient wallet balance");

    uint256 today = block.timestamp / 1 days;
    require(
        dailySpent[today] + amount <= dailySpendingLimit,
        "Daily spending limit exceeded"
    );

    // Checks-Effects-Interactions: record spend BEFORE external call
    dailySpent[today] += amount;

    (bool success, ) = recipient.call{value: amount}("");
    require(success, "Payment failed");

    emit PaymentExecuted(msg.sender, recipient, amount, today);
}
```

---

## 3. Remix IDE Deployment Workflow

To deploy `AgentWallet.sol` using Remix IDE and MetaMask:

1. Open [Remix IDE](https://remix.ethereum.org/).
2. Create a new file in contracts: `AgentWallet.sol`.
3. Paste the contents of `contracts/src/AgentWallet.sol`.
4. In the **Solidity Compiler** tab:
   - Select compiler version `0.8.24` or higher.
   - Enable optimization (200 runs).
   - Click **Compile AgentWallet.sol**.
5. In the **Deploy & Run Transactions** tab:
   - Under **Environment**, choose **Injected Provider - MetaMask**.
   - Ensure MetaMask is connected to Base Sepolia Testnet (Chain ID 84532).
   - Verify your address is displayed under **Account**.
   - Click **Deploy** and confirm the transaction in MetaMask.
6. Once deployed:
   - Copy the deployed contract address from the **Deployed Contracts** section.
   - Copy the contract **ABI** from the Compiler tab.

---

## 4. Configuring AgentWallet with Deployed Address

Once you obtain your contract address:

1. Set the contract address in your root `.env` or `backend/.env`:
   ```bash
   AGENT_WALLET_CONTRACT_ADDRESS=0xYourDeployedContractAddressHere
   ```
2. Set the contract address in `frontend/.env`:
   ```bash
   VITE_CONTRACT_ADDRESS=0xYourDeployedContractAddressHere
   ```
3. If no contract is configured, the application explicitly reports:
   - Frontend: `Contract configuration missing`
   - Backend: Graceful fallback reporting `isConfigured: false` without throwing unhandled exceptions.
4. Fund the wallet by sending testnet ETH directly to the contract address or calling `deposit()`.
