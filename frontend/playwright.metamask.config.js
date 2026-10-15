import { defineConfig } from '@playwright/test';
// Real MetaMask extension run (tests/metamask). Kept apart from playwright.config.js so `npx playwright test`
// stays the fast EIP-1193 bridge suite. The spec launches its own persistent Chromium context with the extension,
// so `use` options do not apply. No Playwright tracing: it would record the onboarding screens.
export default defineConfig({ testDir: './tests/metamask', workers: 1, retries: 0, timeout: 1200000, expect: { timeout: 15000 }, reporter: [['list'], ['json', { outputFile: 'test-results/metamask-results.json' }]] });
