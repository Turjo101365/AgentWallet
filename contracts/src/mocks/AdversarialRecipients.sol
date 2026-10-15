// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IAgentWallet {
    function executeTransfer(bytes32 intentId, address token, address recipient, uint256 amount) external;
}

/// @notice Test-only recipient that rejects all native transfers.
contract RevertingRecipient {
    receive() external payable {
        revert("no thanks");
    }
}

/**
 * @notice Test-only contract acting as BOTH agent and recipient. On receiving ETH it tries to
 *         re-enter executeTransfer with a fresh intent id and records whether that was blocked.
 */
contract ReentrantAgent {
    IAgentWallet public immutable wallet;
    bool public reentryAttempted;
    bool public reentryBlocked;

    constructor(address wallet_) {
        wallet = IAgentWallet(wallet_);
    }

    function run(bytes32 intentId, uint256 amount) external {
        wallet.executeTransfer(intentId, address(0), address(this), amount);
    }

    receive() external payable {
        if (reentryAttempted) return;
        reentryAttempted = true;
        try wallet.executeTransfer(keccak256("reentry"), address(0), address(this), msg.value) {
            reentryBlocked = false;
        } catch {
            reentryBlocked = true;
        }
    }
}
