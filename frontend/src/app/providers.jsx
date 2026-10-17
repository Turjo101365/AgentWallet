import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserProvider } from 'ethers';
import { configureApi, get, post } from '../lib/api.js';
import { WALLET_CHAIN_PARAMS } from '../lib/networks.js';

export const AppContext = createContext(null);
const SESSION_KEY = 'aw.session';

function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

/**
 * Global app state: backend config, the injected wallet, and the authenticated session.
 *  - The session is bound to one wallet address; switching accounts signs out.
 *  - Every signing helper re-checks the wallet's chain id immediately before signing.
 */
export function AppProvider({ children, ethereum = typeof window !== 'undefined' ? window.ethereum : undefined }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [account, setAccount] = useState(null);
  const [walletChainId, setWalletChainId] = useState(null);
  const [session, setSession] = useState(readStoredSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const signOutLocal = useCallback(() => {
    storeSession(null);
    setSession(null);
  }, []);

  useEffect(() => {
    configureApi({ getToken: () => sessionRef.current?.token || null, unauthorized: signOutLocal });
  }, [signOutLocal]);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await get('/config'));
      setConfigError(null);
    } catch (err) {
      setConfigError(err.message);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Validate a restored session and refresh its role.
  useEffect(() => {
    if (!session?.token) return;
    get('/auth/session')
      .then((s) => {
        const next = { ...sessionRef.current, role: s.role, expiresAt: s.expiresAt };
        storeSession(next);
        setSession(next);
      })
      .catch(() => signOutLocal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => {
    if (!ethereum) return undefined;
    ethereum.request({ method: 'eth_accounts' }).then((accs) => setAccount(accs?.[0] || null)).catch(() => {});
    ethereum.request({ method: 'eth_chainId' }).then((id) => setWalletChainId(parseInt(id, 16))).catch(() => {});
    const onAccounts = (accs) => setAccount(accs?.[0] || null);
    const onChain = (id) => setWalletChainId(parseInt(id, 16));
    ethereum.on?.('accountsChanged', onAccounts);
    ethereum.on?.('chainChanged', onChain);
    return () => {
      ethereum.removeListener?.('accountsChanged', onAccounts);
      ethereum.removeListener?.('chainChanged', onChain);
    };
  }, [ethereum]);

  // A session belongs to exactly one address.
  useEffect(() => {
    if (session && account && session.address.toLowerCase() !== account.toLowerCase()) signOutLocal();
  }, [account, session, signOutLocal]);

  // Wallet popups can be rejected, already pending (-32002) or refused; surface every failure.
  const connect = useCallback(async () => {
    setError(null);
    try {
      if (!ethereum) throw new Error('No injected wallet found. Install MetaMask or another EIP-1193 wallet.');
      const accs = await ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accs?.[0] || null);
      setWalletChainId(parseInt(await ethereum.request({ method: 'eth_chainId' }), 16));
      return accs?.[0];
    } catch (err) {
      setError(err);
      throw err;
    }
  }, [ethereum]);

  const switchNetwork = useCallback(async () => {
    if (!ethereum || !config) return;
    setError(null);
    const hex = `0x${config.chainId.toString(16)}`;
    try {
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
      } catch (err) {
        // 4902 = chain not added. MetaMask Mobile nests it inside a -32603 error.
        const unknownChain = err?.code === 4902 || err?.data?.originalError?.code === 4902;
        if (!unknownChain || !WALLET_CHAIN_PARAMS[config.chainId]) throw err;
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [WALLET_CHAIN_PARAMS[config.chainId](config.walletRpcUrl)] });
      }
    } catch (err) {
      setError(err);
      throw err;
    }
  }, [ethereum, config]);

  /** Returns a signer only if the wallet is on the backend's chain, checked at call time. */
  const getSigner = useCallback(async () => {
    if (!ethereum) throw new Error('No injected wallet found');
    if (!config) throw new Error('Backend configuration not loaded');
    if (config.appMode === 'judge') throw new Error('Signing is disabled in the public judge demonstration');
    const provider = new BrowserProvider(ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== config.chainId) {
      throw new Error(`Wallet is on chain ${network.chainId}; switch to ${config.networkName} (${config.chainId}) first.`);
    }
    const signer = await provider.getSigner();
    if (sessionRef.current && signer.address.toLowerCase() !== sessionRef.current.address.toLowerCase()) {
      throw new Error('The wallet account changed since sign-in. Sign in again with the current account.');
    }
    return signer;
  }, [ethereum, config]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const address = account || (await connect());
      const { message } = await post('/auth/nonce', { address });
      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner(address);
      const signature = await signer.signMessage(message);
      const result = await post('/auth/verify', { message, signature });
      const next = { token: result.token, address: result.address, role: result.role, expiresAt: result.expiresAt };
      storeSession(next);
      setSession(next);
      return next;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [account, connect, ethereum]);

  const signOut = useCallback(async () => {
    try {
      await post('/auth/logout', {});
    } catch {
      /* already invalid */
    }
    signOutLocal();
  }, [signOutLocal]);

  const value = useMemo(() => {
    const networkOk = Boolean(config && walletChainId === config.chainId);
    return {
      config,
      configError,
      reloadConfig: loadConfig,
      hasWallet: Boolean(ethereum),
      account,
      walletChainId,
      networkOk,
      session,
      isOwner: session?.role === 'owner',
      busy,
      error,
      connect,
      switchNetwork,
      getSigner,
      signIn,
      signOut,
    };
  }, [config, configError, loadConfig, ethereum, account, walletChainId, session, busy, error, connect, switchNetwork, getSigner, signIn, signOut]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// Kept for the previous import path.
export const Providers = AppProvider;
