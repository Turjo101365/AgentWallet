import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  if (mode === 'production' && command === 'build') {
    const url = env.VITE_API_URL && new URL(env.VITE_API_URL);
    if (!url || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api') ||
      (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('Set VITE_API_URL to the public HTTPS backend URL ending in /api (local HTTP is allowed for browser tests)');
    }
  }
  return {
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.{js,jsx}'],
    environment: 'jsdom',
  },
  };
});

