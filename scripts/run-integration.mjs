import { existsSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

// Conservar TEST-01 para uso local normal. Una URL explícita (CI/revisión aislada)
// no necesita leer .env.docker y nunca debe ser sustituida por ese archivo.
let ready = true;
if (process.env.TEST_DATABASE_URL === undefined && existsSync('.env.docker')) {
  try {
    process.loadEnvFile('.env.docker');
  } catch {
    console.error('Configuración Docker de pruebas no disponible; no se muestran valores.');
    process.exitCode = 1;
    ready = false;
  }
}
if (ready) await import('./test-catalog-integration.mjs');
