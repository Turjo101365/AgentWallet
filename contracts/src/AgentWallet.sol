// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentWallet
 * @notice Controlled, agent-authorized autonomous wallet with deterministic
 * spending limits, daily budget ceilings, and emergency freeze controls.
 * @dev Compliant with Remix IDE and Hardhat deployment workflows.
 */
contract AgentWallet {
    address public owner;
    address public authorizedAgent;

    uint256 public perTransactionLimit = 0.01 ether;
    uint256 public dailySpendingLimit = 0.05 ether;

    bool public paused;

    // Mapping from calendar day index (block.timestamp / 1 days) to cumulative spent Wei
    mapping(uint256 => uint256) public dailySpent;

    event Deposited(address indexed from, uint256 amount);
    event PaymentExecuted(
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        uint256 indexed day
    );
    event AgentUpdated(address indexed newAgent);
    event LimitsUpdated(uint256 perTransaction, uint256 daily);
    event PauseUpdated(bool isPaused);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentWallet: caller is not the owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == authorizedAgent, "AgentWallet: caller is not the authorized agent");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "AgentWallet: wallet is currently paused");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedAgent = msg.sender;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Deposit funds into the AgentWallet treasury
     */
    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "AgentWallet: deposit must be positive");
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Execute an agent-authorized payment subject to per-tx and daily limits
     * @param recipient Target address to receive funds
     * @param amount Amount in Wei to transfer
     */
    function executePayment(
        address payable recipient,
        uint256 amount
    ) external onlyAgent whenNotPaused {
        require(recipient != address(0), "AgentWallet: invalid recipient");
        require(recipient != address(this), "AgentWallet: self-transfer disallowed");
        require(amount > 0, "AgentWallet: payment amount must be positive");
        require(amount <= perTransactionLimit, "AgentWallet: per-transaction limit exceeded");
        require(address(this).balance >= amount, "AgentWallet: insufficient wallet balance");

        uint256 today = block.timestamp / 1 days;
        require(
            dailySpent[today] + amount <= dailySpendingLimit,
            "AgentWallet: daily spending limit exceeded"
        );

        // Record spending before making external call (Checks-Effects-Interactions)
        dailySpent[today] += amount;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "AgentWallet: external payment execution failed");

        emit PaymentExecuted(msg.sender, recipient, amount, today);
    }

    /**
     * @notice Update the authorized agent address
     * @param newAgent New agent address
     */
    function setAuthorizedAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "AgentWallet: invalid agent address");
        authorizedAgent = newAgent;
        emit AgentUpdated(newAgent);
    }

    /**
     * @notice Update spending limits
     * @param newPerTransactionLimit Single transaction ceiling in Wei
     * @param newDailyLimit Cumulative daily ceiling in Wei
     */
    function setSpendingLimits(
        uint256 newPerTransactionLimit,
        uint256 newDailyLimit
    ) external onlyOwner {
        require(newPerTransactionLimit > 0, "AgentWallet: invalid per-transaction limit");
        require(newDailyLimit >= newPerTransactionLimit, "AgentWallet: daily limit must be >= per-tx limit");

        perTransactionLimit = newPerTransactionLimit;
        dailySpendingLimit = newDailyLimit;

        emit LimitsUpdated(newPerTransactionLimit, newDailyLimit);
    }

    /**
     * @notice Toggle emergency pause
     * @param status True to pause, false to unpause
     */
    function setPaused(bool status) external onlyOwner {
        paused = status;
        emit PauseUpdated(status);
    }

    /**
     * @notice Emergency withdrawal of funds to specified recipient by owner while paused
     * @param recipient Cold wallet or safe to receive funds
     * @param amount Amount in Wei to withdraw
     */
    function emergencyWithdraw(
        address payable recipient,
        uint256 amount
    ) external onlyOwner {
        require(paused, "AgentWallet: pause wallet before emergency withdrawal");
        require(recipient != address(0), "AgentWallet: invalid recipient");
        require(amount > 0 && amount <= address(this).balance, "AgentWallet: invalid withdrawal amount");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "AgentWallet: emergency withdrawal failed");

        emit EmergencyWithdrawal(recipient, amount);
    }

    /**
     * @notice Get current native balance held in contract
     */
    function walletBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
