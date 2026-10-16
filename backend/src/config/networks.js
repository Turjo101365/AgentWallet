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
    defaultLogBlockRange: 2000,
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
    // https://sepolia.base.org rejects larger ranges: "eth_getLogs is limited to a 200 range".
    defaultLogBlockRange: 200,
    nativeSymbol: 'ETH',
  }),
  11155111: Object.freeze({
    chainId: 11155111,
    key: 'sepolia',
    name: 'Ethereum Sepolia',
    isPublic: true,
    defaultRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerBaseUrl: 'https://sepolia.etherscan.io',
    defaultConfirmations: 2,
    // publicnode accepted 10,000-block eth_getLogs ranges on 2026-10-16; 2000 leaves margin.
    defaultLogBlockRange: 2000,
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
