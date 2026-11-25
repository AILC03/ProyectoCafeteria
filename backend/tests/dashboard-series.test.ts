import { describe, expect, it } from 'vitest';
import {
  buildSalesSeriesBuckets,
  formatTijuanaLocalStart,
  SalesRepository,
  SalesService,
} from '../src/modules/sales/sales.service.js';
import {
  parseSalesSeriesInstant,
  salesSeriesQuery,
} from '../src/modules/sales/sales.validation.js';
import type { Principal } from '../src/modules/auth/auth.types.js';

const actor = {} as Principal;

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    return;
  }
  throw new Error('Se esperaba un error de validación');
}

function parseRange(from: string, to: string) {
  return [parseSalesSeriesInstant(from), parseSalesSeriesInstant(to)] as const;
}

function seriesRepository(
  aggregates: { totalCents: string; ticketCount: string; unitsSold: string }[],
) {
  return {
    seriesAggregates: async () => aggregates,
  } as unknown as SalesRepository;
}

describe('DA-001 E2: entrada y límites de series', () => {
  it('acepta la frontera mínima 2000-01-01T08:00:00.000Z y normaliza fracciones', () => {
    for (const from of [
      '2000-01-01T08:00:00Z',
      '2000-01-01T08:00:00.0Z',
      '2000-01-01T08:00:00.00Z',
      '2000-01-01T08:00:00.000Z',
    ])
      expect(
        salesSeriesQuery.safeParse({
          from,
          to: '2000-01-02T08:00:00.000Z',
          granularity: 'day',
        }).success,
      ).toBe(true);
    expect(
      salesSeriesQuery.safeParse({
        from: '2000-01-01T08:00:00.000Z',
        to: '2010-01-01T08:00:00.000Z',
        granularity: 'day',
      }).success,
    ).toBe(false);
  });

  it('rechaza el inicio anterior al dominio incluso si to cae después', () => {
    for (const from of [
      '2000-01-01T07:59:59.999Z',
      '2000-01-01T00:00:00.000Z',
      '1999-12-31T23:59:59.999Z',
      '0000-01-01T00:00:00.000Z',
    ])
      expect(
        salesSeriesQuery.safeParse({
          from,
          to: '2026-11-24T08:00:00.000Z',
          granularity: 'hour',
        }).success,
      ).toBe(false);
  });

  it('rechaza fracciones de 4–6 dígitos incluso si son ceros', () => {
    for (const from of [
      '2026-11-24T08:00:00.0000Z',
      '2026-11-24T08:00:00.00000Z',
      '2026-11-24T08:00:00.000000Z',
    ])
      expect(
        salesSeriesQuery.safeParse({
          from,
          to: '2026-11-24T09:00:00.000Z',
          granularity: 'hour',
        }).success,
      ).toBe(false);
  });

  it('rechaza fechas imposibles o con formato no aceptado', () => {
    for (const from of [
      '2026-02-30T08:00:00.000Z',
      '2026-13-01T08:00:00.000Z',
      '2026-11-24T24:00:00.000Z',
      '2026-11-24T08:60:00.000Z',
      '2026-11-24T08:00:60.000Z',
      '2026-11-24T08:00:00+01:00',
      '2026-11-24t08:00:00.000z',
      '2026-11-24T08:00:00.000',
      '2026-11-24 08:00:00.000Z',
    ])
      expect(
        salesSeriesQuery.safeParse({
          from,
          to: '2026-11-25T08:00:00.000Z',
          granularity: 'day',
        }).success,
      ).toBe(false);
  });

  it('exige rango positivo, granularidad y método válidos y rechaza extras', () => {
    const base = {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-25T08:00:00.000Z',
      granularity: 'hour',
    };
    expect(salesSeriesQuery.safeParse(base).success).toBe(true);
    expect(salesSeriesQuery.safeParse({ ...base, method: 'CASH' }).success).toBe(true);
    expect(salesSeriesQuery.safeParse({ ...base, to: '2026-11-24T08:00:00.000Z' }).success).toBe(
      false,
    );
    expect(salesSeriesQuery.safeParse({ ...base, to: '2026-11-24T07:59:59.999Z' }).success).toBe(
      false,
    );
    expect(salesSeriesQuery.safeParse({ ...base, granularity: 'week' }).success).toBe(false);
    expect(salesSeriesQuery.safeParse({ ...base, granularity: undefined }).success).toBe(false);
    expect(salesSeriesQuery.safeParse({ ...base, method: '' }).success).toBe(false);
    expect(salesSeriesQuery.safeParse({ ...base, method: 'null' }).success).toBe(false);
    for (const extra of [
      { metric: 'totalCents' },
      { category: '1' },
      { cursor: 'abc' },
      { limit: '20' },
      { timeZone: 'UTC' },
    ])
      expect(salesSeriesQuery.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(
      salesSeriesQuery.safeParse({
        from: ['2026-11-24T08:00:00.000Z', '2026-11-24T08:00:00.000Z'],
        to: base.to,
        granularity: 'hour',
      }).success,
    ).toBe(false);
  });

  it('aplica los dos límites obligatorios por granularidad sin truncar', () => {
    // hour: 31×24 h exactas aceptadas; +1 ms rechazado.
    expect(
      salesSeriesQuery.safeParse({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        granularity: 'hour',
      }).success,
    ).toBe(true);
    expect(
      salesSeriesQuery.safeParse({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.001Z',
        granularity: 'hour',
      }).success,
    ).toBe(false);
    // day: 366×24 h exactas aceptadas; +1 ms rechazado.
    expect(
      salesSeriesQuery.safeParse({
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.000Z',
        granularity: 'day',
      }).success,
    ).toBe(true);
    expect(
      salesSeriesQuery.safeParse({
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.001Z',
        granularity: 'day',
      }).success,
    ).toBe(false);
    // La duración de day excede el máximo de hour aunque no sea día completo.
    expect(
      salesSeriesQuery.safeParse({
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.000Z',
        granularity: 'hour',
      }).success,
    ).toBe(false);
  });
});

describe('DA-001 E2: fronteras naturales y DST', () => {
  it('respeta la frontera mínima de dominio en day', () => {
    const [from, to] = parseRange('2000-01-01T08:00:00.000Z', '2000-01-02T08:00:00.000Z');
    const buckets = buildSalesSeriesBuckets(from, to, 'day');
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      localStart: '2000-01-01T00:00:00-08:00',
      partial: false,
    });
    expect(buckets[0]!.start.toISOString()).toBe('2000-01-01T08:00:00.000Z');
    expect(buckets[0]!.end.toISOString()).toBe('2000-01-02T08:00:00.000Z');
  });

  it('primavera 2026: día de 23 h y sin hora local 02:00', () => {
    const [from, to] = parseRange('2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z');
    const days = buildSalesSeriesBuckets(from, to, 'day');
    expect(days).toHaveLength(1);
    expect(days[0]!.end.getTime() - days[0]!.start.getTime()).toBe(23 * 3_600_000);
    expect(days[0]!.localStart).toBe('2026-03-08T00:00:00-08:00');
    const hours = buildSalesSeriesBuckets(from, to, 'hour');
    expect(hours).toHaveLength(23);
    expect(hours.map((bucket) => bucket.localStart)).toEqual([
      '2026-03-08T00:00:00-08:00',
      '2026-03-08T01:00:00-08:00',
      '2026-03-08T03:00:00-07:00',
      ...Array.from(
        { length: 20 },
        (_, index) => `2026-03-08T${String(index + 4).padStart(2, '0')}:00:00-07:00`,
      ),
    ]);
  });

  it('otoño 2026: día de 25 h y ambas horas 01:00 con start/offset distintos', () => {
    const [from, to] = parseRange('2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z');
    const days = buildSalesSeriesBuckets(from, to, 'day');
    expect(days).toHaveLength(1);
    expect(days[0]!.end.getTime() - days[0]!.start.getTime()).toBe(25 * 3_600_000);
    expect(days[0]!.localStart).toBe('2026-11-01T00:00:00-07:00');
    const hours = buildSalesSeriesBuckets(from, to, 'hour');
    expect(hours).toHaveLength(25);
    const repeated = hours.filter((bucket) => bucket.localStart.startsWith('2026-11-01T01:00:00'));
    expect(repeated.map((bucket) => bucket.localStart)).toEqual([
      '2026-11-01T01:00:00-07:00',
      '2026-11-01T01:00:00-08:00',
    ]);
    expect(repeated.map((bucket) => bucket.start.toISOString())).toEqual([
      '2026-11-01T08:00:00.000Z',
      '2026-11-01T09:00:00.000Z',
    ]);
  });

  it('calcula límites efectivos y partial por recorte de rango', () => {
    const [from, to] = parseRange('2026-11-24T08:15:00.000Z', '2026-11-24T09:15:00.000Z');
    const buckets = buildSalesSeriesBuckets(from, to, 'hour');
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ partial: true });
    expect(buckets[0]!.effectiveFrom.toISOString()).toBe('2026-11-24T08:15:00.000Z');
    expect(buckets[0]!.effectiveTo.toISOString()).toBe('2026-11-24T09:00:00.000Z');
    expect(buckets[1]!.effectiveFrom.toISOString()).toBe('2026-11-24T09:00:00.000Z');
    expect(buckets[1]!.effectiveTo.toISOString()).toBe('2026-11-24T09:15:00.000Z');
    const aligned = buildSalesSeriesBuckets(
      ...parseRange('2026-11-24T08:00:00.000Z', '2026-11-24T09:00:00.000Z'),
      'hour',
    );
    expect(aligned).toHaveLength(1);
    expect(aligned[0]!.partial).toBe(false);
  });

  it('aplica la guarda de 368 buckets day sin truncar', () => {
    expect(
      buildSalesSeriesBuckets(
        ...parseRange('2024-01-01T08:00:00.000Z', '2025-01-03T08:00:00.000Z'),
        'day',
      ),
    ).toHaveLength(368);
    expectInvalid(() =>
      buildSalesSeriesBuckets(
        ...parseRange('2024-01-01T08:00:00.000Z', '2025-01-04T08:00:00.000Z'),
        'day',
      ),
    );
  });

  it('cuenta 744/745 buckets hour y 366 buckets day sin truncar', () => {
    expect(
      buildSalesSeriesBuckets(
        ...parseRange('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
        'hour',
      ),
    ).toHaveLength(744);
    expect(
      buildSalesSeriesBuckets(
        ...parseRange('2026-01-01T00:30:00.000Z', '2026-02-01T00:30:00.000Z'),
        'hour',
      ),
    ).toHaveLength(745);
    expect(
      buildSalesSeriesBuckets(
        ...parseRange('2024-01-01T08:00:00.000Z', '2025-01-01T08:00:00.000Z'),
        'day',
      ),
    ).toHaveLength(366);
  });

  it('rechaza límites naturales fuera de 2000–9999 sin truncar', () => {
    expectInvalid(() =>
      buildSalesSeriesBuckets(
        ...parseRange('9999-12-31T08:00:00.000Z', '9999-12-31T20:00:00.000Z'),
        'day',
      ),
    );
    expectInvalid(() =>
      buildSalesSeriesBuckets(
        ...parseRange('9999-12-31T23:00:00.000Z', '9999-12-31T23:30:00.000Z'),
        'hour',
      ),
    );
  });

  it('formatea localStart con el offset IANA exacto', () => {
    expect(formatTijuanaLocalStart(new Date('2026-11-24T08:00:00.000Z'))).toBe(
      '2026-11-24T00:00:00-08:00',
    );
    expect(formatTijuanaLocalStart(new Date('2026-03-08T10:00:00.000Z'))).toBe(
      '2026-03-08T03:00:00-07:00',
    );
  });
});

describe('DA-001 E2: DTO y agregados exactos', () => {
  it('suma agregados grandes sin Number y concilia con buckets vacíos', async () => {
    const service = new SalesService(
      seriesRepository([
        { totalCents: '9007199254740993', ticketCount: '1', unitsSold: '2' },
        { totalCents: '0', ticketCount: '0', unitsSold: '0' },
        { totalCents: '2', ticketCount: '1', unitsSold: '1' },
      ]),
      () => new Date('2026-11-24T18:30:00.000Z'),
    );
    const result = await service.salesSeries(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-24T11:00:00.000Z',
      granularity: 'hour',
    });
    expect(result.data.generatedAt).toBe('2026-11-24T18:30:00.000Z');
    expect(result.data.period).toEqual({
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-24T11:00:00.000Z',
      timeZone: 'America/Tijuana',
    });
    expect(result.data.method).toBeNull();
    expect(result.data.bucketCount).toBe('3');
    expect(result.data.totals).toEqual({
      totalCents: '9007199254740995',
      ticketCount: '2',
      unitsSold: '3',
    });
    expect(result.data.buckets[1]).toMatchObject({
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
      partial: false,
    });
  });

  it('hace eco del método, granularidad y bucket vacío completo', async () => {
    const service = new SalesService(
      seriesRepository([{ totalCents: '0', ticketCount: '0', unitsSold: '0' }]),
      () => new Date('2026-11-24T18:30:00.000Z'),
    );
    const result = await service.salesSeries(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-24T09:00:00.000Z',
      granularity: 'hour',
      method: 'STRIPE',
    });
    expect(result.data.method).toBe('STRIPE');
    expect(result.data.granularity).toBe('hour');
    expect(result.data.totals).toEqual({
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
    });
    expect(result.data.buckets[0]).toEqual({
      start: '2026-11-24T08:00:00.000Z',
      end: '2026-11-24T09:00:00.000Z',
      localStart: '2026-11-24T00:00:00-08:00',
      effectiveFrom: '2026-11-24T08:00:00.000Z',
      effectiveTo: '2026-11-24T09:00:00.000Z',
      partial: false,
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
    });
  });

  it('no inventa ceros si falta una fila agregada', async () => {
    const service = new SalesService(
      seriesRepository([]),
      () => new Date('2026-11-24T18:30:00.000Z'),
    );
    await expect(
      service.salesSeries(actor, {
        from: '2026-11-24T08:00:00.000Z',
        to: '2026-11-24T09:00:00.000Z',
        granularity: 'hour',
      }),
    ).rejects.toThrow('Agregado de serie incompleto');
  });
});

describe('DA-001 E2: repositorio de series', () => {
  it('realiza una sola agregación aunque haya 745 buckets, sin N+1', async () => {
    const statements: string[] = [];
    const transaction = {
      $queryRaw: async (first: unknown) => {
        const text = Array.isArray(first)
          ? String(first[0])
          : typeof first === 'object' && first !== null && 'sql' in first
            ? String((first as { sql: string }).sql)
            : '';
        statements.push(text);
        if (text.includes('WITH buckets'))
          return Array.from({ length: 745 }, (_, index) =>
            index === 0
              ? { idx: 0, totalCents: '5', ticketCount: '1', unitsSold: '1' }
              : { idx: index, totalCents: '0', ticketCount: '0', unitsSold: '0' },
          );
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
    const database = {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(transaction),
    };
    const repository = new SalesRepository(database as never);
    const [from, to] = parseRange('2026-01-01T00:30:00.000Z', '2026-02-01T00:30:00.000Z');
    const buckets = buildSalesSeriesBuckets(from, to, 'hour');
    expect(buckets).toHaveLength(745);
    const aggregates = await repository.seriesAggregates(
      { userId: 1n, sessionId: 1n } as Principal,
      { from: new Date(from), to: new Date(to) },
      buckets,
    );
    expect(aggregates).toHaveLength(745);
    expect(aggregates[0]).toEqual({
      totalCents: '5',
      ticketCount: '1',
      unitsSold: '1',
    });
    expect(statements.filter((text) => text.includes('WITH buckets'))).toHaveLength(1);
  });

  it('lanza error interno si falta la fila de un bucket (R-03)', async () => {
    const transaction = {
      $queryRaw: async (first: unknown) => {
        const text = Array.isArray(first)
          ? String(first[0])
          : typeof first === 'object' && first !== null && 'sql' in first
            ? String((first as { sql: string }).sql)
            : '';
        if (text.includes('WITH buckets'))
          return [{ idx: 0, totalCents: '5', ticketCount: '1', unitsSold: '1' }];
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
    const database = {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(transaction),
    };
    const repository = new SalesRepository(database as never);
    const [from, to] = parseRange('2026-11-24T08:00:00.000Z', '2026-11-24T11:00:00.000Z');
    const buckets = buildSalesSeriesBuckets(from, to, 'hour');
    expect(buckets).toHaveLength(3);
    await expect(
      repository.seriesAggregates(
        { userId: 1n, sessionId: 1n } as Principal,
        { from: new Date(from), to: new Date(to) },
        buckets,
      ),
    ).rejects.toThrow('Agregado de serie incompleto');
  });
});
