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
        Sign in with an approved wallet to manage access and safety controls. The server verifies your permissions.
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
    <Strip icon="toll" title="Demo Wallet · Sepolia test ETH" onSwitch={resetMode} testId="demo-mode-banner">
      {s ? (
        <>
          {s.session?.executionAllowed
            ? <span>Live payment access · {s.session.txRemaining} left this session.</span>
            : <span>Explore freely. Ask the team for an invite to send test payments.</span>}
          {!s.executionEnabled && <strong> Payments are paused by the admin.</strong>}
          <details className="mt-1"><summary className="cursor-pointer text-xs text-slate-600">Demo details & evidence labels</summary><p className="mt-2">Shared test funds, not real money. The backend-controlled demo wallet signs after you confirm. Max {s.limits.maxAmountEth} ETH per payment.</p><a className="underline font-mono break-all" href={s.sandbox.contractUrl} target="_blank" rel="noreferrer">{s.sandbox.contract}</a><p>LIVE: real Sepolia transactions. SIMULATED: a safety dry run, nothing sent. HISTORICAL: the preserved run under Evidence.</p></details>
        </>
      ) : 'Loading sandbox status…'}
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
