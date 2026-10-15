/** Parameters for wallet_addEthereumChain. Only the two networks the backend accepts. */
export const WALLET_CHAIN_PARAMS = {
  31337: (rpcUrl) => ({
    chainId: '0x7a69',
    chainName: 'Hardhat Local',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [rpcUrl || 'http://127.0.0.1:8545'],
  }),
  84532: (rpcUrl) => ({
    chainId: '0x14a34',
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [rpcUrl || 'https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  }),
};

export function explorerTx(config, hash) {
  return config?.explorerBaseUrl && hash ? `${config.explorerBaseUrl}/tx/${hash}` : null;
}

export function explorerAddress(config, address) {
  return config?.explorerBaseUrl && address ? `${config.explorerBaseUrl}/address/${address}` : null;
}
