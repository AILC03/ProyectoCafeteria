import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
  const origin = env.VITE_API_PROXY_ORIGIN || 'http://localhost:5173';
  const referer = env.VITE_API_PROXY_REFERER || 'http://localhost:5173/';

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.unit.test.{ts,tsx}', 'electron/**/*.unit.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'components',
            include: ['src/**/*.component.test.tsx'],
          },
        },
      ],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          headers: {
            Origin: origin,
            Referer: referer,
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.setHeader('origin', origin);
              proxyRequest.setHeader('referer', referer);
            });
          },
        },
      },
    },
  };
});
