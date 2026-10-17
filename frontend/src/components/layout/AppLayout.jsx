import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
  const { judgeSite, mode, isDemo, personal } = useApp();
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
  if (isEvidencePath(pathname)) return mode ? <Shell><Judge embedded /></Shell> : <Judge />;
  if (!mode || (mode.role === 'judge' && mode.wallet === 'demo' && !isDemo)) return <Welcome />;
  if (mode.role === 'admin') return <Shell><AdminConsole /></Shell>;
  if (mode.wallet === 'personal' && !personal) return <Shell><PersonalWallet /></Shell>;
  return <Shell><Outlet /></Shell>;
}
