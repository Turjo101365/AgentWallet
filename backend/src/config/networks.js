/**
 * The only chains this service will talk to. Anything else (including every mainnet) is refused.
 */
export const NETWORKS = Object.freeze({
  31337: Object.freeze({
    chainId: 31337,
    key: 'localhost',
    name: 'Hardhat Local',
    isPublic: false,
    defaultRpcUrl: 'http://127.0.0.1:8545',
    explorerBaseUrl: null,
    defaultConfirmations: 1,
    nativeSymbol: 'ETH',
  }),
  84532: Object.freeze({
    chainId: 84532,
    key: 'base_sepolia',
    name: 'Base Sepolia',
    isPublic: true,
    defaultRpcUrl: 'https://sepolia.base.org',
    explorerBaseUrl: 'https://sepolia.basescan.org',
    defaultConfirmations: 2,
    nativeSymbol: 'ETH',
  }),
});

export function getNetwork(chainId) {
  const network = NETWORKS[Number(chainId)];
  if (!network) {
    throw new Error(`Unsupported chain id ${chainId}. Allowed: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return network;
}

export function explorerTxUrl(network, txHash) {
  return network.explorerBaseUrl && txHash ? `${network.explorerBaseUrl}/tx/${txHash}` : null;
}

export function explorerAddressUrl(network, address) {
  return network.explorerBaseUrl && address ? `${network.explorerBaseUrl}/address/${address}` : null;
}
