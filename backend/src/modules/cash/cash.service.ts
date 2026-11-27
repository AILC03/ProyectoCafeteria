import type { CashSession, Prisma } from '../../generated/prisma/client.js';
import { HttpProblem, notFound } from '../../shared/http/problem.js';
import { jsonValue } from '../../shared/http/serialization.js';
import type { Principal, RoleName } from '../auth/auth.types.js';
import { digest, forbidden } from '../auth/auth.tokens.js';
import { CashRepository, type CashTransaction } from './cash.repository.js';
import { cashConflict, checkedCents } from './cash.rules.js';
import type { AdminCashFilters, AdminCashQuery, CloseInput } from './cash.validation.js';
import { decodeCursor, paginate } from '../../shared/http/pagination.js';

export function requireCashRole(role: RoleName) {
  if (!['CAJERO', 'ADMINISTRADOR', 'GERENTE'].includes(role)) throw forbidden();
}
function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export async function cashOperation(
  repository: CashRepository,
  actor: Principal,
  scope: string,
  key: string,
  input: unknown,
  now: () => Date,
  fn: (tx: CashTransaction, role: RoleName) => Promise<unknown>,
) {
  return repository.transaction(async (tx) => {
    const role = await tx.orders.actor(actor, now());
    requireCashRole(role);
    const actorKey = `user:${actor.userId}`,
      keyHash = digest(key),
      requestHash = digest(canonical(jsonValue(input)));
    await tx.orders.lockIdempotency(scope, actorKey, keyHash);
    const previous = await tx.orders.idempotency(scope, actorKey, keyHash);
    if (previous && previous.expiresAt > now()) {
      if (previous.requestHash !== requestHash)
        throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Clave usada con otra entrada');
      if (previous.status !== 'COMPLETED' || !previous.responseJson)
        throw cashConflict('Operación no completada');
      return previous.responseJson;
    }
    if (previous) await tx.orders.removeIdempotency(previous.id);
    const response = jsonValue({ data: await fn(tx, role) }) as Prisma.InputJsonObject;
    const createdAt = now();
    const saved = await tx.orders.saveIdempotency({
      scope,
      actorKey,
      keyHash,
      requestHash,
      status: 'COMPLETED',
      responseJson: response,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 48 * 3600000),
    });
    return saved.responseJson;
  });
}
export async function sessionSummary(tx: CashTransaction, session: CashSession) {
  const ledger = await tx.ledger(session.id);
  if (ledger.invalid !== '0') throw cashConflict('Referencias de caja/pago/venta incoherentes');
  const cashSalesCents = BigInt(ledger.total),
    computedExpectedCashCents = checkedCents(session.openingAmountCents + cashSalesCents);
  return {
    ...session,
    cashSalesCents,
    successfulPayments: ledger.count,
    computedExpectedCashCents,
  };
}
export class CashService {
  constructor(
    readonly repository: CashRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  open(actor: Principal, amount: bigint, key: string) {
    return cashOperation(
      this.repository,
      actor,
      'cash:open',
      key,
      { openingAmountCents: amount },
      this.now,
      async (tx, role) => {
        if (role !== 'CAJERO' && role !== 'ADMINISTRADOR') throw forbidden();
        await tx.lockCash();
        if (await tx.active()) throw cashConflict('Ya existe una caja abierta');
        const opened = await tx.open(actor.userId, checkedCents(amount), this.now());
        await tx.audit(actor.userId, 'CASH_OPENED', `Caja ${opened.id}`, this.now());
        return sessionSummary(tx, opened);
      },
    );
  }
  async current(actor: Principal) {
    return this.repository.transaction(async (tx) => {
      requireCashRole(await tx.orders.actor(actor, this.now()));
      await tx.lockCash();
      const active = await tx.active();
      return { data: active ? await sessionSummary(tx, active) : null };
    });
  }
  get(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      requireCashRole(await tx.orders.actor(actor, this.now()));
      await tx.lockCash();
      const session = await tx.session(id);
      if (!session) throw notFound();
      return { data: await sessionSummary(tx, session) };
    });
  }
  /** Historial de solo lectura para Administración → Caja. No abre ni cierra. */
  async adminList(actor: Principal, input: AdminCashQuery) {
    const { limit, cursor, ...filters } = input;
    const scope = JSON.stringify([
      filters.from,
      filters.to,
      filters.status ?? null,
      filters.difference ?? null,
      filters.employeeId === undefined ? null : filters.employeeId.toString(),
    ]);
    const after = decodeCursor(cursor, 'admin-cash-sessions', scope);
    const [entries, summary] = await Promise.all([
      this.repository.adminSessions(actor, filters as AdminCashFilters, limit, after),
      this.repository.adminSummary(actor, filters as AdminCashFilters),
    ]);
    const page = paginate(entries, limit, 'admin-cash-sessions', scope);
    return { data: page.data, summary, page: page.page };
  }
  close(actor: Principal, id: bigint, input: CloseInput, key: string) {
    return cashOperation(
      this.repository,
      actor,
      'cash:close',
      key,
      { id, ...input },
      this.now,
      async (tx, role) => {
        await tx.lockCash();
        if (role !== 'CAJERO' && role !== 'ADMINISTRADOR') throw forbidden();
        const session = await tx.session(id);
        if (!session) throw notFound();
        if (session.employeeId !== actor.userId && role !== 'ADMINISTRADOR') throw forbidden();
        if (session.closedAt) throw cashConflict('Caja ya cerrada');
        const exceptional = session.employeeId !== actor.userId;
        if (exceptional ? !input.exceptionalCloseReason : !!input.exceptionalCloseReason)
          throw cashConflict('El cierre ajeno exige motivo; el cierre propio es ordinario');
        const summary = await sessionSummary(tx, session),
          counted = checkedCents(input.countedCashCents);
        const closed = await tx.close(id, {
          closedAt: this.now(),
          closedByEmployeeId: actor.userId,
          exceptionalCloseReason: exceptional ? input.exceptionalCloseReason : null,
          expectedCashCents: summary.computedExpectedCashCents,
          countedCashCents: counted,
          differenceCents: counted - summary.computedExpectedCashCents,
        });
        await tx.audit(
          actor.userId,
          exceptional ? 'CASH_CLOSED_EXCEPTIONALLY' : 'CASH_CLOSED',
          exceptional
            ? `Caja ${id}: cierre excepcional; motivo conservado en sesión`
            : `Caja ${id}`,
          this.now(),
        );
        return { ...summary, ...closed };
      },
    );
  }
}
