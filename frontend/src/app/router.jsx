import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Overview } from '../pages/Overview.jsx';
import { Proposals } from '../pages/Proposals.jsx';
import { Treasury } from '../pages/Treasury.jsx';
import { Controls } from '../pages/Controls.jsx';
import { Transactions } from '../pages/Transactions.jsx';
import { Audit } from '../pages/Audit.jsx';
import { RLAdvisory } from '../pages/RLAdvisory.jsx';
import { Security } from '../pages/Security.jsx';
import { Agent } from '../pages/Agent.jsx';
import { Automation } from '../pages/Automation.jsx';
import { Portfolio } from '../pages/Portfolio.jsx';

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: 'judge/evidence', element: null },
      { path: 'judge/agent', element: null },
      { path: 'judge/guide', element: null },
      { index: true, element: <Overview /> },
      { path: 'agent', element: <Agent /> },
      { path: 'proposals', element: <Proposals /> },
      { path: 'automation', element: <Automation /> },
      { path: 'portfolio', element: <Portfolio /> },
      { path: 'treasury', element: <Treasury /> },
      { path: 'controls', element: <Controls /> },
      { path: 'transactions', element: <Transactions /> },
      { path: 'audit', element: <Audit /> },
      { path: 'rl', element: <RLAdvisory /> },
      { path: 'security', element: <Security /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
