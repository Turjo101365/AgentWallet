import React from 'react';
import { useApp } from '../../app/providers.jsx';
import { usePolling } from '../../hooks/usePolling.js';
import { get } from '../../lib/api.js';
import { truncateAddress } from '../../utils/formatters.js';

/** Which wallet is in use, what it may do right now, and how live, historical and simulated data are labeled. */
export function ModeBanner() {
  const { mode, isDemo, resetMode, session } = useApp();
  const status = usePolling(() => get('/sandbox-status'), 15000, [], { enabled: isDemo });
  if (!mode) return null;
  const s = status.data;
  if (mode.role === 'admin') {
    return (
      <Strip icon="admin_panel_settings" title="Owner / Admin" onSwitch={resetMode}>
        Access is decided by the server: a wallet signature (SIWE) from an address on its admin allowlist.
      </Strip>
    );
  }
  if (mode.wallet === 'personal') {
    return (
      <Strip icon="account_balance_wallet" title={`Personal wallet${session?.address ? ` · ${truncateAddress(session.address)}` : ''}`} onSwitch={resetMode}>
        You sign every approval in your own wallet. Your sandbox is separate from the demo wallet and from the historical evidence.
      </Strip>
    );
  }
  return (
    <Strip icon="toll" title="Demo wallet · Sepolia sandbox" onSwitch={resetMode} testId="demo-mode-banner">
      {s ? (
        <>
          Contract <a className="underline font-mono" href={s.sandbox.contractUrl} target="_blank" rel="noreferrer">{truncateAddress(s.sandbox.contract)}</a> · keys held by the server
          {' · '}
          {s.session?.executionAllowed
            ? <strong>live transactions on · {s.session.txRemaining} left this session</strong>
            : <strong>explore mode · invite needed for live transactions</strong>}
          {!s.executionEnabled && <strong> · live execution paused by the admin</strong>}
          {' · '}max {s.limits.maxAmountEth} ETH per payment
        </>
      ) : 'Loading sandbox status…'}
      <span className="block opacity-80 mt-0.5">LIVE = real Sepolia transactions in this sandbox · SIMULATED = pre-flight dry run, nothing sent · HISTORICAL = the frozen public run under Evidence.</span>
    </Strip>
  );
}

function Strip({ icon, title, children, onSwitch, testId }) {
  return (
    <div data-testid={testId} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 sm:px-8 py-2.5 bg-lilac text-ink text-[12.5px]">
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span>
      <div className="flex-1 min-w-0"><span className="font-bold mr-2">{title}</span>{children}</div>
      <button type="button" onClick={onSwitch} className="font-semibold underline shrink-0">Switch role or wallet</button>
    </div>
  );
}
