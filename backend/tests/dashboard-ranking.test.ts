import { describe, expect, it } from 'vitest';
import { SalesRepository, SalesService } from '../src/modules/sales/sales.service.js';
import type {
  SalesRankingAggregate,
  SalesRankingInput,
} from '../src/modules/sales/sales.read.repository.js';
import { salesRankingQuery } from '../src/modules/sales/sales.validation.js';
import type { Principal } from '../src/modules/auth/auth.types.js';

const actor = { userId: 1n, sessionId: 1n } as Principal;
const base = {
  from: '2027-06-01T08:00:00.000Z',
  to: '2027-06-02T08:00:00.000Z',
  metric: 'units',
  direction: 'top',
} as const;

function rankingService(aggregate: SalesRankingAggregate | undefined) {
  const calls: unknown[][] = [];
  const repository = {
    rankingAggregates: async (...args: unknown[]) => {
      calls.push(args);
      return aggregate;
    },
  } as unknown as SalesRepository;
  return {
    service: new SalesService(repository, () => new Date('2026-11-24T18:30:00.000Z')),
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

function rankingRepository(row: SalesRankingAggregate | undefined) {
  const statements: { text: string; values: unknown[] }[] = [];
  const transaction = {
    $queryRaw: async (first: unknown) => {
      const text = sqlText(first);
      statements.push({ text, values: sqlValues(first) });
      if (text.includes('WITH filtered_sales')) return row ? [row] : [];
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

function rankingInput(overrides: Partial<SalesRankingInput> = {}): SalesRankingInput {
  return {
    from: new Date(base.from),
    to: new Date(base.to),
    metric: 'units',
    direction: 'top',
    limit: 5,
    ...overrides,
  };
}

const aggregate: SalesRankingAggregate = {
  matchedProductCount: '9007199254740996',
  matchedUnitsSold: '9007199254740995',
  matchedTotalCents: '9007199254740999',
  items: [
    {
      productId: '9007199254740993',
      name: 'Mismo Nombre',
      nameSource: 'current',
      unitsSold: '9007199254740993',
      totalCents: '9007199254740995',
    },
    {
      productId: '9007199254740994',
      name: 'Mismo Nombre',
      nameSource: 'snapshot',
      unitsSold: '2',
      totalCents: '4',
    },
  ],
};

describe('DA-001 E2: entrada estricta de ranking', () => {
  it('exige from/to/metric/direction y materializa top=5 sin coerción', () => {
    const parsed = salesRankingQuery.parse(base);
    expect(parsed).toEqual({ ...base, top: '5' });
    expect(salesRankingQuery.safeParse({ ...base, top: '10' }).success).toBe(true);
    expect(salesRankingQuery.safeParse({ ...base, top: '20' }).success).toBe(true);
    expect(salesRankingQuery.safeParse({ ...base, method: 'CASH' }).success).toBe(true);
    expect(salesRankingQuery.safeParse({ ...base, method: 'STRIPE' }).success).toBe(true);
  });

  it('rechaza formas léxicas de top distintas de 5/10/20', () => {
    for (const top of ['05', '+5', '5.0', '5.00', ' 5', '5 ', '4', '0', '21', '-5', 'ten', ''])
      expect(salesRankingQuery.safeParse({ ...base, top }).success, top).toBe(false);
    expect(salesRankingQuery.safeParse({ ...base, top: 5 }).success).toBe(false);
    expect(salesRankingQuery.safeParse({ ...base, top: ['5', '5'] }).success).toBe(false);
  });

  it('rechaza métrica, dirección y método inválidos o vacíos', () => {
    for (const metric of ['totalCents', 'UNIT', '', undefined])
      expect(salesRankingQuery.safeParse({ ...base, metric }).success).toBe(false);
    for (const direction of ['asc', 'desc', '', undefined])
      expect(salesRankingQuery.safeParse({ ...base, direction }).success).toBe(false);
    for (const method of ['', 'null', 'CARD'])
      expect(salesRankingQuery.safeParse({ ...base, method }).success).toBe(false);
  });

  it('rechaza extras, arrays, repetidos y objetos anidados', () => {
    for (const extra of [
      { category: '1' },
      { cursor: 'abc' },
      { limit: '20' },
      { timeZone: 'UTC' },
      { order: 'desc' },
      { sort: 'units' },
      { includeZeroSales: 'true' },
      { offset: '5' },
    ])
      expect(salesRankingQuery.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(
      salesRankingQuery.safeParse({
        ...base,
        from: [base.from, base.from],
      }).success,
    ).toBe(false);
    expect(salesRankingQuery.safeParse({ ...base, method: ['CASH'] }).success).toBe(false);
    expect(salesRankingQuery.safeParse({ ...base, ['from[]']: base.from }).success).toBe(false);
    expect(salesRankingQuery.safeParse({}).success).toBe(false);
  });

  it('acepta from/to sin fracción y con 1, 2 o 3 decimales', () => {
    for (const [from, to] of [
      ['2027-06-01T08:00:00Z', '2027-06-01T09:00:00Z'],
      ['2027-06-01T08:00:00.1Z', '2027-06-01T09:00:00.1Z'],
      ['2027-06-01T08:00:00.10Z', '2027-06-01T09:00:00.12Z'],
      ['2027-06-01T08:00:00.123Z', '2027-06-01T09:00:00.123Z'],
      ['2000-01-01T08:00:00Z', '2000-01-02T08:00:00.000Z'],
    ] as const)
      expect(salesRankingQuery.safeParse({ ...base, from, to }).success, `${from} → ${to}`).toBe(
        true,
      );
  });

  it('acepta el mínimo exacto y rechaza precisiones/instantes imposibles', () => {
    expect(
      salesRankingQuery.safeParse({
        ...base,
        from: '2000-01-01T08:00:00.000Z',
        to: '2000-01-02T08:00:00.000Z',
      }).success,
    ).toBe(true);
    for (const from of [
      '2000-01-01T07:59:59.999Z',
      '2000-01-01T00:00:00.000Z',
      '1999-12-31T23:59:59.999Z',
      '2027-06-01T08:00:00.0000Z',
      '2027-06-01T08:00:00.00000Z',
      '2027-06-01T08:00:00.000000Z',
      '2027-02-30T08:00:00.000Z',
      '2027-13-01T08:00:00.000Z',
      '2027-06-01T24:00:00.000Z',
      '2027-06-01T08:60:00.000Z',
      '2027-06-01T08:00:60.000Z',
      '2027-06-01T08:00:00+01:00',
      '2027-06-01t08:00:00.000z',
    ])
      expect(salesRankingQuery.safeParse({ ...base, from }).success, from).toBe(false);
  });

  it('exige from<to y un rango máximo de 366 días sin truncar', () => {
    expect(
      salesRankingQuery.safeParse({
        ...base,
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      salesRankingQuery.safeParse({
        ...base,
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.001Z',
      }).success,
    ).toBe(false);
    expect(salesRankingQuery.safeParse({ ...base, to: base.from }).success).toBe(false);
    expect(
      salesRankingQuery.safeParse({
        ...base,
        from: '2027-06-02T08:00:00.000Z',
        to: '2027-06-01T08:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      salesRankingQuery.safeParse({
        ...base,
        to: '2027-06-01T08:00:00.001Z',
        from: '2027-06-01T08:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('DA-001 E2: DTO y eco de ranking', () => {
  it('preserva orden, strings exactos, posiciones y opcionales emitidos', async () => {
    const { service } = rankingService(aggregate);
    const result = await service.productRanking(actor, salesRankingQuery.parse(base));
    expect(result.data.generatedAt).toBe('2026-11-24T18:30:00.000Z');
    expect(result.data.period).toEqual({
      from: '2027-06-01T08:00:00.000Z',
      to: '2027-06-02T08:00:00.000Z',
      timeZone: 'America/Tijuana',
    });
    expect(result.data.method).toBeNull();
    expect(result.data.metric).toBe('units');
    expect(result.data.direction).toBe('top');
    expect(result.data.top).toBe('5');
    expect(result.data.matchedProductCount).toBe('9007199254740996');
    expect(result.data.matchedTotals).toEqual({
      unitsSold: '9007199254740995',
      totalCents: '9007199254740999',
    });
    expect(result.data.truncated).toBe(true);
    expect(result.data.items).toEqual([
      {
        position: '1',
        productId: '9007199254740993',
        name: 'Mismo Nombre',
        nameSource: 'current',
        unitsSold: '9007199254740993',
        totalCents: '9007199254740995',
      },
      {
        position: '2',
        productId: '9007199254740994',
        name: 'Mismo Nombre',
        nameSource: 'snapshot',
        unitsSold: '2',
        totalCents: '4',
      },
    ]);
  });

  it('no reordena el resultado del repositorio y hace eco del método/top', async () => {
    const { service, calls } = rankingService({
      matchedProductCount: '2',
      matchedUnitsSold: '5',
      matchedTotalCents: '9',
      items: [
        {
          productId: '20',
          name: 'B',
          nameSource: 'current',
          unitsSold: '3',
          totalCents: '5',
        },
        {
          productId: '3',
          name: 'A',
          nameSource: 'current',
          unitsSold: '2',
          totalCents: '4',
        },
      ],
    });
    const input = salesRankingQuery.parse({ ...base, top: '10', method: 'STRIPE' });
    const result = await service.productRanking(actor, input);
    expect(result.data.method).toBe('STRIPE');
    expect(result.data.top).toBe('10');
    expect(result.data.truncated).toBe(false);
    expect(result.data.items.map((item) => item.productId)).toEqual(['20', '3']);
    expect(calls).toEqual([
      [
        actor,
        {
          from: new Date(base.from),
          to: new Date(base.to),
          method: 'STRIPE',
          metric: 'units',
          direction: 'top',
          limit: 10,
        },
      ],
    ]);
  });

  it('no inventa ceros ni resultados si falta el agregado o el nombre', async () => {
    const missing = rankingService(undefined).service;
    await expect(missing.productRanking(actor, salesRankingQuery.parse(base))).rejects.toThrow(
      'Agregado de ranking incompleto',
    );
    const malformed = rankingService({
      ...aggregate,
      items: [{ ...aggregate.items[0]!, name: null as never }],
    }).service;
    await expect(malformed.productRanking(actor, salesRankingQuery.parse(base))).rejects.toThrow(
      'Nombre de producto no resuelto',
    );
    const invalidSource = rankingService({
      ...aggregate,
      items: [{ ...aggregate.items[0]!, nameSource: 'other' as never }],
    }).service;
    await expect(
      invalidSource.productRanking(actor, salesRankingQuery.parse(base)),
    ).rejects.toThrow('Origen de nombre de producto inválido');
  });
});

describe('DA-001 E2: consulta agregada de ranking', () => {
  it('usa una sola consulta con orden estático y sin joins multiplicadores', async () => {
    const { repository, statements } = rankingRepository(aggregate);
    const result = await repository.rankingAggregates(actor, rankingInput({ method: 'CASH' }));
    expect(result).toEqual(aggregate);
    const ranking = statements.filter((statement) =>
      statement.text.includes('WITH filtered_sales'),
    );
    expect(ranking).toHaveLength(1);
    const text = normalized(ranking[0]!.text);
    expect(text).toMatch(
      /r\.units_sold DESC,\s*r\.total_cents DESC,\s*r\.name COLLATE "C" ASC,\s*r\.product_id ASC/,
    );
    expect(text).toContain('GROUP BY oi.product_id');
    expect(text).toContain('HAVING sum(oi.quantity) > 0');
    expect(text).toContain('DISTINCT ON (oi.product_id)');
    expect(text).toMatch(/ORDER BY oi\.product_id,\s*fs\.sold_at DESC,\s*oi\.id DESC/);
    expect(text).toContain('jsonb_agg');
    expect(text).not.toContain('order_item_options');
    expect(text).not.toContain('refunds');
    expect(text).not.toContain('payment_events');
    expect(text).not.toContain('payment_incidents');
    expect(text).not.toContain('p.status');
    expect(ranking[0]!.values).toEqual([new Date(base.from), new Date(base.to), 'CASH', 5]);
  });

  it('cambia la dirección y la métrica del orden sin interpolar entrada', async () => {
    const { repository, statements } = rankingRepository({
      matchedProductCount: '0',
      matchedUnitsSold: '0',
      matchedTotalCents: '0',
      items: [],
    });
    const result = await repository.rankingAggregates(
      actor,
      rankingInput({ metric: 'amount', direction: 'bottom', limit: 20 }),
    );
    expect(result.items).toEqual([]);
    const ranking = statements.filter((statement) =>
      statement.text.includes('WITH filtered_sales'),
    );
    expect(ranking).toHaveLength(1);
    const text = normalized(ranking[0]!.text);
    expect(text).toMatch(
      /r\.total_cents ASC,\s*r\.units_sold ASC,\s*r\.name COLLATE "C" ASC,\s*r\.product_id ASC/,
    );
    expect(ranking[0]!.values).toEqual([new Date(base.from), new Date(base.to), 20]);
  });

  it('lanza error interno si la fila agregada no existe', async () => {
    const { repository } = rankingRepository(undefined);
    await expect(repository.rankingAggregates(actor, rankingInput())).rejects.toThrow(
      'Agregado de ranking incompleto',
    );
  });
});
