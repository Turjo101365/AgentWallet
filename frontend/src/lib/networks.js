/** Parameters for wallet_addEthereumChain. Only the networks the backend accepts. */
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
  // Built into MetaMask; only used if a wallet reports it as unknown (4902).
  11155111: (rpcUrl) => ({
    chainId: '0xaa36a7',
    chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [rpcUrl || 'https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  }),
};

export function explorerTx(config, hash) {
  return config?.explorerBaseUrl && hash ? `${config.explorerBaseUrl}/tx/${hash}` : null;
}

export function explorerAddress(config, address) {
  return config?.explorerBaseUrl && address ? `${config.explorerBaseUrl}/address/${address}` : null;
}
