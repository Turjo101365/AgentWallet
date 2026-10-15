import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import { Providers } from './providers.jsx';

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}

export default App;
