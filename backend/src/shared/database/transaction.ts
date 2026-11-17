import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

// Reutilizado por orders y caja; todos los callbacks deben contener solo efectos BD.
export async function withTransaction<T>(
  db: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { timeout: 15000, maxWait: 15000 });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : undefined;
      const sqlCode = meta && typeof meta === 'object' && 'code' in meta ? meta.code : undefined;
      const retryable =
        ['P2034', '40P01', '40001'].includes(String(code)) ||
        (code === 'P2010' && ['40P01', '40001'].includes(String(sqlCode)));
      if (attempt >= 2 || !retryable) throw error;
    }
  }
}
