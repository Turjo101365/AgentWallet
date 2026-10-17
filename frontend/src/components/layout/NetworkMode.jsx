import React from 'react';
import { useApp } from '../../app/providers.jsx';

/** Public only when the backend reports a public testnet. Every local chain is treated as a simulation. */
export function useNetworkMode() {
  const { config } = useApp();
  const isPublic = Boolean(config?.isPublicNetwork);
  let explorerHost = null;
  try {
    explorerHost = config?.explorerBaseUrl ? new URL(config.explorerBaseUrl).host : null;
  } catch {
    explorerHost = null;
  }
  return { isPublic, config, explorerHost };
}

/** Compact pill: PUBLIC TESTNET (sky, globe) vs LOCAL SIMULATION (butter, hatched). */
export function NetworkModePill() {
  const { isPublic, config } = useNetworkMode();
  if (!config) return null;
  return isPublic ? (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-sky text-sky-deep"
      title={`${config.networkName} (chain ${config.chainId}) is a public testnet: transactions are publicly verifiable. Test ETH only.`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">public</span>
      {config.networkName} · test ETH
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-butter text-butter-deep sim-hatch"
      title={`${config.networkName} (chain ${config.chainId}) is a local simulation chain. Nothing here is public.`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">science</span>
      Local simulation
    </span>
  );
}

/** Full-width strip at the top of the canvas so the mode is never ambiguous, including in screenshots. */
export function NetworkModeBanner() {
  const { isDemo } = useApp();
  const { isPublic, config, explorerHost } = useNetworkMode();
  if (!config) return null;
  if (isPublic && isDemo) return null;
  return isPublic ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 sm:px-8 py-2.5 bg-sky text-sky-deep text-[12.5px]">
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">public</span>
      <span className="font-bold">Public testnet · {config.networkName} (chain {config.chainId})</span>
      <span className="opacity-85">Every transaction is publicly verifiable{explorerHost ? ` on ${explorerHost}` : ''}. Test ETH only, no real money.</span>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 sm:px-8 py-2.5 bg-butter text-butter-deep sim-hatch text-[12.5px]">
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">science</span>
      <span className="font-bold">Local simulation · {config.networkName} (chain {config.chainId})</span>
      <span className="opacity-85">Nothing on this chain is public and there is no public explorer. Public evidence is on Ethereum Sepolia.</span>
    </div>
  );
}
