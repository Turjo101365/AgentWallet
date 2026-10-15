import { useState, useEffect } from 'react';
import { NETWORKS, DEFAULT_CHAIN_ID } from '../config/networks.js';
import { walletService } from '../services/walletService.js';

export function useNetwork(currentChainId = DEFAULT_CHAIN_ID) {
  const [network, setNetwork] = useState(NETWORKS[currentChainId] || NETWORKS[DEFAULT_CHAIN_ID]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);

  useEffect(() => {
    if (currentChainId && NETWORKS[currentChainId]) {
      setNetwork(NETWORKS[currentChainId]);
    }
  }, [currentChainId]);

  const switchNetwork = async (targetChainId) => {
    setIsSwitching(true);
    setSwitchError(null);
    try {
      await walletService.switchNetwork(targetChainId);
      if (NETWORKS[targetChainId]) {
        setNetwork(NETWORKS[targetChainId]);
      }
    } catch (err) {
      setSwitchError(err.message);
    } finally {
      setIsSwitching(false);
    }
  };

  return {
    network,
    isSwitching,
    switchError,
    switchNetwork,
    availableNetworks: Object.values(NETWORKS),
  };
}
