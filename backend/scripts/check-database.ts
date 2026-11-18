import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function checkDatabase(label: string, value: string | undefined) {
  if (!value) throw new Error(`${label}: falta configurar la URL.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}: URL inválida.`);
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new Error(`${label}: la URL debe utilizar PostgreSQL.`);
  }
  const client = new Client({ connectionString: value, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query<{ table_count: number }>(
      "SELECT COUNT(*)::int AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    console.info(
      `${label}: conexión correcta; ${result.rows[0]?.table_count ?? 0} tablas en public.`,
    );
  } catch (error) {
    // Mostrar solo código técnico, no mensajes del proveedor que puedan incluir datos privados.
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'UNKNOWN';
    // No adjuntar cause: puede contener URL, usuario o detalles privados del proveedor.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`${label}: conexión fallida (${code}).`);
  } finally {
    await client.end();
  }
}

async function main() {
  const databases: [string, string | undefined][] = [
    ['Desarrollo', process.env.DATABASE_URL],
    ['Shadow', process.env.SHADOW_DATABASE_URL],
  ];
  if (process.env.TEST_DATABASE_URL) {
    databases.push(['Pruebas', process.env.TEST_DATABASE_URL]);
  }
  const destinations = new Set<string>();
  for (const [, value] of databases) {
    if (!value) continue;
    const url = new URL(value);
    const hostname = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? 'loopback'
      : url.hostname;
    const destination = `${hostname}:${url.port || '5432'}/${decodeURIComponent(url.pathname)}`;
    if (destinations.has(destination)) {
      throw new Error('Desarrollo, shadow y pruebas deben ser bases distintas.');
    }
    destinations.add(destination);
  }
  for (const [label, value] of databases) {
    await checkDatabase(label, value);
  }
}

main().catch((error: unknown) => {
  // Un fallo de URL en la comprobación de separación no debe revelar el valor recibido.
  console.error(
    error instanceof TypeError
      ? 'Configuración de URL inválida; revisa .env localmente.'
      : error instanceof Error
        ? error.message
        : 'No se pudo comprobar PostgreSQL.',
  );
  process.exitCode = 1;
});
