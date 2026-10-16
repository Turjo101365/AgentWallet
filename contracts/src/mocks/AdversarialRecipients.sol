// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test-only recipient that rejects all native transfers.
contract RevertingRecipient {
    receive() external payable {
        revert("no thanks");
    }
}

/**
 * @notice Test-only contract acting as BOTH agent and recipient. It sends a pre-built agent call
 *         (e.g. executeApprovedTransfer with a valid owner signature); on receiving ETH it tries a second
 *         pre-built call (a fresh, validly signed transfer) and records whether that re-entry was blocked.
 */
contract ReentrantAgent {
    address public immutable wallet;
    bytes private reentryCall;
    bool public reentryAttempted;
    bool public reentryBlocked;

    constructor(address wallet_) {
        wallet = wallet_;
    }

    function run(bytes calldata firstCall, bytes calldata secondCall) external {
        reentryCall = secondCall;
        (bool ok, bytes memory ret) = wallet.call(firstCall);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        if (reentryAttempted) return;
        reentryAttempted = true;
        (bool ok,) = wallet.call(reentryCall);
        reentryBlocked = !ok;
    }
}
