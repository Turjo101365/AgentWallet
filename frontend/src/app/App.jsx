import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import { AppProvider } from './providers.jsx';

export function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}

export default App;
