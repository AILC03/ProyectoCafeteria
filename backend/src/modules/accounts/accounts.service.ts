import { randomUUID } from 'node:crypto';
import { verify } from 'argon2';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpProblem, notFound, unavailable } from '../../shared/http/problem.js';
import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import { OrdersTransaction } from '../orders/orders.repository.js';
import { hashCredential } from '../auth/auth.credentials.js';
import { digest, opaque, forbidden, unauthorized } from '../auth/auth.tokens.js';
import type { AuthService } from '../auth/auth.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PayloadCipher } from '../../worker/payload-cipher.js';
import { AccountsRepository, customerFields, staffFields } from './accounts.repository.js';
import type * as input from './accounts.validation.js';

const conflict = (detail?: string) =>
  new HttpProblem(
    409,
    'ACCOUNT_CONFLICT',
    detail || 'La operación entra en conflicto con el estado de la cuenta',
    detail || 'La operación entra en conflicto con el estado de la cuenta',
  );
const accepted = { data: { accepted: true } };
export class AccountsService {
  constructor(
    readonly repository: AccountsRepository,
    readonly auth: AuthService,
    readonly mail?: { cipher: PayloadCipher; frontendOrigin: string },
    readonly now: () => Date = () => new Date(),
  ) {}
  private async actor(
    tx: Prisma.TransactionClient,
    actor: Principal,
    role: 'CLIENTE' | 'ADMINISTRADOR',
  ) {
    if ((await new OrdersTransaction(tx).actor(actor, this.now())) !== role) throw forbidden();
  }
  private revoke(tx: Prisma.TransactionClient, userId: bigint) {
    return tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }
  private async invalidateTokens(tx: Prisma.TransactionClient, customerId: bigint) {
    await tx.pinRecoveryToken.updateMany({
      where: { customerId, usedAt: null },
      data: { usedAt: this.now() },
    });
    await tx.emailVerificationToken.updateMany({
      where: { customerId, usedAt: null },
      data: { usedAt: this.now() },
    });
    // Borra también secretos de entregas pendientes; no envía enlaces revocados.
    await tx.outboxMessage.updateMany({
      where: {
        reference: { startsWith: `customer:${customerId}:` },
        encryptedPayload: { not: null },
      },
      data: { encryptedPayload: null, keyVersion: null, status: 'FAILED' },
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    action: string,
    reason: string,
    customerId?: bigint,
  ) {
    return tx.auditEvent.create({
      data: { actorId, action, reason, customerId, occurredAt: this.now() },
    });
  }
  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
        throw conflict();
      throw error;
    }
  }
  async rate(key: string, max: number, window = 15 * 60000) {
    await this.repository.transaction(async (tx) => {
      const counter = await this.auth.repository.counter(
        tx,
        this.auth.tokens.key(`accounts:${key}`),
        this.now(),
        window,
      );
      if (
        counter.attemptCount >= max ||
        (counter.blockedUntil && counter.blockedUntil > this.now())
      )
        throw new HttpProblem(429, 'AUTH_RATE_LIMITED', 'Límite temporal de solicitudes');
      await tx.authAttemptLimit.update({
        where: { id: counter.id },
        data: { attemptCount: { increment: 1 } },
      });
    });
  }
  async ownProfile(actor: Principal, body: z.infer<typeof input.ownProfile>) {
    if (body.phone) await this.rate(`phone:${actor.userId}`, 5);
    return this.unique(() =>
      this.repository.transaction(async (tx) => {
        await this.repository.lock(tx, actor.userId);
        await this.actor(tx, actor, 'CLIENTE');
        const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
        if (body.phone && (!user.pinHash || !(await verify(user.pinHash, body.currentPin!))))
          throw unauthorized();
        const changed = body.phone !== undefined;
        const data = await tx.user.update({
          where: { id: user.id },
          data: { name: body.name, phone: body.phone },
          select: customerFields,
        });
        if (changed) {
          await this.revoke(tx, user.id);
          await this.invalidateTokens(tx, user.id);
        }
        return { data };
      }),
    );
  }
  employees(actor: Principal, body: { limit: number; cursor?: string }) {
    const after = decodeCursor(body.cursor, 'employees', 'staff');
    return this.repository.transaction(async (tx) => {
      await this.actor(tx, actor, 'ADMINISTRADOR');
      return paginate(
        await this.repository.employees(tx, body.limit, after),
        body.limit,
        'employees',
        'staff',
      );
    });
  }
  private async getOrEnsureRole(tx: Prisma.TransactionClient, roleName: string) {
    let role = await tx.role.findUnique({ where: { name: roleName } });
    if (
      !role &&
      ['CLIENTE', 'CAJERO', 'PREPARACION', 'ADMINISTRADOR', 'GERENTE'].includes(roleName)
    ) {
      role = await tx.role.upsert({
        where: { name: roleName },
        create: { name: roleName },
        update: {},
      });
    }
    if (!role) throw notFound();
    return role;
  }
  async createEmployee(actor: Principal, body: z.infer<typeof input.employeeCreate>) {
    const passwordHash = await hashCredential(body.password);
    return this.unique(() =>
      this.repository.transaction(async (tx) => {
        await this.actor(tx, actor, 'ADMINISTRADOR');
        const role = await this.getOrEnsureRole(tx, body.role);
        const user = await tx.user.create({
          data: {
            accountType: 'STAFF',
            roleId: role.id,
            name: body.name,
            username: body.username,
            passwordHash,
          },
          select: staffFields,
        });
        await this.audit(tx, actor.userId, 'EMPLOYEE_CREATED', `Empleado ${user.id}`);
        return { data: { ...user, role: user.role.name } };
      }),
    );
  }
  updateEmployee(actor: Principal, id: bigint, body: z.infer<typeof input.employeeUpdate>) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, id);
      await this.actor(tx, actor, 'ADMINISTRADOR');
      const user = await tx.user.findUnique({ where: { id }, include: { role: true } });
      if (!user || user.accountType !== 'STAFF') throw notFound();
      const changesAccess =
        (body.role !== undefined && body.role !== user.role.name) ||
        (body.isActive !== undefined && body.isActive !== user.isActive);
      if (id === actor.userId && changesAccess) {
        throw conflict(
          'No puedes modificar tu propio rol o darte de baja mientras tienes la sesión iniciada',
        );
      }
      if (
        (body.isActive === false || body.role === 'PREPARACION' || body.role === 'GERENTE') &&
        (await tx.cashSession.findFirst({ where: { employeeId: id, closedAt: null } }))
      ) {
        throw conflict(
          'No se puede dar de baja o cambiar rol a un empleado con un turno de caja abierto. Debe cerrarse la caja primero.',
        );
      }
      const role = body.role ? await this.getOrEnsureRole(tx, body.role) : undefined;
      const data = await tx.user.update({
        where: { id },
        data: { name: body.name, isActive: body.isActive, roleId: role?.id },
        select: staffFields,
      });
      if (changesAccess) await this.revoke(tx, id);
      await this.audit(
        tx,
        actor.userId,
        'EMPLOYEE_UPDATED',
        `Empleado ${id}: ${body.reason}`.slice(0, 500),
      );
      return { data: { ...data, role: data.role.name } };
    });
  }
  deleteEmployee(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, id);
      await this.actor(tx, actor, 'ADMINISTRADOR');
      const user = await tx.user.findUnique({ where: { id }, include: { role: true } });
      if (!user || user.accountType !== 'STAFF') throw notFound();
      if (id === actor.userId) {
        throw conflict('No puedes eliminar tu propio usuario mientras tienes la sesión iniciada');
      }

      const openSession = await tx.cashSession.findFirst({
        where: { employeeId: id, closedAt: null },
      });
      if (openSession) {
        throw conflict(
          'No se puede eliminar a un empleado con un turno de caja abierto. Debe cerrarse la caja primero.',
        );
      }

      const [hasOrders, hasSessions, hasPayments, hasAudits] = await Promise.all([
        tx.order.findFirst({
          where: { OR: [{ createdByEmployeeId: id }, { readyByEmployeeId: id }] },
        }),
        tx.cashSession.findFirst({
          where: { OR: [{ employeeId: id }, { closedByEmployeeId: id }] },
        }),
        tx.payment.findFirst({ where: { cashierId: id } }),
        tx.auditEvent.findFirst({ where: { actorId: id } }),
      ]);

      await this.revoke(tx, id);

      if (hasOrders || hasSessions || hasPayments || hasAudits) {
        // Baja lógica por integridad referencial y auditoría contable
        const data = await tx.user.update({
          where: { id },
          data: { isActive: false },
          select: staffFields,
        });
        await this.audit(
          tx,
          actor.userId,
          'EMPLOYEE_UPDATED',
          `Empleado ${id} dado de baja (registro conservado por historial contable)`.slice(0, 500),
        );
        return {
          deleted: false,
          deactivated: true,
          message:
            'Empleado dado de baja exitosamente en la base de datos (se preserva registro por integridad de ventas y turnos).',
          data: { ...data, role: data.role.name },
        };
      }

      // Sin historial vinculado: eliminación definitiva
      await tx.authSession.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
      await this.audit(
        tx,
        actor.userId,
        'EMPLOYEE_DELETED',
        `Empleado ${id} eliminado definitivamente de la base de datos`.slice(0, 500),
      );
      return {
        deleted: true,
        deactivated: false,
        message: 'Empleado eliminado definitivamente de la base de datos.',
        data: { id: id.toString(), name: user.name, username: user.username, role: user.role.name },
      };
    });
  }
  correctCustomer(actor: Principal, id: bigint, body: z.infer<typeof input.customerUpdate>) {
    return this.unique(() =>
      this.repository.transaction(async (tx) => {
        await this.repository.lock(tx, id);
        await this.actor(tx, actor, 'ADMINISTRADOR');
        const user = await tx.user.findFirst({
          where: { id, accountType: 'CUSTOMER', isActive: true, role: { name: 'CLIENTE' } },
        });
        if (!user) throw notFound();
        const data = await tx.user.update({
          where: { id },
          data: { name: body.name, phone: body.phone },
          select: customerFields,
        });
        if (body.phone && body.phone !== user.phone) {
          await this.revoke(tx, id);
          await this.invalidateTokens(tx, id);
        }
        await this.audit(tx, actor.userId, 'CUSTOMER_CORRECTED', body.reason, id);
        return { data };
      }),
    );
  }
  async resetPin(actor: Principal, id: bigint, body: z.infer<typeof input.pinReset>) {
    const pinHash = await hashCredential(body.temporaryPin);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, id);
      await this.actor(tx, actor, 'ADMINISTRADOR');
      if (
        !(await tx.user.findFirst({
          where: { id, accountType: 'CUSTOMER', isActive: true, role: { name: 'CLIENTE' } },
        }))
      )
        throw notFound();
      // «Reciente» se comprueba contra la última compra asociada, no una fecha arbitraria.
      const recent = await tx.sale.findFirst({
        where: { order: { customerId: id }, payment: { status: 'SUCCEEDED' } },
        orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
      });
      if (!recent || recent.id !== BigInt(body.recentSaleId)) throw conflict();
      await tx.user.update({ where: { id }, data: { pinHash, mustChangePin: true } });
      await tx.pinResetAudit.create({
        data: {
          customerId: id,
          adminId: actor.userId,
          reason: body.reason,
          verificationSummary: body.verificationSummary,
          resetAt: this.now(),
        },
      });
      await this.revoke(tx, id);
      await this.invalidateTokens(tx, id);
    });
  }
  private async enqueue(
    tx: Prisma.TransactionClient,
    userId: bigint,
    email: string,
    token: string,
    kind: 'verification' | 'recovery',
    expiresAt: Date,
  ) {
    if (!this.mail) throw unavailable();
    const reference = `customer:${userId}:${randomUUID()}`;
    // Fragmento: no se envía al servidor ni como query; frontend lo borra al capturar.
    const value = {
      to: email,
      subject: kind === 'verification' ? 'Verifica tu correo' : 'Recupera tu NIP',
      text: `${this.mail.frontendOrigin}/${kind === 'verification' ? 'verificar-correo' : 'recuperar-nip'}#token=${token}`,
    };
    await tx.outboxMessage.create({
      data: {
        type: 'EMAIL',
        reference,
        encryptedPayload: this.mail.cipher.seal(value, reference),
        keyVersion: this.mail.cipher.version,
        expiresAt,
        availableAt: this.now(),
      },
    });
  }
  async requestEmail(actor: Principal, email: string) {
    if (!this.mail) throw unavailable();
    await this.rate(`email:${actor.userId}`, 5);
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, actor.userId);
      await this.actor(tx, actor, 'CLIENTE');
      await this.invalidateTokens(tx, actor.userId);
      const token = opaque(),
        expiresAt = new Date(this.now().getTime() + 30 * 60000);
      await tx.emailVerificationToken.create({
        data: {
          customerId: actor.userId,
          candidateEmail: email,
          tokenHash: digest(token),
          expiresAt,
        },
      });
      await this.enqueue(tx, actor.userId, email, token, 'verification', expiresAt);
      return accepted;
    });
  }
  async requestRecovery(identifier: string, ip: string) {
    if (!this.mail) throw unavailable();
    await this.rate(`recovery-ip:${ip}`, 20, 60000);
    await this.rate(`recovery-id:${identifier}`, 5);
    return this.repository.transaction(async (tx) => {
      const found = await tx.user.findFirst({
        where: {
          accountType: 'CUSTOMER',
          isActive: true,
          role: { name: 'CLIENTE' },
          ...(identifier.startsWith('C') ? { customerNumber: identifier } : { phone: identifier }),
        },
        select: { id: true },
      });
      if (!found) return accepted;
      await this.repository.lock(tx, found.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: found.id } });
      if (!user.isActive || !user.recoveryEmail || !user.recoveryEmailVerifiedAt) return accepted;
      await this.invalidateTokens(tx, user.id);
      const token = opaque(),
        expiresAt = new Date(this.now().getTime() + 30 * 60000);
      await tx.pinRecoveryToken.create({
        data: { customerId: user.id, tokenHash: digest(token), expiresAt },
      });
      await this.enqueue(tx, user.id, user.recoveryEmail, token, 'recovery', expiresAt);
      return accepted;
    });
  }
  async confirm(kind: 'email' | 'pin', token: string, pin?: string) {
    const pinHash = pin ? await hashCredential(pin) : undefined;
    await this.repository.transaction(async (tx) => {
      const where = { tokenHash: digest(token) };
      const found =
        kind === 'email'
          ? await tx.emailVerificationToken.findUnique({ where })
          : await tx.pinRecoveryToken.findUnique({ where });
      if (!found) throw notFound();
      await this.repository.lock(tx, found.customerId);
      const current =
        kind === 'email'
          ? await tx.emailVerificationToken.findUnique({ where })
          : await tx.pinRecoveryToken.findUnique({ where });
      const user = await tx.user.findFirst({
        where: {
          id: found.customerId,
          accountType: 'CUSTOMER',
          isActive: true,
          role: { name: 'CLIENTE' },
        },
      });
      if (
        !current ||
        current.usedAt ||
        current.expiresAt <= this.now() ||
        !user ||
        (kind === 'pin' && !user.recoveryEmailVerifiedAt)
      )
        throw notFound();
      if (kind === 'email' && 'candidateEmail' in current)
        await tx.user.update({
          where: { id: user.id },
          data: {
            recoveryEmail: current.candidateEmail as string,
            recoveryEmailVerifiedAt: this.now(),
          },
        });
      else {
        await tx.user.update({ where: { id: user.id }, data: { pinHash, mustChangePin: false } });
        await this.revoke(tx, user.id);
      }
      await this.invalidateTokens(tx, user.id);
    });
  }
}
