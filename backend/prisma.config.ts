import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generate no necesita conexión: permite npm ci en un clon sin secretos.
  datasource: process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
      }
    : undefined,
});
