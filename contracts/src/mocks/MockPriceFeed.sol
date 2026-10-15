// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @notice Test-only Chainlink AggregatorV3-compatible price feed for the LOCAL chain.
 *         Prices are synthetic and set by whoever deploys it. Never use as a real oracle.
 */
contract MockPriceFeed {
    uint8 public immutable decimals;
    string public description;
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(uint8 decimals_, string memory description_, int256 answer_) {
        decimals = decimals_;
        description = description_;
        _set(answer_);
    }

    function setAnswer(int256 answer_) external {
        _set(answer_);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function _set(int256 answer_) private {
        _answer = answer_;
        _updatedAt = block.timestamp;
        _roundId += 1;
    }
}
