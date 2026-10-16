import React from 'react';
import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar.jsx';
import { NetworkModeBanner } from './NetworkMode.jsx';
import { AccessGate } from '../wallet/AccessGate.jsx';

/** Dark frame around a rounded light canvas; every page renders inside it. */
export function AppLayout() {
  return (
    <div className="min-h-screen bg-ink">
      <Topbar />
      <div className="sm:px-3 sm:pb-3">
        <div className="bg-canvas rounded-t-[28px] sm:rounded-[32px] min-h-[calc(100vh-4.75rem)] overflow-hidden">
          <NetworkModeBanner />
          <main className="px-4 sm:px-8 xl:px-10 py-7 sm:py-10 max-w-[1480px] w-full mx-auto">
            <AccessGate>
              <Outlet />
            </AccessGate>
          </main>
        </div>
      </div>
    </div>
  );
}
