/**
 * Amount of a token that is committed off-chain (approved or in flight) but not yet reflected in the
 * contract's spentPerDay at `blockTag`. An intent the chain already shows as executed is counted by
 * the contract itself, so it is excluded here to avoid double counting.
 */
export async function reservedWei({ repos, chain }, tokenAddress, excludeId, blockTag) {
  const committed = await repos.proposals.listCommitted(tokenAddress, excludeId, blockTag);
  let total = 0n;
  for (const c of committed) {
    if (await chain.contract.executedIntents(c.intentId, { blockTag })) continue;
    total += c.amountWei;
  }
  return total;
}
