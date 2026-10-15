import { ethers } from 'ethers';
import { apiRequest } from './apiClient.js';
import { DEFAULT_CHAIN_ID } from '../config/networks.js';

export const walletService = {
  async fetchWalletState(address = null) {
    const query = address ? `?address=${address}` : '';
    return await apiRequest(`/wallet/state${query}`);
  },

  async connectMetaMask() {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask is not installed. Please install the MetaMask browser extension.');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    const network = await provider.getNetwork();
    const signer = await provider.getSigner();

    return {
      provider,
      signer,
      address: accounts[0],
      chainId: Number(network.chainId),
    };
  },

  async switchNetwork(targetChainId = DEFAULT_CHAIN_ID) {
    if (!window.ethereum) throw new Error('MetaMask not detected');
    const hexChainId = `0x${targetChainId.toString(16)}`;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        throw new Error(`Chain ID ${targetChainId} is not added to your MetaMask.`);
      }
      throw switchError;
    }
  },
};
