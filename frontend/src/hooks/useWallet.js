import { useState, useEffect, useCallback } from 'react';
import { walletService } from '../services/walletService.js';
import { ethers } from 'ethers';

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const conn = await walletService.connectMetaMask();
      setAddress(conn.address);
      setChainId(conn.chainId);
      setSigner(conn.signer);
      setProvider(conn.provider);
      setIsConnected(true);
    } catch (err) {
      setError(err.message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setSigner(null);
    setProvider(null);
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setAddress(accounts[0]);
          setIsConnected(true);
        }
      };

      const handleChainChanged = (hexChain) => {
        setChainId(parseInt(hexChain, 16));
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [disconnect]);

  return {
    address,
    chainId,
    signer,
    provider,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
