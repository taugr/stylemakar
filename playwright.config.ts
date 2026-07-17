import { defineConfig } from 'playwright/test';

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'output/playwright-e2e',
  reporter: [['line']],
  retries: 0,
  testDir: './e2e',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: false,
    timeout: 30_000,
    url: 'http://127.0.0.1:5173',
  },
  workers: 1,
});
