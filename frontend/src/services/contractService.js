import { ethers } from 'ethers';
import { AGENT_WALLET_ABI, CONTRACT_ADDRESS } from '../config/contracts.js';
import { apiRequest } from './apiClient.js';

export const contractService = {
  async getContractConfig() {
    return await apiRequest('/contract/config');
  },

  getContract(signer) {
    if (!CONTRACT_ADDRESS) {
      throw new Error('Smart contract address is not configured. Please deploy and set VITE_CONTRACT_ADDRESS.');
    }
    return new ethers.Contract(CONTRACT_ADDRESS, AGENT_WALLET_ABI, signer);
  },

  async executePayment(signer, recipient, amountEth) {
    const contract = this.getContract(signer);
    const amountWei = ethers.parseEther(amountEth.toString());
    const tx = await contract.executePayment(recipient, amountWei);
    return tx;
  },

  async depositFunds(signer, amountEth) {
    const contract = this.getContract(signer);
    const amountWei = ethers.parseEther(amountEth.toString());
    const tx = await contract.deposit({ value: amountWei });
    return tx;
  },

  async setSpendingLimits(signer, perTxLimitEth, dailyLimitEth) {
    const contract = this.getContract(signer);
    const perTxWei = ethers.parseEther(perTxLimitEth.toString());
    const dailyWei = ethers.parseEther(dailyLimitEth.toString());
    const tx = await contract.setSpendingLimits(perTxWei, dailyWei);
    return tx;
  },

  async setPaused(signer, status) {
    const contract = this.getContract(signer);
    const tx = await contract.setPaused(status);
    return tx;
  },

  async emergencyWithdraw(signer, recipient, amountEth) {
    const contract = this.getContract(signer);
    const amountWei = ethers.parseEther(amountEth.toString());
    const tx = await contract.emergencyWithdraw(recipient, amountWei);
    return tx;
  },
};
