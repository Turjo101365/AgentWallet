import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { AccessGate } from '../wallet/AccessGate.jsx';

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          <AccessGate>
            <Outlet />
          </AccessGate>
        </main>
      </div>
    </div>
  );
}
