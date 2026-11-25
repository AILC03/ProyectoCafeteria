import { defineConfig, devices } from '@playwright/test';

/**
 * Live acceptance run for TASK-DA-E1-09.
 *
 * This config is intentionally isolated from the simulated suite:
 * - it only discovers `./e2e-live`, so `npm run test:e2e` keeps using `./e2e`;
 * - it never starts the backend, only reuses/starts the Vite proxy;
 * - it runs serially and stores no traces, videos, screenshots or HAR files,
 *   because the live flow involves real credentials.
 */
export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results/e2e-live',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-live',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
