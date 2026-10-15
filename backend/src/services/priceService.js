import { ethers } from 'ethers';

const AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
];

/**
 * USD prices from explicitly configured Chainlink AggregatorV3-compatible feeds (deployment record
 * `priceFeeds`). Every price carries its source, feed address, round time and a staleness flag.
 * Tokens without a feed have no price; nothing is estimated or defaulted.
 */
export function createPriceService({ config, chain }) {
  const feeds = new Map(config.priceFeeds.map((f) => [f.token.toLowerCase(), f]));

  async function priceOf(tokenAddress, blockTag = 'latest') {
    const feed = feeds.get(tokenAddress.toLowerCase());
    if (!feed) return { available: false, reason: 'no price feed configured' };
    try {
      const c = new ethers.Contract(feed.feed, AGGREGATOR_ABI, chain.provider);
      const [round, decimals, description, block] = await Promise.all([
        c.latestRoundData({ blockTag }),
        c.decimals({ blockTag }),
        c.description({ blockTag }),
        chain.provider.getBlock(blockTag),
      ]);
      const answer = BigInt(round.answer);
      if (answer <= 0n) return { available: false, reason: 'feed returned a non-positive price', source: feed.source };
      const updatedAt = Number(round.updatedAt);
      const age = Number(block.timestamp) - updatedAt;
      return {
        available: true,
        priceUsd: ethers.formatUnits(answer, decimals),
        answer: answer.toString(),
        feedDecimals: Number(decimals),
        description,
        source: feed.source,
        feed: feed.feed,
        updatedAt,
        ageSeconds: age,
        stale: age > config.priceMaxAgeSeconds,
      };
    } catch (err) {
      return { available: false, reason: `feed read failed: ${err.shortMessage || err.message}`, source: feed.source };
    }
  }

  async function prices(blockTag = 'latest') {
    const out = {};
    await Promise.all(config.tokens.map(async (t) => (out[t.address] = await priceOf(t.address, blockTag))));
    return out;
  }

  /** USD value of `units` of a token as a decimal string with 2 dp, or null if no usable price. */
  function valueUsd(units, token, price) {
    if (!price?.available || price.stale) return null;
    // value = units / 10^decimals * answer / 10^feedDecimals, computed in integers (cents).
    const cents = (BigInt(units) * BigInt(price.answer) * 100n) / 10n ** BigInt(token.decimals + price.feedDecimals);
    return (Number(cents) / 100).toFixed(2);
  }

  return { priceOf, prices, valueUsd, hasFeeds: feeds.size > 0 };
}
