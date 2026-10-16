// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AgentWallet
 * @notice Treasury wallet that lets a limited-authority agent key move funds only to
 *         owner-approved recipients, only in owner-enabled assets, and only within
 *         per-transaction and per-day caps. The owner keeps full custody.
 *
 * Roles
 *  - owner: full custody. Manages the agent, recipients, token policies, pause, withdrawals.
 *           Two-step transfer (Ownable2Step); renouncing is disabled.
 *  - agent: may only call executeTransfer(). Must never be the owner. Revocable at any time.
 *
 * Accounting
 *  - Assets are keyed by token address; address(0) is native ETH.
 *  - Daily caps use UTC calendar days (block.timestamp / 1 days), not a rolling 24h window.
 *    Up to 2x the daily cap can therefore move within 24h across a day boundary.
 *  - Every executeTransfer carries an off-chain intent id; each id can execute at most once.
 *
 * Not upgradeable by design: a proxy would add an admin key able to replace the limit logic,
 * which defeats the purpose of on-chain limits. Migrations are done by redeploying.
 */
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

contract AgentWallet is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant NATIVE_TOKEN = address(0);

    struct TokenPolicy {
        bool enabled;
        uint128 perTxLimit;
        uint128 dailyLimit;
    }

    struct SwapParams {
        address router;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint256 deadline;
    }
    mapping(address router => bool allowed) public isSwapRouterAllowed;
    event SwapRouterUpdated(address indexed router, bool allowed);
    event SwapExecuted(bytes32 indexed intentId, address indexed tokenIn, address indexed tokenOut, address router, uint256 amountIn, uint256 amountOut);
    error SwapNotAllowed();
    error SwapExpired();
    error InvalidSwapOutput();

    address public agent;
    mapping(address recipient => bool allowed) public isRecipientAllowed;
    mapping(address token => mapping(uint256 day => uint256 amount)) public spentPerDay;
    mapping(bytes32 intentId => bool executed) public executedIntents;
    mapping(address token => TokenPolicy) private _tokenPolicies;

    event AgentUpdated(address indexed previousAgent, address indexed newAgent);
    event RecipientUpdated(address indexed recipient, bool allowed);
    event TokenPolicyUpdated(address indexed token, bool enabled, uint256 perTxLimit, uint256 dailyLimit);
    event Deposited(address indexed from, uint256 amount);
    event TransferExecuted(
        bytes32 indexed intentId,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        uint256 day,
        uint256 spentToday
    );
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount);
    event EmergencyStop(address indexed revokedAgent);

    error NotAgent(address caller);
    error InvalidAddress();
    error AgentCannotBeOwner();
    error RenounceDisabled();
    error RecipientNotAllowed(address recipient);
    error TokenNotEnabled(address token);
    error InvalidAmount();
    error InvalidLimits();
    error InvalidToken(address token);
    error ZeroIntent();
    error IntentAlreadyExecuted(bytes32 intentId);
    error PerTxLimitExceeded(uint256 amount, uint256 limit);
    error DailyLimitExceeded(uint256 amount, uint256 remaining);
    error InsufficientBalance(uint256 amount, uint256 available);
    error NativeTransferFailed();

    modifier onlyAgent() {
        if (msg.sender != agent || msg.sender == address(0)) revert NotAgent(msg.sender);
        _;
    }

    /**
     * @param initialOwner   Custodian address (cold wallet / operator).
     * @param initialAgent   Limited executor key, or address(0) to start with no agent.
     * @param nativePerTx    Initial native ETH per-transaction cap in wei (0 leaves ETH disabled).
     * @param nativeDaily    Initial native ETH daily cap in wei.
     */
    constructor(address initialOwner, address initialAgent, uint128 nativePerTx, uint128 nativeDaily)
        Ownable(initialOwner)
    {
        if (initialAgent != address(0)) {
            if (initialAgent == initialOwner) revert AgentCannotBeOwner();
            agent = initialAgent;
            emit AgentUpdated(address(0), initialAgent);
        }
        if (nativePerTx > 0) {
            _setTokenPolicy(NATIVE_TOKEN, true, nativePerTx, nativeDaily);
        }
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Deposit native ETH. Deposits are accepted while paused.
    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        emit Deposited(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------
    // Agent execution
    // ---------------------------------------------------------------------

    /**
     * @notice Transfer `amount` of `token` (address(0) = ETH) to an allowlisted recipient.
     * @dev Checks-effects-interactions plus nonReentrant. The intent id is consumed before
     *      the external call, so a replayed or re-entered intent always reverts.
     */
    function executeTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
        external
        onlyAgent
        whenNotPaused
        nonReentrant
    {
        if (intentId == bytes32(0)) revert ZeroIntent();
        if (executedIntents[intentId]) revert IntentAlreadyExecuted(intentId);
        if (!isRecipientAllowed[recipient]) revert RecipientNotAllowed(recipient);

        TokenPolicy memory policy = _tokenPolicies[token];
        if (!policy.enabled) revert TokenNotEnabled(token);
        if (amount == 0) revert InvalidAmount();
        if (amount > policy.perTxLimit) revert PerTxLimitExceeded(amount, policy.perTxLimit);

        uint256 day = currentDay();
        uint256 spent = spentPerDay[token][day];
        if (spent + amount > policy.dailyLimit) {
            revert DailyLimitExceeded(amount, spent >= policy.dailyLimit ? 0 : policy.dailyLimit - spent);
        }

        uint256 available = _balanceOf(token);
        if (available < amount) revert InsufficientBalance(amount, available);

        executedIntents[intentId] = true;
        uint256 spentToday = spent + amount;
        spentPerDay[token][day] = spentToday;

        _send(token, recipient, amount);
        emit TransferExecuted(intentId, token, recipient, amount, day, spentToday);
    }

    // ---------------------------------------------------------------------
    // Owner administration
    // ---------------------------------------------------------------------

    /// @notice Only the owner can approve router authority. No router is enabled by default.
    function setSwapRouter(address router, bool allowed) external onlyOwner {
        if (router == address(this) || (allowed && router.code.length == 0)) revert InvalidAddress();
        isSwapRouterAllowed[router] = allowed;
        emit SwapRouterUpdated(router, allowed);
    }

    /// @notice Owner-approved exact-input swap. Output is always retained by this wallet.
    /// @dev Uses SwapRouter02 ABI (not the original V3 router ABI). No arbitrary calldata.
    ///      Shares transfer caps and intent namespace. Nonstandard balance-changing tokens are unsupported.
    function executeSwap(bytes32 intentId, SwapParams calldata p)
        external onlyOwner whenNotPaused nonReentrant returns (uint256 amountOut)
    {
        if (intentId == bytes32(0)) revert ZeroIntent();
        if (executedIntents[intentId]) revert IntentAlreadyExecuted(intentId);
        if (!isSwapRouterAllowed[p.router] || p.tokenIn == p.tokenOut || p.tokenIn == address(0)
            || p.tokenOut == address(0) || p.fee == 0 || p.amountOutMinimum == 0) revert SwapNotAllowed();
        if (p.deadline < block.timestamp || p.deadline > block.timestamp + 30 minutes) revert SwapExpired();
        TokenPolicy memory policy = _tokenPolicies[p.tokenIn];
        if (!policy.enabled) revert TokenNotEnabled(p.tokenIn);
        if (!_tokenPolicies[p.tokenOut].enabled) revert TokenNotEnabled(p.tokenOut);
        if (p.amountIn == 0) revert InvalidAmount();
        if (p.amountIn > policy.perTxLimit) revert PerTxLimitExceeded(p.amountIn, policy.perTxLimit);
        uint256 day = currentDay();
        uint256 spent = spentPerDay[p.tokenIn][day];
        if (spent + p.amountIn > policy.dailyLimit)
            revert DailyLimitExceeded(p.amountIn, spent >= policy.dailyLimit ? 0 : policy.dailyLimit - spent);
        uint256 beforeIn = IERC20(p.tokenIn).balanceOf(address(this));
        uint256 beforeOut = IERC20(p.tokenOut).balanceOf(address(this));
        if (beforeIn < p.amountIn) revert InsufficientBalance(p.amountIn, beforeIn);
        executedIntents[intentId] = true;
        spentPerDay[p.tokenIn][day] = spent + p.amountIn;
        IERC20(p.tokenIn).forceApprove(p.router, p.amountIn);
        ISwapRouter02(p.router).exactInputSingle(ISwapRouter02.ExactInputSingleParams({
            tokenIn: p.tokenIn, tokenOut: p.tokenOut, fee: p.fee, recipient: address(this),
            amountIn: p.amountIn, amountOutMinimum: p.amountOutMinimum, sqrtPriceLimitX96: 0
        }));
        IERC20(p.tokenIn).forceApprove(p.router, 0);
        uint256 afterOut = IERC20(p.tokenOut).balanceOf(address(this));
        if (afterOut < beforeOut || IERC20(p.tokenIn).balanceOf(address(this)) != beforeIn - p.amountIn)
            revert InvalidSwapOutput();
        amountOut = afterOut - beforeOut;
        if (amountOut < p.amountOutMinimum) revert InvalidSwapOutput();
        emit SwapExecuted(intentId, p.tokenIn, p.tokenOut, p.router, p.amountIn, amountOut);
    }

    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert InvalidAddress();
        if (newAgent == owner() || newAgent == pendingOwner()) revert AgentCannotBeOwner();
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    function revokeAgent() external onlyOwner {
        emit AgentUpdated(agent, address(0));
        agent = address(0);
    }

    function setRecipient(address recipient, bool allowed) external onlyOwner {
        if (recipient == address(0) || recipient == address(this)) revert InvalidAddress();
        isRecipientAllowed[recipient] = allowed;
        emit RecipientUpdated(recipient, allowed);
    }

    function setTokenPolicy(address token, bool enabled, uint128 perTxLimit, uint128 dailyLimit) external onlyOwner {
        _setTokenPolicy(token, enabled, perTxLimit, dailyLimit);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Kill switch: pause execution and revoke the agent in one transaction.
    function emergencyStop() external onlyOwner {
        address revoked = agent;
        agent = address(0);
        if (!paused()) _pause();
        emit AgentUpdated(revoked, address(0));
        emit EmergencyStop(revoked);
    }

    /// @notice Owner withdrawal; not subject to agent limits and allowed while paused.
    function withdraw(address token, address payable to, uint256 amount) external onlyOwner nonReentrant {
        _ownerSend(token, to, amount);
        emit Withdrawn(token, to, amount);
    }

    /// @notice Withdrawal path that is only available while paused (incident response).
    function emergencyWithdraw(address token, address payable to, uint256 amount)
        external
        onlyOwner
        whenPaused
        nonReentrant
    {
        _ownerSend(token, to, amount);
        emit EmergencyWithdrawal(token, to, amount);
    }

    /// @dev The agent must never become owner, so it cannot accept a pending transfer.
    function acceptOwnership() public override {
        if (msg.sender == agent) revert AgentCannotBeOwner();
        super.acceptOwnership();
    }

    /// @dev Renouncing would strand funds with no custodian.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function tokenPolicy(address token) external view returns (TokenPolicy memory) {
        return _tokenPolicies[token];
    }

    function remainingDailyAllowance(address token) external view returns (uint256) {
        TokenPolicy memory policy = _tokenPolicies[token];
        if (!policy.enabled) return 0;
        uint256 spent = spentPerDay[token][currentDay()];
        return spent >= policy.dailyLimit ? 0 : policy.dailyLimit - spent;
    }

    function walletBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function tokenBalance(address token) external view returns (uint256) {
        return _balanceOf(token);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _setTokenPolicy(address token, bool enabled, uint128 perTxLimit, uint128 dailyLimit) internal {
        if (token != NATIVE_TOKEN && (token == address(this) || token.code.length == 0)) revert InvalidToken(token);
        if (enabled && (perTxLimit == 0 || dailyLimit < perTxLimit)) revert InvalidLimits();
        _tokenPolicies[token] = TokenPolicy({enabled: enabled, perTxLimit: perTxLimit, dailyLimit: dailyLimit});
        emit TokenPolicyUpdated(token, enabled, perTxLimit, dailyLimit);
    }

    function _ownerSend(address token, address payable to, uint256 amount) internal {
        if (to == address(0) || to == address(this)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 available = _balanceOf(token);
        if (available < amount) revert InsufficientBalance(amount, available);
        _send(token, to, amount);
    }

    function _send(address token, address to, uint256 amount) internal {
        if (token == NATIVE_TOKEN) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _balanceOf(address token) internal view returns (uint256) {
        return token == NATIVE_TOKEN ? address(this).balance : IERC20(token).balanceOf(address(this));
    }
}
