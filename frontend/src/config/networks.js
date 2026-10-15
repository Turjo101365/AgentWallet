export const NETWORKS = {
  84532: {
    chainId: 84532,
    name: 'Base Sepolia Testnet',
    shortName: 'Base Sepolia',
    currency: 'ETH',
    rpcUrl: import.meta.env.VITE_RPC_URL || 'https://sepolia.base.org',
    explorerUrl: import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://sepolia.basescan.org',
    isTestnet: true,
  },
};

export const DEFAULT_CHAIN_ID = 84532;
