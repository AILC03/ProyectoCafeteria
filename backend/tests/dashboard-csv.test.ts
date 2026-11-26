import { describe, expect, it } from 'vitest';
import { neutralizeFormula, serializeCsv } from '../src/shared/http/csv.js';
import {
  buildCategoryCsv,
  buildNoMovementCsv,
  buildRankingCsv,
  buildSalesCsv,
  buildSeriesCsv,
} from '../src/modules/sales/sales.export.js';
import {
  buildSalesSeriesBuckets,
  SalesRepository,
  SalesService,
} from '../src/modules/sales/sales.service.js';
import {
  parseSalesSeriesInstant,
  salesExportQuery,
} from '../src/modules/sales/sales.validation.js';
import type { SalesExportRow } from '../src/modules/sales/sales.read.repository.js';
import type { Principal } from '../src/modules/auth/auth.types.js';

const actor = { userId: 1n, sessionId: 1n } as Principal;
const period = {
  from: new Date('2026-11-24T08:00:00.000Z'),
  to: new Date('2026-11-25T08:00:00.000Z'),
};
const generatedAt = '2026-11-25T18:30:00.000Z';

function text(body: Buffer): string {
  return body.toString('utf8');
}

function lines(body: Buffer): string[] {
  return text(body)
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .slice(0, -1);
}

function sale(overrides: Partial<SalesExportRow> = {}): SalesExportRow {
  return {
    saleId: '1',
    saleNumber: 'V000001',
    orderId: '101',
    paymentId: '201',
    soldAtUtc: '2026-11-24T16:00:00.123456Z',
    soldAtLocal: '2026-11-24T08:00:00.123456-08:00',
    method: 'CASH',
    orderStatus: 'LISTO',
    totalCents: '4000',
    unitsSold: '2',
    lineCount: '2',
    ...overrides,
  };
}

function expectLimit(fn: () => Promise<unknown>) {
  return expect(fn()).rejects.toMatchObject({ status: 400, code: 'EXPORT_LIMIT_EXCEEDED' });
}

describe('CSV-01: serializador RFC 4180, BOM y antifórmulas', () => {
  it('emite BOM, CRLF final, metadatos antes del encabezado y comillas RFC', () => {
    const body = serializeCsv(
      [
        ['rowOrder', 'soldAtUtc ASC, saleId ASC'],
        ['generatedAt', generatedAt],
      ],
      ['id', 'name'],
      [
        ['1', { text: 'Café "La Especial", S.A.' }],
        ['2', { text: 'línea\ncon salto' }],
      ],
    );
    expect(body[0]).toBe(0xef);
    expect(body[1]).toBe(0xbb);
    expect(body[2]).toBe(0xbf);
    const raw = text(body);
    expect(raw.startsWith('\uFEFF#meta,rowOrder,"soldAtUtc ASC, saleId ASC"\r\n')).toBe(true);
    expect(raw.endsWith('\r\n')).toBe(true);
    expect(lines(body)).toEqual([
      '#meta,rowOrder,"soldAtUtc ASC, saleId ASC"',
      `#meta,generatedAt,${generatedAt}`,
      'id,name',
      '1,"Café ""La Especial"", S.A."',
      '2,"línea\ncon salto"',
    ]);
  });

  it('neutraliza fórmulas solo en texto, incluidos tab/CR/LF y espacios iniciales', () => {
    for (const value of ['=1+1', '+cmd', '-Moka', '@SUM(A1)', '\tcmd', '\rcmd', '\ncmd', '  =1'])
      expect(neutralizeFormula(value)).toBe(`'${value}`);
    expect(neutralizeFormula('Moka')).toBe('Moka');
    expect(neutralizeFormula('  Moka')).toBe('  Moka');
    const body = serializeCsv(
      [],
      ['texto', 'importe', 'id'],
      [[{ text: '-Moka' }, '-500', '9007199254740993']],
    );
    expect(lines(body)).toContain("'-Moka,-500,9007199254740993");
  });

  it('no altera importes, IDs ni fechas de seis decimales', () => {
    const body = serializeCsv(
      [],
      ['id', 'total', 'soldAt'],
      [['9007199254740993', '9999900', '2026-11-24T16:00:00.123456Z']],
    );
    expect(lines(body)).toContain('9007199254740993,9999900,2026-11-24T16:00:00.123456Z');
  });
});

describe('CSV-01: contenido por exportación', () => {
  it('ventas: una fila por Sale, orden conservado, totales y nombre ASCII', () => {
    const file = buildSalesCsv(period, undefined, generatedAt, {
      rows: [
        sale(),
        sale({
          saleId: '2',
          saleNumber: 'V000002',
          soldAtUtc: '2026-11-24T17:00:00.000001Z',
          soldAtLocal: '2026-11-24T09:00:00.000001-08:00',
          orderStatus: 'EN_PREPARACION',
          totalCents: '4500',
          unitsSold: '1',
          lineCount: '1',
        }),
      ],
      totals: { totalCents: 8500n, unitsSold: 3n, lineCount: 3n },
    });
    expect(file.filename).toBe('dashboard-sales-20261124T080000Z-20261125T080000Z-all.csv');
    const body = lines(file.body);
    expect(body).toContain('#meta,export,sales-export');
    expect(body).toContain('#meta,method,all');
    expect(body).toContain('#meta,rowOrder,"soldAtUtc ASC, saleId ASC"');
    expect(body).toContain('#meta,rowCount,2');
    expect(body).toContain('#meta,rowLimit,20000');
    expect(body).toContain('#meta,totals.totalCents,8500');
    expect(body).toContain('#meta,totals.unitsSold,3');
    expect(body).toContain('#meta,totals.lineCount,3');
    expect(body).toContain(
      'saleId,saleNumber,orderId,paymentId,soldAtUtc,soldAtLocal,method,orderStatus,currency,totalCents,unitsSold,lineCount',
    );
    expect(body.at(-2)).toContain('2026-11-24T16:00:00.123456Z');
    expect(body.at(-1)).toContain('2026-11-24T17:00:00.000001Z');
    expect(body.at(-1)).toContain('V000002');
  });

  it('ventas: antifórmulas en method/orderStatus inyectados no alteran importe, unidades ni ID', () => {
    const file = buildSalesCsv(period, undefined, generatedAt, {
      rows: [
        sale({
          saleId: '9007199254740993',
          method: '=cmd' as SalesExportRow['method'],
          orderStatus: '+LISTO',
          totalCents: '4000',
          unitsSold: '2',
          lineCount: '2',
        }),
      ],
      totals: { totalCents: 4000n, unitsSold: 2n, lineCount: 2n },
    });
    const dataLine = lines(file.body).at(-1)!;
    expect(dataLine).toContain("'=cmd");
    expect(dataLine).toContain("'+LISTO");
    expect(dataLine.startsWith('9007199254740993,')).toBe(true);
    expect(dataLine.endsWith(',4000,2,2')).toBe(true);
  });

  it('series: siempre incluye buckets vacíos y suma las tres métricas', () => {
    const file = buildSeriesCsv(
      { from: new Date('2026-11-24T08:00:00.000Z'), to: new Date('2026-11-24T10:00:00.000Z') },
      'STRIPE',
      generatedAt,
      'hour',
      [
        {
          start: '2026-11-24T08:00:00.000Z',
          end: '2026-11-24T09:00:00.000Z',
          localStart: '2026-11-24T00:00:00-08:00',
          effectiveFrom: '2026-11-24T08:00:00.000Z',
          effectiveTo: '2026-11-24T09:00:00.000Z',
          partial: false,
          totalCents: '0',
          ticketCount: '0',
          unitsSold: '0',
        },
        {
          start: '2026-11-24T09:00:00.000Z',
          end: '2026-11-24T10:00:00.000Z',
          localStart: '2026-11-24T01:00:00-08:00',
          effectiveFrom: '2026-11-24T09:00:00.000Z',
          effectiveTo: '2026-11-24T10:00:00.000Z',
          partial: false,
          totalCents: '5',
          ticketCount: '1',
          unitsSold: '2',
        },
      ],
    );
    const body = lines(file.body);
    expect(file.filename).toContain('-hour-stripe.csv');
    expect(body).toContain('#meta,granularity,hour');
    expect(body).toContain('#meta,bucketCount,2');
    expect(body).toContain('#meta,totals.totalCents,5');
    expect(body).toContain('#meta,rowLimit,745');
    expect(body).toContain(
      '1,2026-11-24T08:00:00.000Z,2026-11-24T09:00:00.000Z,2026-11-24T00:00:00-08:00,2026-11-24T08:00:00.000Z,2026-11-24T09:00:00.000Z,false,0,0,0',
    );
  });

  it('ranking: exporta exactamente el corte y conserva metadatos del conjunto', () => {
    const file = buildRankingCsv(period, 'CASH', generatedAt, {
      metric: 'units',
      direction: 'top',
      top: '5',
      matchedProductCount: '6',
      matchedUnitsSold: '12',
      matchedTotalCents: '34500',
      items: [
        {
          productId: '10',
          name: 'Café "La Especial", S.A.',
          nameSource: 'current',
          unitsSold: '6',
          totalCents: '21000',
        },
        {
          productId: '11',
          name: '=1+1',
          nameSource: 'snapshot',
          unitsSold: '3',
          totalCents: '8500',
        },
      ],
    });
    const body = lines(file.body);
    expect(file.filename).toBe(
      'dashboard-product-ranking-20261124T080000Z-20261125T080000Z-units-top5-cash.csv',
    );
    expect(body).toContain('#meta,top,5');
    expect(body).toContain('#meta,matchedProductCount,6');
    expect(body).toContain('#meta,matchedTotals.unitsSold,12');
    expect(body).toContain('#meta,truncated,true');
    expect(body).toContain('#meta,rowCount,2');
    expect(body).toContain('#meta,rowLimit,20');
    expect(body).toContain('1,10,"Café ""La Especial"", S.A.",current,6,21000');
    expect(body).toContain("2,11,'=1+1,snapshot,3,8500");
  });

  it('sin movimiento: conjunto completo, orden del repositorio y fechas PostgreSQL', () => {
    const file = buildNoMovementCsv(period, undefined, generatedAt, 'definition', [
      {
        productId: '12',
        name: 'Moka',
        categoryId: '3',
        categoryName: 'Cafés',
        isAvailable: false,
        createdAt: '2026-11-20T17:30:00.123456Z',
        createdAtLocal: '2026-11-20T09:30:00.123456-08:00',
      },
    ]);
    const body = lines(file.body);
    expect(file.filename).toContain('-no-movement-');
    expect(body).toContain('#meta,universe.definition,definition');
    expect(body).toContain('#meta,universe.includesUnavailable,true');
    expect(body).toContain('#meta,totalNoMovementProducts,1');
    expect(body).toContain('#meta,rowLimit,2000');
    expect(body).toContain(
      '12,Moka,3,Cafés,false,2026-11-20T17:30:00.123456Z,2026-11-20T09:30:00.123456-08:00',
    );
  });

  it('categorías: conserva sharePercent backend sin normalizar a 100', () => {
    const file = buildCategoryCsv(period, undefined, generatedAt, {
      metric: 'amount',
      denominatorUnitsSold: '3',
      denominatorTotalCents: '3',
      totalCategories: '3',
      items: [
        {
          categoryId: '3',
          name: 'Cafés',
          isActive: true,
          unitsSold: '1',
          totalCents: '1',
          sharePercent: '33.33',
        },
        {
          categoryId: '5',
          name: 'Panadería',
          isActive: false,
          unitsSold: '1',
          totalCents: '1',
          sharePercent: '33.33',
        },
        {
          categoryId: '7',
          name: 'Postres',
          isActive: true,
          unitsSold: '1',
          totalCents: '1',
          sharePercent: '33.33',
        },
      ],
    });
    const body = lines(file.body);
    expect(file.filename).toContain('-amount-all.csv');
    expect(body).toContain('#meta,denominator.totalCents,3');
    expect(body).toContain('#meta,totalCategories,3');
    expect(body).toContain('#meta,rowLimit,1000');
    expect(body.filter((line) => line.endsWith(',33.33'))).toHaveLength(3);
  });
});

describe('CSV-01: entrada estricta', () => {
  const base = {
    from: '2026-11-24T08:00:00.000Z',
    to: '2026-11-25T08:00:00.000Z',
  };
  it('acepta from/to/method y rechaza extras, tokens, arrays, vacíos y body implícito', () => {
    expect(salesExportQuery.parse(base)).toEqual(base);
    expect(salesExportQuery.safeParse({ ...base, method: 'CASH' }).success).toBe(true);
    for (const extra of [
      { token: 'x' },
      { access_token: 'x' },
      { jwt: 'x' },
      { cursor: 'x' },
      { limit: '20' },
      { page: '1' },
      { offset: '0' },
      { top: '5' },
      { metric: 'units' },
      { direction: 'top' },
      { category: '1' },
      { timeZone: 'UTC' },
      { sort: 'name' },
      { order: 'asc' },
    ])
      expect(salesExportQuery.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(salesExportQuery.safeParse({ ...base, method: '' }).success).toBe(false);
    expect(salesExportQuery.safeParse({ ...base, method: ['CASH'] }).success).toBe(false);
    expect(salesExportQuery.safeParse({ ...base, from: [base.from, base.from] }).success).toBe(
      false,
    );
    expect(salesExportQuery.safeParse({}).success).toBe(false);
  });

  it('aplica dominio, precisión y máximo de 366 días sin truncar', () => {
    expect(
      salesExportQuery.safeParse({
        from: '2000-01-01T08:00:00.000Z',
        to: '2000-01-02T08:00:00.000Z',
      }).success,
    ).toBe(true);
    for (const from of [
      '2000-01-01T07:59:59.999Z',
      '2026-11-24T08:00:00.0000Z',
      '2026-11-24T08:00:00.000000Z',
      '2026-02-30T08:00:00.000Z',
      '2026-11-24T24:00:00.000Z',
      '2026-11-24T08:00:00+01:00',
    ])
      expect(salesExportQuery.safeParse({ ...base, from }).success, from).toBe(false);
    expect(salesExportQuery.safeParse({ ...base, to: base.from }).success).toBe(false);
    expect(
      salesExportQuery.safeParse({
        from: '2024-01-01T08:00:00.000Z',
        to: '2025-01-01T08:00:00.001Z',
      }).success,
    ).toBe(false);
  });
});

describe('CSV-01: topes antes de serializar', () => {
  it('ventas rechaza 20 001 filas con EXPORT_LIMIT_EXCEEDED', async () => {
    const rows = Array.from({ length: 20001 }, () => sale());
    const service = new SalesService({
      salesExport: async () => rows,
    } as unknown as SalesRepository);
    await expectLimit(() =>
      service.salesCsv(
        actor,
        salesExportQuery.parse({
          from: '2026-11-24T08:00:00.000Z',
          to: '2026-11-25T08:00:00.000Z',
        }),
      ),
    );
  });

  it('sin movimiento rechaza 2 001 productos con EXPORT_LIMIT_EXCEEDED', async () => {
    const service = new SalesService({
      noMovementProducts: async () => ({ totalNoMovementProducts: '2001', items: [] }),
    } as unknown as SalesRepository);
    await expectLimit(() =>
      service.noMovementProductsCsv(
        actor,
        salesExportQuery.parse({
          from: '2026-11-24T08:00:00.000Z',
          to: '2026-11-25T08:00:00.000Z',
        }),
      ),
    );
  });

  it('categorías rechaza 1 001 categorías con EXPORT_LIMIT_EXCEEDED', async () => {
    const service = new SalesService({
      categoryParticipation: async () => ({
        inconsistentRows: '0',
        denominatorUnitsSold: '0',
        denominatorTotalCents: '0',
        totalCategories: '1001',
        items: [],
      }),
    } as unknown as SalesRepository);
    await expectLimit(() =>
      service.categoryParticipationCsv(actor, {
        from: '2026-11-24T08:00:00.000Z',
        to: '2026-11-25T08:00:00.000Z',
        metric: 'units',
      }),
    );
  });

  it('series con cero ventas conserva al menos un bucket con métricas 0', async () => {
    const service = new SalesService(
      {
        seriesAggregates: async (_actor: Principal, _input: unknown, buckets: unknown[]) =>
          buckets.map(() => ({ totalCents: '0', ticketCount: '0', unitsSold: '0' })),
      } as unknown as SalesRepository,
      () => new Date(generatedAt),
    );
    const file = await service.salesSeriesCsv(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-24T09:00:00.000Z',
      granularity: 'hour',
    });
    const body = lines(file.body);
    expect(body).toContain('#meta,bucketCount,1');
    expect(body).toContain('#meta,rowCount,1');
    expect(body.at(-1)).toMatch(/,false,0,0,0$/);
  });

  it('acepta la guarda de 368 buckets day y rechaza 369 sin truncar', () => {
    const from = parseSalesSeriesInstant('2024-01-01T08:00:00.000Z');
    const to = parseSalesSeriesInstant('2025-01-03T08:00:00.000Z');
    expect(buildSalesSeriesBuckets(from, to, 'day')).toHaveLength(368);
    expect(() =>
      buildSalesSeriesBuckets(from, parseSalesSeriesInstant('2025-01-04T08:00:00.000Z'), 'day'),
    ).toThrow('Solicitud inválida');
  });
});
