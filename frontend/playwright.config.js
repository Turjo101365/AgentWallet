import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', workers: 1, timeout: 90000, expect: { timeout: 15000 }, reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]], use: { headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' } });
