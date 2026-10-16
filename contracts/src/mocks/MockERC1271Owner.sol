// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @notice Test-only smart-contract owner (e.g. a Safe-like wallet). It validates signatures per ERC-1271
 *         by checking they come from its single controller key, and forwards owner calls for that key.
 */
contract MockERC1271Owner {
    bytes4 private constant MAGIC = 0x1626ba7e;
    address public immutable controller;
    bool public rejectAll;

    constructor(address controller_) {
        controller = controller_;
    }

    function setRejectAll(bool v) external {
        require(msg.sender == controller, "not controller");
        rejectAll = v;
    }

    function forward(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == controller, "not controller");
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (rejectAll) return 0xffffffff;
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        return err == ECDSA.RecoverError.NoError && signer == controller ? MAGIC : bytes4(0xffffffff);
    }
}
