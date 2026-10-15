import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Overview } from '../pages/Overview.jsx';
import { Wallet } from '../pages/Wallet.jsx';
import { AgentActivity } from '../pages/AgentActivity.jsx';
import { TransactionHistory } from '../pages/TransactionHistory.jsx';
import { SmartContracts } from '../pages/SmartContracts.jsx';
import { RLInsights } from '../pages/RLInsights.jsx';
import { Settings } from '../pages/Settings.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'wallet', element: <Wallet /> },
      { path: 'agent', element: <AgentActivity /> },
      { path: 'transactions', element: <TransactionHistory /> },
      { path: 'contracts', element: <SmartContracts /> },
      { path: 'rl-insights', element: <RLInsights /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
