// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02} from "../AgentWallet.sol";
// Local adversarial fixture only; not a deployed DEX or price source.
contract MockSwapRouter02 is ISwapRouter02 {
    uint256 public output = 200;
    bool public skipPayment;
    struct QuoteParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }
    function quoteExactInputSingle(QuoteParams calldata) external view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate) {
        return (output, 0, 0, 100000);
    }
    function configure(uint256 amount, bool skip) external { output = amount; skipPayment = skip; }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        if (!skipPayment) IERC20(p.tokenOut).transfer(p.recipient, output);
        return output;
    }
}
