import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserProvider } from 'ethers';
import { configureApi, get, post } from '../lib/api.js';
import { WALLET_CHAIN_PARAMS } from '../lib/networks.js';

export const AppContext = createContext(null);
const SESSION_KEY = 'aw.session';
const MODE_KEY = 'aw.mode';
const DEMO_KEY = 'aw.demo';
export const DEMO_PREFIX = '/demo/sandbox';

function readJson(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable: state lives in memory only */
  }
}

const readStoredSession = () => readJson(SESSION_KEY);
const storeSession = (session) => writeJson(SESSION_KEY, session);
const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Global app state: backend config, the injected wallet, the authenticated session and, on the public judge site,
 * the selected role and wallet mode.
 *  - The SIWE session is bound to one wallet address; switching accounts signs out.
 *  - Every signing helper re-checks the wallet's chain id immediately before signing.
 *  - mode = { role: 'judge', wallet: 'demo' | 'personal' } or { role: 'admin' }. The role choice only selects screens;
 *    the backend decides what each session may do (demo session limits, SIWE admin allowlist).
 */
export function AppProvider({ children, ethereum = typeof window !== 'undefined' ? window.ethereum : undefined }) {
  const [siteConfig, setSiteConfig] = useState(null);
  const [sandboxConfig, setSandboxConfig] = useState(null);
  const [personal, setPersonal]=useState(null);
  const personalRef=useRef(null);
  const [configError, setConfigError] = useState(null);
  const [account, setAccount] = useState(null);
  const [walletChainId, setWalletChainId] = useState(null);
  const [siweSession, setSiweSession] = useState(readStoredSession);
  const [mode, setModeState] = useState(() => readJson(MODE_KEY));
  personalRef.current=mode?.role==='judge' && mode?.wallet==='personal' ? personal : null;
  const [demo, setDemoState] = useState(() => {
    const d = readJson(DEMO_KEY);
    return d && d.expiresAt > nowSeconds() ? d : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const demoActive = Boolean(mode?.role === 'judge' && mode?.wallet === 'demo' && demo?.token);
  const sessionRef = useRef(siweSession);
  sessionRef.current = siweSession;
  const demoRef = useRef(null);
  demoRef.current = demoActive ? demo : null;

  const signOutLocal = useCallback(() => {
    storeSession(null);
    setSiweSession(null);
    setPersonal(null);personalRef.current=null;
  }, []);

  const setDemo = useCallback((d) => {
    writeJson(DEMO_KEY, d);
    setDemoState(d);
  }, []);

  const setMode = useCallback((m) => {
    writeJson(MODE_KEY, m);
    setModeState(m);
  }, []);

  useEffect(() => {
    configureApi({
      // Root paths (public evidence, admin, SIWE) use the wallet session; sandbox paths use the demo session.
      getToken: ({ root } = {}) => (demoRef.current && !root ? demoRef.current.token : sessionRef.current?.token || null),
      getPrefix: () => (demoRef.current ? DEMO_PREFIX : personalRef.current ? '/personal/'+personalRef.current : ''),
      unauthorized: () => {
        if (demoRef.current) setDemo(null);
        else signOutLocal();
      },
    });
  }, [signOutLocal, setDemo]);

  const loadConfig = useCallback(async () => {
    try {
      setSiteConfig(await get('/config', { root: true }));
      setSandboxConfig(demoRef.current ? await get('/config') : null);
      setConfigError(null);
    } catch (err) {
      setConfigError(err.message);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig, demoActive]);

  // Validate a restored wallet session and refresh its role.
  useEffect(() => {
    if (!siweSession?.token) return;
    get('/auth/session', { root: true })
      .then((s) => {
        const next = { ...sessionRef.current, role: s.role, expiresAt: s.expiresAt };
        storeSession(next);
        setSiweSession(next);
      })
      .catch(() => signOutLocal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siweSession?.token]);

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
    if (siweSession && account && siweSession.address.toLowerCase() !== account.toLowerCase()) signOutLocal();
  }, [account, siweSession, signOutLocal]);

  const config = demoActive || personal ? sandboxConfig : siteConfig;

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
    if (!ethereum || !siteConfig) return;
    setError(null);
    const hex = `0x${siteConfig.chainId.toString(16)}`;
    try {
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
      } catch (err) {
        // 4902 = chain not added. MetaMask Mobile nests it inside a -32603 error.
        const unknownChain = err?.code === 4902 || err?.data?.originalError?.code === 4902;
        if (!unknownChain || !WALLET_CHAIN_PARAMS[siteConfig.chainId]) throw err;
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [WALLET_CHAIN_PARAMS[siteConfig.chainId](siteConfig.walletRpcUrl)] });
      }
    } catch (err) {
      setError(err);
      throw err;
    }
  }, [ethereum, siteConfig]);

  /** Returns a signer only if the wallet is on the backend's chain, checked at call time. */
  const getSigner = useCallback(async () => {
    if (!ethereum) throw new Error('No injected wallet found');
    if (!config) throw new Error('Backend configuration not loaded');
    if (demoRef.current) throw new Error('The demo wallet is signed by the server after your confirmation; no browser wallet signature is used');
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

  /** SIWE: proves control of the wallet. It grants nothing by itself; the server decides the role. */
  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const address = account || (await connect());
      const { message } = await post('/auth/nonce', { address }, { root: true });
      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner(address);
      const signature = await signer.signMessage(message);
      const result = await post('/auth/verify', { message, signature }, { root: true });
      const next = { token: result.token, address: result.address, role: result.role, expiresAt: result.expiresAt };
      storeSession(next);
      setSiweSession(next);
      return next;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [account, connect, ethereum]);

  const signOut = useCallback(async () => {
    if (demoRef.current) {
      setDemo(null);
      setMode(null);
      return;
    }
    try {
      await post('/auth/logout', {}, { root: true });
    } catch {
      /* already invalid */
    }
    signOutLocal();
  }, [signOutLocal, setDemo, setMode]);

  /** Judge → Demo wallet. Without an invite code the session can explore and draft, never execute. */
  const startDemo = useCallback(async (inviteCode) => {
    const d = await post('/demo/session', inviteCode ? { inviteCode } : {});
    setDemo({ token: d.token, sessionId: d.sessionId, executionAllowed: d.executionAllowed, expiresAt: d.expiresAt, limits: d.limits });
    setMode({ role: 'judge', wallet: 'demo' });
    return d;
  }, [setDemo, setMode]);

  /** Back to role selection: forgets the demo session and the chosen mode (the wallet session stays signed in). */
  const resetMode = useCallback(() => {
    setDemo(null);
    setPersonal(null); setSandboxConfig(null);
    setMode(null);
  }, [setDemo, setMode]);
  const selectPersonal=useCallback(async(address)=>{
    const selected=await post('/personal/select',{address},{root:true});
    personalRef.current=selected.address;
    try { const c=await get('/config');setSandboxConfig(c);setPersonal(selected.address); }
    catch(e){personalRef.current=null;throw e;}
  },[]);

  const value = useMemo(() => {
    const networkOk = Boolean(siteConfig && walletChainId === siteConfig.chainId);
    const session = demoActive ? { token: demo.token, address: null, role: 'demo', expiresAt: demo.expiresAt } : siweSession;
    return {
      config,
      siteConfig,
      configError,
      reloadConfig: loadConfig,
      judgeSite: import.meta.env.VITE_APP_MODE === 'judge' || siteConfig?.appMode === 'judge',
      mode,
      setMode,
      resetMode,
      demo: demoActive ? demo : null,
      isDemo: demoActive,
      personal, selectPersonal,
      startDemo,
      hasWallet: Boolean(ethereum),
      account,
      walletChainId,
      networkOk,
      session,
      isOwner: !demoActive && (Boolean(personal && sandboxConfig) || siweSession?.role === 'owner'),
      busy,
      error,
      connect,
      switchNetwork,
      getSigner,
      signIn,
      signOut,
    };
  }, [config, siteConfig, configError, loadConfig, mode, setMode, resetMode, demo, demoActive, startDemo, ethereum, account, walletChainId, siweSession, busy, error, connect, switchNetwork, getSigner, signIn, signOut,personal,selectPersonal,sandboxConfig]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// Kept for the previous import path.
export const Providers = AppProvider;
