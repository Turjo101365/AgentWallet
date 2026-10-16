// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AgentWallet (v2)
 * @notice Treasury wallet that lets a limited-authority agent key move funds only to
 *         owner-approved recipients, only in owner-enabled assets, only within per-transaction
 *         and per-day caps, and only with the owner's EIP-712 signature for that transfer or a
 *         bounded task grant. The owner keeps full custody.
 *
 * Roles
 *  - owner: full custody. Manages the agent, recipients, token policies, pause, withdrawals.
 *           Signs transfer approvals and task grants off-chain (EIP-712; EOA or ERC-1271).
 *           Two-step transfer (Ownable2Step); renouncing is disabled.
 *  - agent: may only call executeApprovedTransfer() / executeGrantTransfer(), each of which
 *           verifies the current owner's signature on-chain. Must never be the owner.
 *           Revocable at any time.
 *
 * v1 (deployed on Ethereum Sepolia at 0x8A44716Efabb6Ce401291B91D4427149CaF956a6, frozen in
 * contracts/legacy/) let the agent call executeTransfer() with no signature; the owner's approval
 * was checked by the backend only. v2 removes that function. The EIP-712 domains and types are
 * unchanged from what the v1 backend already asked owners to sign.
 *
 * Signed authorizations
 *  - ApproveTransfer: one transfer; executable once (intent id) and only until its signed deadline.
 *  - AuthorizeTask:   up to maxRuns transfers and/or maxTotal (0 = that bound unused, but at least
 *                     one must be set) of exactly amountPerRun to one recipient until validUntil.
 *                     The schedule (scheduleHash, executionWindowSeconds) is enforced off-chain;
 *                     on-chain the agent can at most use the grant's remaining runs and total early.
 *  - Signatures are checked against owner() at execution time, so changing the owner voids every
 *    outstanding approval and grant. The owner can revoke one grant (revokeGrant) or one approved
 *    intent (cancelIntent) without stopping the agent.
 *
 * Accounting
 *  - Assets are keyed by token address; address(0) is native ETH.
 *  - Daily caps use UTC calendar days (block.timestamp / 1 days), not a rolling 24h window.
 *    Up to 2x the daily cap can therefore move within 24h across a day boundary.
 *  - Every transfer carries an off-chain intent id; each id can execute at most once.
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

    /// @notice Interface version, so off-chain code can tell v2 from the frozen v1 (which has no such getter).
    uint256 public constant VERSION = 2;

    /// @notice One owner-approved transfer, exactly as signed (EIP-712 "ApproveTransfer").
    struct TransferApproval {
        string proposalId;
        bytes32 intentId;
        address token;
        address recipient;
        uint256 amount;
        uint256 deadline;
    }

    /// @notice A bounded autonomous payment mandate, exactly as signed (EIP-712 "AuthorizeTask").
    struct TaskGrant {
        string taskId;
        address token;
        address recipient;
        uint256 amountPerRun;
        uint256 maxRuns;
        uint256 maxTotal;
        uint256 validUntil;
        bytes32 scheduleHash;
        uint256 executionWindowSeconds;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant APPROVAL_DOMAIN_NAME = keccak256("AgentWallet Operator Approval");
    bytes32 private constant GRANT_DOMAIN_NAME = keccak256("AgentWallet Task Authorization");
    bytes32 private constant DOMAIN_VERSION = keccak256("1");
    bytes32 public constant APPROVE_TRANSFER_TYPEHASH = keccak256(
        "ApproveTransfer(string proposalId,bytes32 intentId,address token,address recipient,uint256 amount,uint256 deadline)"
    );
    bytes32 public constant AUTHORIZE_TASK_TYPEHASH = keccak256(
        "AuthorizeTask(string taskId,address token,address recipient,uint256 amountPerRun,uint256 maxRuns,uint256 maxTotal,uint256 validUntil,bytes32 scheduleHash,uint256 executionWindowSeconds)"
    );

    mapping(bytes32 grantDigest => uint256 runs) public grantRuns;
    mapping(bytes32 grantDigest => uint256 amount) public grantSpent;
    mapping(bytes32 grantDigest => bool revoked) public grantRevoked;
    mapping(bytes32 intentId => bool cancelled) public cancelledIntents;

    event GrantRunExecuted(bytes32 indexed grantDigest, bytes32 indexed intentId, uint256 runs, uint256 spent);
    event GrantRevoked(bytes32 indexed grantDigest);
    event IntentCancelled(bytes32 indexed intentId);

    error ApprovalExpired(uint256 deadline);
    error InvalidOwnerSignature();
    error GrantExpired(uint256 validUntil);
    error GrantIsRevoked(bytes32 grantDigest);
    error GrantExhausted(bytes32 grantDigest);
    error UnboundedGrant();
    error IntentIsCancelled(bytes32 intentId);
    /// @notice Raised by simulateTransfer when the full transfer, including the send, would succeed.
    error SimulationSucceeded();

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
     * @notice Executes one transfer the owner approved with an EIP-712 "ApproveTransfer" signature.
     * @dev The signature is verified against the CURRENT owner() (EOA or ERC-1271), the signed deadline
     *      is binding, and the intent id makes it single-use. All v1 limits still apply.
     */
    function executeApprovedTransfer(TransferApproval calldata a, bytes calldata ownerSignature)
        external
        onlyAgent
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > a.deadline) revert ApprovalExpired(a.deadline);
        if (!SignatureChecker.isValidSignatureNow(owner(), approvalDigest(a), ownerSignature)) revert InvalidOwnerSignature();
        _executeTransfer(a.intentId, a.token, a.recipient, a.amount);
    }

    /**
     * @notice Executes one run of an owner-signed task grant ("AuthorizeTask").
     * @dev Run count and total are tracked per grant digest on-chain, so a compromised agent can never
     *      exceed what the owner signed. `intentId` is chosen off-chain per run and is single-use.
     */
    function executeGrantTransfer(TaskGrant calldata g, bytes calldata ownerSignature, bytes32 intentId)
        external
        onlyAgent
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > g.validUntil) revert GrantExpired(g.validUntil);
        if (g.maxRuns == 0 && g.maxTotal == 0) revert UnboundedGrant();
        bytes32 digest = grantDigest(g);
        if (grantRevoked[digest]) revert GrantIsRevoked(digest);
        if (!SignatureChecker.isValidSignatureNow(owner(), digest, ownerSignature)) revert InvalidOwnerSignature();

        uint256 runs = grantRuns[digest] + 1;
        uint256 spent = grantSpent[digest] + g.amountPerRun;
        if ((g.maxRuns != 0 && runs > g.maxRuns) || (g.maxTotal != 0 && spent > g.maxTotal)) revert GrantExhausted(digest);
        grantRuns[digest] = runs;
        grantSpent[digest] = spent;

        _executeTransfer(intentId, g.token, g.recipient, g.amountPerRun);
        emit GrantRunExecuted(digest, intentId, runs, spent);
    }

    /**
     * @notice Full pre-signature simulation for the agent: runs every check AND the actual ETH/token send,
     *         then always reverts, so no state or funds can ever change. It reverts with SimulationSucceeded()
     *         if the transfer would succeed, otherwise with the real error (e.g. NativeTransferFailed for a
     *         recipient contract that rejects ETH). Use with eth_call only.
     */
    function simulateTransfer(bytes32 intentId, address token, address recipient, uint256 amount) external {
        _simulateTransfer(intentId, token, recipient, amount);
        revert SimulationSucceeded();
    }

    /// @dev Same modifiers as the real entry points, so the simulation sees the same agent, pause and re-entrancy rules.
    function _simulateTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
        private
        onlyAgent
        whenNotPaused
        nonReentrant
    {
        _executeTransfer(intentId, token, recipient, amount);
    }

    /**
     * @notice Dry run of the transfer limits for the agent (call with from = agent). Reverts with the same
     *      errors as execution but checks no signature; used to simulate a proposal before it is signed.
     */
    function checkTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
        external
        view
        onlyAgent
        whenNotPaused
    {
        _checkTransfer(intentId, token, recipient, amount);
    }

    // ---------------------------------------------------------------------
    // Owner administration
    // ---------------------------------------------------------------------

    /// @notice Revokes one signed task grant on-chain; its remaining runs can never execute.
    function revokeGrant(bytes32 grantDigest_) external onlyOwner {
        grantRevoked[grantDigest_] = true;
        emit GrantRevoked(grantDigest_);
    }

    /// @notice Cancels one not-yet-executed intent, voiding an owner approval signed for it.
    function cancelIntent(bytes32 intentId) external onlyOwner {
        if (intentId == bytes32(0)) revert ZeroIntent();
        if (executedIntents[intentId]) revert IntentAlreadyExecuted(intentId);
        cancelledIntents[intentId] = true;
        emit IntentCancelled(intentId);
    }

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

    /// @notice EIP-712 digest of a transfer approval (domain "AgentWallet Operator Approval", version "1").
    function approvalDigest(TransferApproval calldata a) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(APPROVE_TRANSFER_TYPEHASH, keccak256(bytes(a.proposalId)), a.intentId, a.token, a.recipient, a.amount, a.deadline)
        );
        return MessageHashUtils.toTypedDataHash(_domainSeparator(APPROVAL_DOMAIN_NAME), structHash);
    }

    /// @notice EIP-712 digest of a task grant (domain "AgentWallet Task Authorization", version "1").
    function grantDigest(TaskGrant calldata g) public view returns (bytes32) {
        // Encoded in two halves to stay within the legacy code generator's stack limit. Every member is a
        // static 32-byte word, so the concatenation equals abi.encode of the whole struct.
        bytes memory head = abi.encode(AUTHORIZE_TASK_TYPEHASH, keccak256(bytes(g.taskId)), g.token, g.recipient, g.amountPerRun);
        bytes memory tail = abi.encode(g.maxRuns, g.maxTotal, g.validUntil, g.scheduleHash, g.executionWindowSeconds);
        return MessageHashUtils.toTypedDataHash(_domainSeparator(GRANT_DOMAIN_NAME), keccak256(bytes.concat(head, tail)));
    }

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

    /// @dev Computed per call from block.chainid and address(this), so it stays correct on a fork.
    function _domainSeparator(bytes32 nameHash) private view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, nameHash, DOMAIN_VERSION, block.chainid, address(this)));
    }

    /// @dev The v1 executeTransfer checks, unchanged in order, plus owner-cancelled intents.
    function _checkTransfer(bytes32 intentId, address token, address recipient, uint256 amount)
        private
        view
        returns (uint256 day, uint256 spent)
    {
        if (intentId == bytes32(0)) revert ZeroIntent();
        if (executedIntents[intentId]) revert IntentAlreadyExecuted(intentId);
        if (cancelledIntents[intentId]) revert IntentIsCancelled(intentId);
        if (!isRecipientAllowed[recipient]) revert RecipientNotAllowed(recipient);

        TokenPolicy memory policy = _tokenPolicies[token];
        if (!policy.enabled) revert TokenNotEnabled(token);
        if (amount == 0) revert InvalidAmount();
        if (amount > policy.perTxLimit) revert PerTxLimitExceeded(amount, policy.perTxLimit);

        day = currentDay();
        spent = spentPerDay[token][day];
        if (spent + amount > policy.dailyLimit) {
            revert DailyLimitExceeded(amount, spent >= policy.dailyLimit ? 0 : policy.dailyLimit - spent);
        }

        uint256 available = _balanceOf(token);
        if (available < amount) revert InsufficientBalance(amount, available);
    }

    /// @dev Checks-effects-interactions: the intent is consumed and the cap charged before the external call.
    function _executeTransfer(bytes32 intentId, address token, address recipient, uint256 amount) private {
        (uint256 day, uint256 spent) = _checkTransfer(intentId, token, recipient, amount);
        executedIntents[intentId] = true;
        uint256 spentToday = spent + amount;
        spentPerDay[token][day] = spentToday;

        _send(token, recipient, amount);
        emit TransferExecuted(intentId, token, recipient, amount, day, spentToday);
    }

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
