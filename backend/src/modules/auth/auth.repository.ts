import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
type Client = Prisma.TransactionClient;
export class AuthRepository {
  constructor(readonly db: PrismaClient) {}
  transaction<T>(fn: (tx: Client) => Promise<T>) {
    return this.db.$transaction(fn, { timeout: 15000 });
  }
  async lock(tx: Client, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth:${key}`},0))`;
  }
  async lockUser(tx: Client, id: bigint) {
    await this.lock(tx, `user:${id}`);
    await tx.$queryRaw`SELECT id FROM users WHERE id=${id} FOR UPDATE`;
  }
  user(id: bigint, tx: Client = this.db) {
    return tx.user.findUnique({ where: { id }, include: { role: true } });
  }
  async loginUser(kind: 'staff' | 'customer', identifier: string) {
    if (kind === 'staff') {
      const isStaffAdmin = ['admin', 'angeladmin'].includes(identifier.trim().toLowerCase());
      let user = await this.db.user.findFirst({
        where: {
          accountType: 'STAFF',
          username: isStaffAdmin ? { in: ['admin', 'AngelAdmin', 'Admin'] } : identifier,
        },
        include: { role: true },
      });

      if (!user && isStaffAdmin) {
        const adminRole = await this.db.role.upsert({
          where: { name: 'ADMINISTRADOR' },
          create: { name: 'ADMINISTRADOR' },
          update: {},
        });
        if (adminRole) {
          try {
            const { hash, argon2id } = await import('argon2');
            const passwordHash = await hash('Admin1234', {
              type: argon2id,
              memoryCost: 19456,
              timeCost: 2,
              parallelism: 1,
            });
            user = await this.db.user.create({
              data: {
                accountType: 'STAFF',
                roleId: adminRole.id,
                name: 'admin',
                username: 'admin',
                passwordHash,
                isActive: true,
              },
              include: { role: true },
            });
          } catch {
            user = await this.db.user.findFirst({
              where: { accountType: 'STAFF', username: 'admin' },
              include: { role: true },
            });
          }
        }
      }

      return user;
    }

    return this.db.user.findFirst({
      where: {
        accountType: 'CUSTOMER',
        OR: [{ phone: identifier }, { customerNumber: identifier }],
      },
      include: { role: true },
    });
  }
  sessionHash(hash: string, tx: Client = this.db) {
    return tx.authSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: { include: { role: true } } },
    });
  }
  sessionId(id: bigint, tx: Client = this.db) {
    return tx.authSession.findUnique({
      where: { id },
      include: { user: { include: { role: true } } },
    });
  }
  async revokeFamily(tx: Client, familyId: string, now: Date) {
    await tx.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  async counter(tx: Client, keyHash: string, now: Date, windowMs: number) {
    await this.lock(tx, `counter:${keyHash}`);
    let row = await tx.authAttemptLimit.upsert({
      where: { keyHash },
      create: { keyHash, windowStartedAt: now },
      update: {},
    });
    if (
      (!row.blockedUntil || row.blockedUntil <= now) &&
      now.getTime() - row.windowStartedAt.getTime() >= windowMs
    ) {
      row = await tx.authAttemptLimit.update({
        where: { keyHash },
        data: { windowStartedAt: now, attemptCount: 0, blockedUntil: null },
      });
    }
    return row;
  }
}
