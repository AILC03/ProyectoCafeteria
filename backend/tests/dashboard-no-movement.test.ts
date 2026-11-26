import { describe, expect, it } from 'vitest';
import { SalesRepository, SalesService } from '../src/modules/sales/sales.service.js';
import type {
  SalesNoMovementAggregate,
  SalesNoMovementInput,
} from '../src/modules/sales/sales.read.repository.js';
import {
  decodeNoMovementCursor,
  encodeNoMovementCursor,
  NO_MOVEMENT_UNIVERSE_DEFINITION,
  salesNoMovementQuery,
  type NoMovementCursorFilters,
} from '../src/modules/sales/sales.validation.js';
import type { Principal } from '../src/modules/auth/auth.types.js';

const actor = { userId: 1n, sessionId: 1n } as Principal;
const base = {
  from: '2027-06-01T08:00:00.000Z',
  to: '2027-06-02T08:00:00.000Z',
} as const;
const filters: NoMovementCursorFilters = {
  from: base.from,
  to: base.to,
  method: null,
  limit: '20',
};

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    return;
  }
  throw new Error('Se esperaba un error de validación');
}

function noMovementService(aggregate: SalesNoMovementAggregate | undefined) {
  const calls: unknown[][] = [];
  const repository = {
    noMovementProducts: async (...args: unknown[]) => {
      calls.push(args);
      return aggregate;
    },
  } as unknown as SalesRepository;
  return {
    service: new SalesService(repository, () => new Date('2026-11-25T18:30:00.000Z')),
    calls,
  };
}

function sqlText(first: unknown): string {
  if (Array.isArray(first)) return String(first[0]);
  if (typeof first === 'object' && first !== null && 'sql' in first)
    return String((first as { sql: string }).sql);
  return '';
}

function sqlValues(first: unknown): unknown[] {
  if (typeof first === 'object' && first !== null && 'values' in first)
    return (first as { values: unknown[] }).values;
  return [];
}

function noMovementRepository(row: SalesNoMovementAggregate | undefined) {
  const statements: { text: string; values: unknown[] }[] = [];
  const transaction = {
    $queryRaw: async (first: unknown) => {
      const text = sqlText(first);
      statements.push({ text, values: sqlValues(first) });
      if (text.includes('WITH universe')) return row ? [row] : [];
      return [];
    },
    authSession: {
      findUnique: async () => ({
        userId: 1n,
        revokedAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        user: {
          isActive: true,
          mustChangePin: false,
          accountType: 'STAFF',
          role: { name: 'ADMINISTRADOR' },
        },
      }),
    },
  };
  const database = { $transaction: async (fn: (tx: unknown) => unknown) => fn(transaction) };
  return { repository: new SalesRepository(database as never), statements };
}

function normalized(text: string) {
  return text.replace(/\s+/g, ' ');
}

function repositoryInput(overrides: Partial<SalesNoMovementInput> = {}): SalesNoMovementInput {
  return {
    from: new Date(base.from),
    to: new Date(base.to),
    limit: 20,
    ...overrides,
  };
}

function item(productId: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    productId,
    name,
    categoryId: '3',
    categoryName: 'Cafés',
    isAvailable: true,
    createdAt: '2024-01-15T18:00:00.000000Z',
    ...overrides,
  } as SalesNoMovementAggregate['items'][number];
}

const aggregate: SalesNoMovementAggregate = {
  totalNoMovementProducts: '9007199254740996',
  items: [
    item('9007199254740993', 'Latte', { isAvailable: false }),
    item('9007199254740994', 'Moka'),
  ],
};

describe('DA-001 E2-09: entrada estricta sin movimiento', () => {
  it('exige from/to y materializa limit=20 con method opcional', () => {
    expect(salesNoMovementQuery.parse(base)).toEqual({ ...base, limit: '20' });
    expect(salesNoMovementQuery.safeParse({ ...base, method: 'CASH' }).success).toBe(true);
    expect(salesNoMovementQuery.safeParse({ ...base, method: 'STRIPE' }).success).toBe(true);
    for (const limit of ['10', '20', '50'])
      expect(salesNoMovementQuery.safeParse({ ...base, limit }).success, limit).toBe(true);
    expect(salesNoMovementQuery.safeParse({}).success).toBe(false);
    expect(salesNoMovementQuery.safeParse({ from: base.from }).success).toBe(false);
    expect(salesNoMovementQuery.safeParse({ to: base.to }).success).toBe(false);
  });

  it('rechaza formas léxicas de limit y métodos inválidos', () => {
    for (const limit of ['010', '+20', '20.0', '5', '100', ' 20', '20 ', '', '-10', 'ten', '1'])
      expect(salesNoMovementQuery.safeParse({ ...base, limit }).success, limit).toBe(false);
    expect(salesNoMovementQuery.safeParse({ ...base, limit: 20 }).success).toBe(false);
    expect(salesNoMovementQuery.safeParse({ ...base, limit: ['20', '20'] }).success).toBe(false);
    for (const method of ['', 'null', 'card', 'CASH ', 'STRIPE '])
      expect(salesNoMovementQuery.safeParse({ ...base, method }).success, method).toBe(false);
    expect(salesNoMovementQuery.safeParse({ ...base, method: ['CASH'] }).success).toBe(false);
  });

  it('rechaza extras, repetidos, arrays y cursor fuera de forma', () => {
    for (const extra of [
      { category: '1' },
      { top: '5' },
      { metric: 'units' },
      { direction: 'top' },
      { timeZone: 'UTC' },
      { order: 'asc' },
      { sort: 'name' },
      { includeUnavailable: 'true' },
      { includeZeroSales: 'true' },
      { offset: '0' },
      { page: '1' },
    ])
      expect(salesNoMovementQuery.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(
      salesNoMovementQuery.safeParse({
        ...base,
        from: [base.from, base.from],
      }).success,
    ).toBe(false);
    expect(salesNoMovementQuery.safeParse({ ...base, ['from[]']: base.from }).success).toBe(false);
    for (const cursor of ['', 'abc=', 'a b', 'ábcd', 'x'.repeat(2049)])
      expect(salesNoMovementQuery.safeParse({ ...base, cursor }).success, cursor).toBe(false);
    expect(salesNoMovementQuery.safeParse({ ...base, cursor: 'abc' }).success).toBe(true);
  });

  it('acepta 0–3 decimales y el mínimo exacto; rechaza 4–6, fechas imposibles y offsets', () => {
    for (const [from, to] of [
      ['2027-06-01T08:00:00Z', '2027-06-01T09:00:00Z'],
      ['2027-06-01T08:00:00.1Z', '2027-06-01T09:00:00.1Z'],
      ['2027-06-01T08:00:00.10Z', '2027-06-01T09:00:00.12Z'],
      ['2000-01-01T08:00:00Z', '2000-01-02T08:00:00.000Z'],
    ] as const)
      expect(salesNoMovementQuery.safeParse({ ...base, from, to }).success, `${from} → ${to}`).toBe(
        true,
      );
    for (const from of [
      '2000-01-01T07:59:59.999Z',
      '1999-12-31T23:59:59.999Z',
      '2027-06-01T08:00:00.0000Z',
      '2027-06-01T08:00:00.000000Z',
      '2027-02-30T08:00:00.000Z',
      '2027-13-01T08:00:00.000Z',
      '2027-06-01T24:00:00.000Z',
      '2027-06-01T08:60:00.000Z',
      '2027-06-01T08:00:60.000Z',
      '2027-06-01T08:00:00+01:00',
      '2027-06-01t08:00:00.000z',
    ])
      expect(salesNoMovementQuery.safeParse({ ...base, from }).success, from).toBe(false);
  });

  it('exige from<to y un máximo de 366 días absolutos sin truncar', () => {
    expect(
      salesNoMovementQuery.safeParse({
        ...base,
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      salesNoMovementQuery.safeParse({
        ...base,
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.001Z',
      }).success,
    ).toBe(false);
    expect(salesNoMovementQuery.safeParse({ ...base, to: base.from }).success).toBe(false);
    expect(
      salesNoMovementQuery.safeParse({
        ...base,
        from: '2027-06-02T08:00:00.000Z',
        to: '2027-06-01T08:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('DA-001 E2-09: cursor propio', () => {
  it('codifica y decodifica la última clave con los filtros efectivos', () => {
    const token = encodeNoMovementCursor(filters, { name: 'Activo 10', productId: '10' });
    expect(token).toMatch(/^[A-Za-z0-9_-]{1,2048}$/);
    expect(decodeNoMovementCursor(token, filters)).toEqual({ name: 'Activo 10', productId: '10' });
    expect(decodeNoMovementCursor(undefined, filters)).toBeUndefined();
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    expect(payload).toEqual({
      v: 1,
      scope: 'dashboard-no-movement',
      definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
      from: filters.from,
      to: filters.to,
      method: null,
      limit: '20',
      name: 'Activo 10',
      productId: '10',
    });
  });

  it('acepta un cursor semánticamente igual con periodo/método/límite normalizados', () => {
    const token = encodeNoMovementCursor(
      { ...filters, method: 'CASH', limit: '10' },
      { name: 'Moka', productId: '9007199254740993' },
    );
    expect(decodeNoMovementCursor(token, { ...filters, method: 'CASH', limit: '10' })).toEqual({
      name: 'Moka',
      productId: '9007199254740993',
    });
    for (const incompatible of [
      { ...filters, method: 'CASH' as const },
      { ...filters, limit: '20' as const },
      { ...filters, from: base.to },
      { ...filters, to: base.from },
    ])
      expectInvalid(() => decodeNoMovementCursor(token, incompatible));
  });

  it('rechaza base64url no canónico, JSON manipulado y campos extra', () => {
    for (const token of ['abc=', 'abcd=', 'a b', '%%%%', 'x'.repeat(2049)])
      expectInvalid(() => decodeNoMovementCursor(token, filters));
    const valid = JSON.parse(
      Buffer.from(
        encodeNoMovementCursor(filters, { name: 'Latte', productId: '10' }),
        'base64url',
      ).toString('utf8'),
    );
    for (const tampered of [
      { ...valid, extra: true },
      { ...valid, v: 2 },
      { ...valid, scope: 'sales' },
      { ...valid, definition: 'other' },
      { ...valid, from: '2027-06-01T08:00:00Z' },
      { ...valid, to: '2027-06-02T08:00:00.0000Z' },
      { ...valid, method: 'CARD' },
      { ...valid, limit: '100' },
      { ...valid, name: '' },
      { ...valid, name: 'x'.repeat(161) },
      { ...valid, name: 10 },
      { ...valid, productId: '0' },
      { ...valid, productId: '01' },
      { ...valid, productId: '-1' },
      { ...valid, productId: '9223372036854775808' },
      { ...valid, productId: '10.0' },
      { ...valid, productId: 10 },
    ])
      expectInvalid(() =>
        decodeNoMovementCursor(
          Buffer.from(JSON.stringify(tampered)).toString('base64url'),
          filters,
        ),
      );
    expectInvalid(() =>
      decodeNoMovementCursor(Buffer.from('no-json').toString('base64url'), filters),
    );
  });

  it('rechaza nombre de cursor con NUL/controles y conserva UTF-8 válido (R-1)', () => {
    const payload = JSON.parse(
      Buffer.from(
        encodeNoMovementCursor(filters, { name: 'Latte', productId: '10' }),
        'base64url',
      ).toString('utf8'),
    );
    for (const name of ['La\u0000tte', 'La\u0001tte', '\u001F', 'Moka\u007F', 'linea\n'])
      expectInvalid(() =>
        decodeNoMovementCursor(
          Buffer.from(JSON.stringify({ ...payload, name })).toString('base64url'),
          filters,
        ),
      );
    for (const name of ['Café con leche', '🍰 Pastel', 'Mismo Nombre'])
      expect(
        decodeNoMovementCursor(encodeNoMovementCursor(filters, { name, productId: '10' }), filters),
      ).toEqual({ name, productId: '10' });
  });
});

describe('DA-001 E2-09: DTO y total antes de paginar', () => {
  it('compone el DTO cerrado, conserva el orden y hace eco de filtros', async () => {
    const { service, calls } = noMovementService(aggregate);
    const result = await service.noMovementProducts(actor, salesNoMovementQuery.parse(base));
    expect(result).toEqual({
      data: {
        generatedAt: '2026-11-25T18:30:00.000Z',
        currency: 'MXN',
        period: {
          from: base.from,
          to: base.to,
          timeZone: 'America/Tijuana',
        },
        method: null,
        universe: {
          asOf: base.to,
          definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
          includesUnavailable: true,
        },
        totalNoMovementProducts: '9007199254740996',
        page: { limit: '20', nextCursor: null },
        items: [
          {
            productId: '9007199254740993',
            name: 'Latte',
            category: { id: '3', name: 'Cafés' },
            isAvailable: false,
            createdAt: '2024-01-15T18:00:00.000000Z',
          },
          {
            productId: '9007199254740994',
            name: 'Moka',
            category: { id: '3', name: 'Cafés' },
            isAvailable: true,
            createdAt: '2024-01-15T18:00:00.000000Z',
          },
        ],
      },
    });
    expect(calls).toEqual([
      [
        actor,
        {
          from: new Date(base.from),
          to: new Date(base.to),
          limit: 20,
          after: undefined,
        },
      ],
    ]);
  });

  it('usa limit+1 solo para decidir nextCursor y no expone la fila extra', async () => {
    const rows = Array.from({ length: 21 }, (_, index) =>
      item(String(index + 1), `Activo ${String(index + 1).padStart(2, '0')}`),
    );
    const { service } = noMovementService({ totalNoMovementProducts: '21', items: rows });
    const result = await service.noMovementProducts(
      actor,
      salesNoMovementQuery.parse({ ...base, limit: '10' }),
    );
    expect(result.data.items).toHaveLength(10);
    expect(result.data.page.limit).toBe('10');
    expect(result.data.page.nextCursor).not.toBeNull();
    expect(
      decodeNoMovementCursor(result.data.page.nextCursor!, { ...filters, limit: '10' }),
    ).toEqual({ name: 'Activo 10', productId: '10' });
    expect(result.data.totalNoMovementProducts).toBe('21');
  });

  it('emite nextCursor null al final y hace eco de método/límite', async () => {
    const { service, calls } = noMovementService({
      totalNoMovementProducts: '2',
      items: aggregate.items,
    });
    const result = await service.noMovementProducts(
      actor,
      salesNoMovementQuery.parse({ ...base, method: 'STRIPE', limit: '10' }),
    );
    expect(result.data.method).toBe('STRIPE');
    expect(result.data.page).toEqual({ limit: '10', nextCursor: null });
    expect(calls[0]?.[1]).toMatchObject({ method: 'STRIPE', limit: 10 });
  });

  it('valida el cursor antes de llamar al repositorio', async () => {
    const { service, calls } = noMovementService(aggregate);
    await expect(
      service.noMovementProducts(
        actor,
        salesNoMovementQuery.parse({
          ...base,
          cursor: encodeNoMovementCursor(filters, {
            name: 'Latte',
            productId: '10',
          }),
        }),
      ),
    ).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
    await expect(
      service.noMovementProducts(actor, salesNoMovementQuery.parse({ ...base, cursor: 'abc' })),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(calls).toHaveLength(1);
  });

  it('falla explícitamente si falta el agregado, el total o un campo de ítem', async () => {
    await expect(
      noMovementService(undefined).service.noMovementProducts(
        actor,
        salesNoMovementQuery.parse(base),
      ),
    ).rejects.toThrow('Agregado de productos sin movimiento incompleto');
    await expect(
      noMovementService({
        totalNoMovementProducts: '01',
        items: [],
      }).service.noMovementProducts(actor, salesNoMovementQuery.parse(base)),
    ).rejects.toThrow('Agregado de productos sin movimiento incompleto');
    await expect(
      noMovementService({
        totalNoMovementProducts: '1',
        items: undefined as never,
      }).service.noMovementProducts(actor, salesNoMovementQuery.parse(base)),
    ).rejects.toThrow('Agregado de productos sin movimiento incompleto');
    await expect(
      noMovementService({
        totalNoMovementProducts: '1',
        items: [item('10', 'Latte', { createdAt: undefined })],
      }).service.noMovementProducts(actor, salesNoMovementQuery.parse(base)),
    ).rejects.toThrow('Producto sin movimiento incompleto');
  });
});

describe('DA-001 E2-09: consulta agregada y keyset', () => {
  it('usa una sola consulta con antijoin DISTINCT, total previo y orden COLLATE "C"', async () => {
    const { repository, statements } = noMovementRepository(aggregate);
    const result = await repository.noMovementProducts(actor, repositoryInput());
    expect(result).toEqual(aggregate);
    const aggregation = statements.filter((statement) => statement.text.includes('WITH universe'));
    expect(aggregation).toHaveLength(1);
    const text = normalized(aggregation[0]!.text);
    expect(text).toContain('FROM products p JOIN categories c');
    expect(text).toContain('p.deleted_at IS NULL');
    expect(text).toContain('c.is_active = TRUE');
    expect(text).toContain('c.deleted_at IS NULL');
    expect(text).toContain('p.created_at <');
    expect(text).toContain('SELECT DISTINCT oi.product_id');
    expect(text).toContain('FROM order_items oi JOIN sales s ON s.order_id = oi.order_id');
    expect(text).toContain('s.sold_at >=');
    expect(text).toContain('s.sold_at <');
    expect(text).toContain('LEFT JOIN moved m ON m.product_id = u.id');
    expect(text).toContain('WHERE m.product_id IS NULL');
    expect(text).toContain('SELECT count(*)::text AS total FROM without_movement');
    expect(text).toMatch(/ORDER BY w\.name COLLATE "C" ASC,\s*w\.id ASC/);
    expect(text).toContain('jsonb_agg');
    expect(text).toMatch(/ORDER BY pg\.name COLLATE "C" ASC,\s*pg\.id ASC/);
    expect(text).not.toContain('NOT EXISTS');
    expect(text).not.toContain('LEFT JOIN order_items');
    expect(text).not.toContain('OFFSET');
    expect(text).not.toContain('order_item_options');
    expect(text).not.toContain('refunds');
    expect(text).not.toContain('payment_events');
    expect(text).not.toContain('payment_incidents');
    expect(text).not.toContain('p.status');
    expect(text).not.toContain('JOIN payments');
    expect(text).not.toContain('pm.method');
    expect(aggregation[0]!.values).toEqual([
      new Date(base.to),
      new Date(base.from),
      new Date(base.to),
      21,
    ]);
  });

  it('añade el filtro de método por payments solo cuando se solicita', async () => {
    const { repository, statements } = noMovementRepository({
      totalNoMovementProducts: '0',
      items: [],
    });
    await repository.noMovementProducts(actor, repositoryInput({ method: 'CASH', limit: 10 }));
    const aggregation = statements.filter((statement) => statement.text.includes('WITH universe'));
    expect(aggregation).toHaveLength(1);
    const text = normalized(aggregation[0]!.text);
    expect(text).toContain('JOIN payments pm ON pm.id = s.payment_id');
    expect(text).toContain('AND pm.method::text = ');
    expect(aggregation[0]!.values).toEqual([
      new Date(base.to),
      new Date(base.from),
      new Date(base.to),
      'CASH',
      11,
    ]);
  });

  it('pagina por la clave (name, productId) después del cursor sin OFFSET', async () => {
    const { repository, statements } = noMovementRepository({
      totalNoMovementProducts: '1',
      items: [],
    });
    await repository.noMovementProducts(
      actor,
      repositoryInput({ after: { name: 'Activo 10', productId: '9007199254740993' } }),
    );
    const aggregation = statements.filter((statement) => statement.text.includes('WITH universe'));
    expect(aggregation).toHaveLength(1);
    const text = normalized(aggregation[0]!.text);
    expect(text).toContain('(w.name COLLATE "C", w.id) > (?::text COLLATE "C", ?::bigint)');
    expect(aggregation[0]!.values).toEqual([
      new Date(base.to),
      new Date(base.from),
      new Date(base.to),
      'Activo 10',
      9007199254740993n,
      21,
    ]);
  });

  it('lanza error interno si la fila agregada no existe', async () => {
    const { repository } = noMovementRepository(undefined);
    await expect(repository.noMovementProducts(actor, repositoryInput())).rejects.toThrow(
      'Agregado de productos sin movimiento incompleto',
    );
  });
});
