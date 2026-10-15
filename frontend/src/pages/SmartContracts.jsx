import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ContractDetails } from '../components/contracts/ContractDetails.jsx';
import { SpendingLimitConfig } from '../components/contracts/SpendingLimitConfig.jsx';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { contractService } from '../services/contractService.js';
import { walletService } from '../services/walletService.js';
import { agentService } from '../services/agentService.js';
import { CONTRACT_ADDRESS } from '../config/contracts.js';

export function SmartContracts() {
  const { isConnected } = useOutletContext();
  const [contractConfig, setContractConfig] = useState(null);
  const [walletState, setWalletState] = useState(null);
  const [depositAmount, setDepositAmount] = useState('0.1');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    contractService.getContractConfig()
      .then(setContractConfig)
      .catch((err) => console.warn('Could not load contract config:', err.message));

    walletService.fetchWalletState()
      .then(setWalletState)
      .catch((err) => console.warn('Could not fetch contract wallet state:', err.message));
  }, []);

  const handleTogglePause = async () => {
    setIsUpdating(true);
    try {
      const activeAddress = contractConfig?.contractAddress || CONTRACT_ADDRESS;

      if (!activeAddress) {
        // Contract address not configured in environment
        const res = await agentService.togglePause();
        const newStatus = res?.data?.isPaused;
        setWalletState((prev) => ({
          ...prev,
          isContractPaused: newStatus,
        }));
        alert(
          newStatus
            ? 'EMERGENCY PAUSE ACTIVATED: Contract is not deployed yet on Base Sepolia. The off-chain autonomous agent execution has been halted in software.'
            : 'EMERGENCY PAUSE LIFTED: Autonomous agent execution has resumed.'
        );
        return;
      }

      if (!window.ethereum) {
        throw new Error('MetaMask not detected. Please install and connect MetaMask to sign on-chain transactions on Base Sepolia.');
      }

      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const newPauseState = !walletState?.isContractPaused;
      const tx = await contractService.setPaused(signer, newPauseState);
      await agentService.togglePause(newPauseState);
      setWalletState((prev) => ({
        ...prev,
        isContractPaused: newPauseState,
      }));
      alert(`Contract pause transaction broadcasted on Base Sepolia! Hash: ${tx.hash}`);
    } catch (err) {
      alert(`Error toggling pause: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateLimits = async (perTx, daily) => {
    setIsUpdating(true);
    try {
      if (!window.ethereum) throw new Error('MetaMask not connected');
      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const tx = await contractService.setSpendingLimits(signer, perTx, daily);
      alert(`Limits update broadcasted! Hash: ${tx.hash}`);
    } catch (err) {
      alert(`Error updating limits: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      if (!window.ethereum) throw new Error('MetaMask not connected');
      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const tx = await contractService.depositFunds(signer, parseFloat(depositAmount));
      alert(`Deposit transaction submitted! Hash: ${tx.hash}`);
    } catch (err) {
      alert(`Deposit error: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
          Smart Contract Management
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Directly inspect and manage deployed AgentWallet.sol on-chain parameters.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ContractDetails
          contractAddress={contractConfig?.contractAddress || CONTRACT_ADDRESS}
          isPaused={walletState?.isContractPaused ?? false}
          onTogglePause={handleTogglePause}
          isUpdating={isUpdating}
        />

        <SpendingLimitConfig
          perTxLimit={walletState?.perTxLimitEth ?? 0.01}
          dailyLimit={walletState?.dailyLimitEth ?? 0.05}
          dailySpent={walletState?.dailySpentEth ?? 0.0}
          onUpdateLimits={handleUpdateLimits}
          isUpdating={isUpdating}
        />
      </div>

      {/* Treasury Top-Up Card */}
      <Card>
        <CardHeader
          title="DEPOSIT FUNDS INTO TREASURY"
          subtitle="Deposit testnet ETH directly into AgentWallet.sol to fund autonomous rebalancing"
        />
        <CardContent>
          <form onSubmit={handleDeposit} className="flex flex-col sm:flex-row items-center gap-3">
            <div className="w-full sm:w-64">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount in ETH"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isUpdating || !isConnected}
              icon="account_balance"
            >
              {isUpdating ? 'Depositing...' : 'Deposit via MetaMask'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
