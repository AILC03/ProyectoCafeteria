import { describe, expect, it } from 'vitest';
import {
  SalesRepository,
  SalesService,
  formatSharePercent,
} from '../src/modules/sales/sales.service.js';
import type {
  SalesCategoryParticipationAggregate,
  SalesCategoryParticipationInput,
} from '../src/modules/sales/sales.read.repository.js';
import { salesCategoryParticipationQuery } from '../src/modules/sales/sales.validation.js';
import type { Principal } from '../src/modules/auth/auth.types.js';

const actor = { userId: 1n, sessionId: 1n } as Principal;
const base = {
  from: '2031-06-01T08:00:00.000Z',
  to: '2031-06-02T08:00:00.000Z',
  metric: 'units',
} as const;

function categoryService(aggregate: SalesCategoryParticipationAggregate | undefined) {
  const calls: unknown[][] = [];
  const repository = {
    categoryParticipation: async (...args: unknown[]) => {
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

function categoryRepository(row: SalesCategoryParticipationAggregate | undefined) {
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

function participationInput(
  overrides: Partial<SalesCategoryParticipationInput> = {},
): SalesCategoryParticipationInput {
  return {
    from: new Date(base.from),
    to: new Date(base.to),
    metric: 'units',
    ...overrides,
  };
}

const aggregate: SalesCategoryParticipationAggregate = {
  inconsistentRows: '0',
  denominatorUnitsSold: '9007199254740993',
  denominatorTotalCents: '9007199254740993',
  totalCategories: '2',
  items: [
    {
      categoryId: '22',
      name: 'Grande B',
      isActive: true,
      unitsSold: '6004799503160662',
      totalCents: '6004799503160662',
    },
    {
      categoryId: '21',
      name: 'Grande A',
      isActive: false,
      unitsSold: '3002399751580331',
      totalCents: '3002399751580331',
    },
  ],
};

describe('DA-001 E2-13: porcentaje half-up en backend (bigint)', () => {
  it('redondea 1/6, 1/8, tercios y extremos con dos decimales', () => {
    expect(formatSharePercent(1n, 6n)).toBe('16.67');
    expect(formatSharePercent(1n, 8n)).toBe('12.50');
    expect(formatSharePercent(1n, 3n)).toBe('33.33');
    expect(formatSharePercent(2n, 3n)).toBe('66.67');
    expect(formatSharePercent(100n, 100n)).toBe('100.00');
    expect(formatSharePercent(0n, 100n)).toBe('0.00');
    expect(formatSharePercent(1n, 10000n)).toBe('0.01');
  });

  it('aplica half-up en el empate exacto de centésimas', () => {
    // 1/32 = 3.125% → 312.5 centésimas → 313 → 3.13.
    expect(formatSharePercent(1n, 32n)).toBe('3.13');
    // 1/200 = 0.5% exacto, sin empate en centésimas.
    expect(formatSharePercent(1n, 200n)).toBe('0.50');
  });

  it('no normaliza a 100.00: tres tercios suman 99.99', () => {
    const thirds = [
      formatSharePercent(1n, 3n),
      formatSharePercent(1n, 3n),
      formatSharePercent(1n, 3n),
    ];
    const centesimas = thirds.reduce((total, value) => total + BigInt(value.replace('.', '')), 0n);
    expect(centesimas).toBe(9999n);
    expect(thirds).toEqual(['33.33', '33.33', '33.33']);
  });

  it('calcula con bigint mayores que Number.MAX_SAFE_INTEGER sin pérdida', () => {
    expect(formatSharePercent(6004799503160662n, 9007199254740993n)).toBe('66.67');
    expect(formatSharePercent(3002399751580331n, 9007199254740993n)).toBe('33.33');
  });

  it('usa 0.00 con base cero sobre ítems conservados y rechaza incoherencias', () => {
    expect(formatSharePercent(0n, 0n)).toBe('0.00');
    expect(() => formatSharePercent(1n, 0n)).toThrow('Porcentaje de categoría sin base');
    expect(() => formatSharePercent(2n, 1n)).toThrow('Porcentaje de categoría fuera de rango');
    expect(() => formatSharePercent(-1n, 2n)).toThrow('Porcentaje de categoría inválido');
  });
});

describe('DA-001 E2-13: entrada estricta de participación por categorías', () => {
  it('exige metric sin default y acepta units/amount con method opcional', () => {
    expect(salesCategoryParticipationQuery.parse(base)).toEqual(base);
    expect(salesCategoryParticipationQuery.safeParse({ ...base, metric: 'amount' }).success).toBe(
      true,
    );
    expect(salesCategoryParticipationQuery.safeParse({ ...base, method: 'CASH' }).success).toBe(
      true,
    );
    expect(salesCategoryParticipationQuery.safeParse({ ...base, method: 'STRIPE' }).success).toBe(
      true,
    );
    expect(salesCategoryParticipationQuery.safeParse({ ...base, metric: undefined }).success).toBe(
      false,
    );
  });

  it('rechaza métrica y método inválidos, vacíos o falsos literales', () => {
    for (const metric of ['both', 'totalCents', 'UNIT', '', undefined, null])
      expect(
        salesCategoryParticipationQuery.safeParse({ ...base, metric }).success,
        String(metric),
      ).toBe(false);
    for (const method of ['', 'null', 'CARD', 'cash', null])
      expect(
        salesCategoryParticipationQuery.safeParse({ ...base, method }).success,
        String(method),
      ).toBe(false);
  });

  it('rechaza filtro de categoría, extras, arrays y repetidos', () => {
    for (const extra of [
      { category: '1' },
      { categoryId: '1' },
      { top: '5' },
      { direction: 'top' },
      { limit: '20' },
      { cursor: 'abc' },
      { granularity: 'day' },
      { timeZone: 'UTC' },
      { order: 'asc' },
      { sort: 'name' },
      { includeZeroSales: 'true' },
      { includeInactive: 'true' },
    ])
      expect(
        salesCategoryParticipationQuery.safeParse({ ...base, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    expect(
      salesCategoryParticipationQuery.safeParse({ ...base, from: [base.from, base.from] }).success,
    ).toBe(false);
    expect(salesCategoryParticipationQuery.safeParse({ ...base, method: ['CASH'] }).success).toBe(
      false,
    );
    expect(
      salesCategoryParticipationQuery.safeParse({ ...base, ['from[]']: base.from }).success,
    ).toBe(false);
    expect(salesCategoryParticipationQuery.safeParse({}).success).toBe(false);
  });

  it('acepta 0–3 decimales y rechaza 4–6, offsets y fechas imposibles', () => {
    for (const [from, to] of [
      ['2031-06-01T08:00:00Z', '2031-06-01T09:00:00Z'],
      ['2031-06-01T08:00:00.1Z', '2031-06-01T09:00:00.1Z'],
      ['2031-06-01T08:00:00.10Z', '2031-06-01T09:00:00.12Z'],
      ['2031-06-01T08:00:00.123Z', '2031-06-01T09:00:00.123Z'],
      ['2000-01-01T08:00:00Z', '2000-01-02T08:00:00.000Z'],
    ] as const)
      expect(
        salesCategoryParticipationQuery.safeParse({ ...base, from, to }).success,
        `${from} → ${to}`,
      ).toBe(true);
    for (const from of [
      '2000-01-01T07:59:59.999Z',
      '1999-12-31T23:59:59.999Z',
      '2031-06-01T08:00:00.0000Z',
      '2031-06-01T08:00:00.000000Z',
      '2031-02-30T08:00:00.000Z',
      '2031-13-01T08:00:00.000Z',
      '2031-06-01T24:00:00.000Z',
      '2031-06-01T08:60:00.000Z',
      '2031-06-01T08:00:60.000Z',
      '2031-06-01T08:00:00+01:00',
      '2031-06-01t08:00:00.000z',
    ])
      expect(salesCategoryParticipationQuery.safeParse({ ...base, from }).success, from).toBe(
        false,
      );
  });

  it('exige from<to y 366 días absolutos sin truncar', () => {
    expect(
      salesCategoryParticipationQuery.safeParse({
        ...base,
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      salesCategoryParticipationQuery.safeParse({
        ...base,
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.001Z',
      }).success,
    ).toBe(false);
    expect(salesCategoryParticipationQuery.safeParse({ ...base, to: base.from }).success).toBe(
      false,
    );
    expect(
      salesCategoryParticipationQuery.safeParse({
        ...base,
        from: '2031-06-02T08:00:00.000Z',
        to: '2031-06-01T08:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('DA-001 E2-13: DTO y porcentajes del servicio', () => {
  it('compone DTO cerrado, conserva orden y calcula sharePercent con bigint', async () => {
    const { service, calls } = categoryService(aggregate);
    const result = await service.categoryParticipation(
      actor,
      salesCategoryParticipationQuery.parse(base),
    );
    expect(result.data).toEqual({
      generatedAt: '2026-11-25T18:30:00.000Z',
      currency: 'MXN',
      period: { from: base.from, to: base.to, timeZone: 'America/Tijuana' },
      method: null,
      metric: 'units',
      denominator: {
        unitsSold: '9007199254740993',
        totalCents: '9007199254740993',
      },
      totalCategories: '2',
      items: [
        {
          categoryId: '22',
          name: 'Grande B',
          isActive: true,
          unitsSold: '6004799503160662',
          totalCents: '6004799503160662',
          sharePercent: '66.67',
        },
        {
          categoryId: '21',
          name: 'Grande A',
          isActive: false,
          unitsSold: '3002399751580331',
          totalCents: '3002399751580331',
          sharePercent: '33.33',
        },
      ],
    });
    expect(calls).toEqual([
      [
        actor,
        {
          from: new Date(base.from),
          to: new Date(base.to),
          metric: 'units',
        },
      ],
    ]);
  });

  it('usa la métrica seleccionada como denominador y hace eco del método', async () => {
    const { service } = categoryService({
      inconsistentRows: '0',
      denominatorUnitsSold: '12',
      denominatorTotalCents: '36000',
      totalCategories: '2',
      items: [
        {
          categoryId: '3',
          name: 'Cafés',
          isActive: true,
          unitsSold: '8',
          totalCents: '26000',
        },
        {
          categoryId: '5',
          name: 'Panadería',
          isActive: false,
          unitsSold: '4',
          totalCents: '10000',
        },
      ],
    });
    const units = await service.categoryParticipation(
      actor,
      salesCategoryParticipationQuery.parse({ ...base, method: 'CASH' }),
    );
    expect(units.data.method).toBe('CASH');
    expect(units.data.items.map((item) => item.sharePercent)).toEqual(['66.67', '33.33']);
    const amount = await service.categoryParticipation(
      actor,
      salesCategoryParticipationQuery.parse({ ...base, metric: 'amount' }),
    );
    expect(amount.data.metric).toBe('amount');
    expect(amount.data.items.map((item) => item.sharePercent)).toEqual(['72.22', '27.78']);
  });

  it('conserva ítems y devuelve 0.00 con base cero en metric=amount', async () => {
    const { service } = categoryService({
      inconsistentRows: '0',
      denominatorUnitsSold: '3',
      denominatorTotalCents: '0',
      totalCategories: '2',
      items: [
        { categoryId: '8', name: 'Gratis A', isActive: true, unitsSold: '2', totalCents: '0' },
        { categoryId: '9', name: 'Gratis B', isActive: true, unitsSold: '1', totalCents: '0' },
      ],
    });
    const result = await service.categoryParticipation(
      actor,
      salesCategoryParticipationQuery.parse({ ...base, metric: 'amount' }),
    );
    expect(result.data.items.map((item) => item.sharePercent)).toEqual(['0.00', '0.00']);
    expect(result.data.denominator).toEqual({ unitsSold: '3', totalCents: '0' });
  });

  it('devuelve items vacío y denominadores cero sin inventar categorías', async () => {
    const { service } = categoryService({
      inconsistentRows: '0',
      denominatorUnitsSold: '0',
      denominatorTotalCents: '0',
      totalCategories: '0',
      items: [],
    });
    const result = await service.categoryParticipation(
      actor,
      salesCategoryParticipationQuery.parse(base),
    );
    expect(result.data.items).toEqual([]);
    expect(result.data.totalCategories).toBe('0');
    expect(result.data.denominator).toEqual({ unitsSold: '0', totalCents: '0' });
  });

  it('falla explícitamente si falta el agregado, hay integridad o sumas incoherentes', async () => {
    await expect(
      categoryService(undefined).service.categoryParticipation(
        actor,
        salesCategoryParticipationQuery.parse(base),
      ),
    ).rejects.toThrow('Agregado de participación por categorías incompleto');
    await expect(
      categoryService({ ...aggregate, inconsistentRows: '1' }).service.categoryParticipation(
        actor,
        salesCategoryParticipationQuery.parse(base),
      ),
    ).rejects.toThrow('Integridad de categorías no resoluble');
    await expect(
      categoryService({
        ...aggregate,
        denominatorUnitsSold: '9007199254740994',
      }).service.categoryParticipation(actor, salesCategoryParticipationQuery.parse(base)),
    ).rejects.toThrow('Agregado de participación por categorías incoherente');
    await expect(
      categoryService({ ...aggregate, totalCategories: '3' }).service.categoryParticipation(
        actor,
        salesCategoryParticipationQuery.parse(base),
      ),
    ).rejects.toThrow('Agregado de participación por categorías incoherente');
    await expect(
      categoryService({
        ...aggregate,
        items: [{ ...aggregate.items[0]!, categoryId: '0' }],
      }).service.categoryParticipation(actor, salesCategoryParticipationQuery.parse(base)),
    ).rejects.toThrow('Categoría de participación incompleta');
  });
});

describe('DA-001 E2-13: consulta agregada de participación', () => {
  it('usa una sola consulta, categoría actual y sin joins multiplicadores', async () => {
    const { repository, statements } = categoryRepository(aggregate);
    const result = await repository.categoryParticipation(
      actor,
      participationInput({ method: 'CASH' }),
    );
    expect(result).toEqual(aggregate);
    const aggregation = statements.filter((statement) =>
      statement.text.includes('WITH filtered_sales'),
    );
    expect(aggregation).toHaveLength(1);
    const text = normalized(aggregation[0]!.text);
    expect(text).toContain('JOIN order_items oi ON oi.order_id = fs.order_id');
    expect(text).toContain('LEFT JOIN products pr ON pr.id = oi.product_id');
    expect(text).toContain('LEFT JOIN categories c ON c.id = pr.category_id');
    expect(text).toContain('GROUP BY current_category_id, category_name, category_is_active');
    expect(text).toContain('count(*) FILTER');
    expect(text).toContain('category_deleted_at IS NOT NULL');
    expect(text).toMatch(
      /ORDER BY ct\.units_sold DESC, ct\.name COLLATE "C" ASC, ct\.category_id ASC/,
    );
    expect(text).toContain('jsonb_agg');
    expect(text).not.toContain('order_item_options');
    expect(text).not.toContain('refunds');
    expect(text).not.toContain('payment_events');
    expect(text).not.toContain('payment_incidents');
    expect(text).not.toContain('p.status');
    expect(aggregation[0]!.values).toEqual([new Date(base.from), new Date(base.to), 'CASH']);
  });

  it('cambia el orden primario a importes sin interpolar entrada', async () => {
    const { repository, statements } = categoryRepository({
      inconsistentRows: '0',
      denominatorUnitsSold: '0',
      denominatorTotalCents: '0',
      totalCategories: '0',
      items: [],
    });
    const result = await repository.categoryParticipation(
      actor,
      participationInput({ metric: 'amount', to: new Date(base.to) }),
    );
    expect(result.items).toEqual([]);
    const aggregation = statements.filter((statement) =>
      statement.text.includes('WITH filtered_sales'),
    );
    expect(aggregation).toHaveLength(1);
    expect(normalized(aggregation[0]!.text)).toMatch(
      /ORDER BY ct\.total_cents DESC, ct\.name COLLATE "C" ASC, ct\.category_id ASC/,
    );
    expect(aggregation[0]!.values).toEqual([new Date(base.from), new Date(base.to)]);
  });

  it('lanza error interno si la fila agregada no existe', async () => {
    const { repository } = categoryRepository(undefined);
    await expect(repository.categoryParticipation(actor, participationInput())).rejects.toThrow(
      'Agregado de participación por categorías incompleto',
    );
  });
});
