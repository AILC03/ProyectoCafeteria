import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

// Solo bases nuevas creadas por verify-database.mjs, nunca una base de usuario.
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/cafeteria_review_[a-f0-9]{12}_corrected$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
try {
  const category = await prisma.category.create({ data: { name: 'Prisma smoke' } });
  assert.ok(category.createdAt instanceof Date);
  const order = await prisma.order.findUnique({ where: { id: 101n }, include: { sale: true } });
  assert.ok(order?.sale);
  assert.equal(order.sale.orderId, 101n);
  await prisma.category.delete({ where: { id: category.id } });
} finally {
  await prisma.$disconnect();
}
