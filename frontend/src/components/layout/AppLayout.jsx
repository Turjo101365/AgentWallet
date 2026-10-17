import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../ui/Button.jsx';
import { Topbar } from './Topbar.jsx';
import { NetworkModeBanner } from './NetworkMode.jsx';
import { ModeBanner } from './ModeBanner.jsx';
import { AccessGate } from '../wallet/AccessGate.jsx';
import { useApp } from '../../app/providers.jsx';
import { Judge } from '../../pages/Judge.jsx';
import { Welcome } from '../../pages/Welcome.jsx';
import { AdminConsole } from '../../pages/AdminConsole.jsx';
import { PersonalWallet } from '../../pages/PersonalWallet.jsx';

const isEvidencePath = (p) => p === '/evidence' || p.startsWith('/evidence/') || p.startsWith('/judge/');

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink">
      <Topbar />
      <div className="sm:px-3 sm:pb-3">
        <div className="bg-canvas rounded-t-[28px] sm:rounded-[32px] min-h-[calc(100vh-4.75rem)] overflow-hidden">
          <NetworkModeBanner />
          <ModeBanner />
          <main className="px-4 sm:px-8 xl:px-10 py-7 sm:py-10 max-w-[1480px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}

/**
 * Dark frame around a rounded light canvas; every page renders inside it.
 * Public judge site: role selection first; then the full dashboard on the demo sandbox (Demo Wallet), the judge's own
 * sandbox (Personal Wallet), or the admin console. Historical evidence stays in its own section.
 */
export function AppLayout() {
  const { judgeSite, mode, isDemo, personal, config, configError, reloadConfig, resetMode } = useApp();
  const { pathname } = useLocation();

  if (!judgeSite) {
    return (
      <Shell>
        <AccessGate>
          <Outlet />
        </AccessGate>
      </Shell>
    );
  }
  if (isEvidencePath(pathname)) return mode && config ? <Shell><Judge embedded /></Shell> : <Judge />;
  if (!mode || (mode.role === 'judge' && mode.wallet === 'demo' && !isDemo)) return <Welcome />;
  // Wait for the selected wallet's config before mounting pages or their API polling effects.
  // A restored demo session must never fall back to the root evidence wallet during loading.
  if (!config) return <main className="min-h-screen bg-canvas px-5 py-20 flex items-start justify-center"><section className="max-w-md w-full rounded-4xl bg-white p-7 shadow-card space-y-4" role="status" aria-live="polite">
    <h1 className="text-3xl">{configError ? 'We couldn’t open your wallet yet' : 'Opening your wallet…'}</h1>
    <p className="text-slate-600">The free demo service may need a moment to wake up. Your funds and permissions are unchanged.</p>
    {configError && <Button onClick={reloadConfig}>Try again</Button>}
    <div className="flex flex-wrap gap-4 text-sm"><button className="underline" onClick={resetMode}>Back to wallet selection</button><Link className="underline" to="/evidence">View historical evidence</Link></div>
  </section></main>;
  if (mode.role === 'admin') return <Shell><AdminConsole /></Shell>;
  if (mode.wallet === 'personal' && !personal) return <Shell><PersonalWallet /></Shell>;
  return <Shell><Outlet /></Shell>;
}
