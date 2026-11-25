import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/visual',
  timeout: 90_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'visual-chromium' }],
  webServer: [
    { command: 'node ./node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort', url: 'http://localhost:5173', env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:1' }, reuseExistingServer: false },
    { command: 'npm.cmd --prefix ../clientes run dev -- --host localhost --port 5183 --strictPort', url: 'http://localhost:5183', reuseExistingServer: false },
    { command: 'npm.cmd --prefix ../empleados run dev -- --host localhost --port 5184 --strictPort', url: 'http://localhost:5184', reuseExistingServer: false },
  ],
});
