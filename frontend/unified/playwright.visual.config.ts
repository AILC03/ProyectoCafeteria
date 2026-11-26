import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './e2e/visual',
  workers: 1,
  fullyParallel: false,
  outputDir: 'test-results/visual',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/visual', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-MX',
    timezoneId: 'America/Tijuana',
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node ./node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort',
      cwd: configDir,
      url: 'http://localhost:5173',
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: 'node ./node_modules/vite/bin/vite.js --host localhost --port 5183 --strictPort',
      cwd: path.resolve(configDir, '../clientes'),
      url: 'http://localhost:5183',
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: 'node ./node_modules/vite/bin/vite.js --host localhost --port 5184 --strictPort',
      cwd: path.resolve(configDir, '../empleados'),
      url: 'http://localhost:5184',
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1,
      },
    },
  ],
});
