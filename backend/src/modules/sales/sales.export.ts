import { serializeCsv, type CsvMetadata, type CsvValue } from '../../shared/http/csv.js';
import {
  CATEGORY_EXPORT_MAX_ROWS,
  NO_MOVEMENT_EXPORT_MAX_ROWS,
  RANKING_EXPORT_MAX_ROWS,
  SALES_EXPORT_MAX_ROWS,
  type SalesExportRow,
} from './sales.read.repository.js';

const CURRENCY = 'MXN';
const TIME_ZONE = 'America/Tijuana';
const ROW_ORDER = 'soldAtUtc ASC, saleId ASC';

export type CsvExport = { filename: string; body: Buffer };
type Period = { from: Date; to: Date };
type Method = 'CASH' | 'STRIPE';

function methodMetadata(method?: Method): string {
  return method ?? 'all';
}

function filenameMethod(method?: Method): string {
  return (method ?? 'all').toLowerCase();
}

/** `YYYYMMDDTHHMMSSZ` sin fracciones, solo con dígitos y ASCII. */
function compactInstant(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function filename(parts: readonly string[]): string {
  return `${parts.join('-')}.csv`;
}

function commonMetadata(
  exportId: string,
  period: Period,
  method: Method | undefined,
  generatedAt: string,
): CsvMetadata {
  return [
    ['export', exportId],
    ['schemaVersion', '1'],
    ['generatedAt', generatedAt],
    ['currency', CURRENCY],
    ['timeZone', TIME_ZONE],
    ['period.from', period.from.toISOString()],
    ['period.to', period.to.toISOString()],
    ['method', methodMetadata(method)],
  ];
}

function footerMetadata(rowCount: number, rowLimit: number, truncated = false): CsvMetadata {
  return [
    ['rowCount', String(rowCount)],
    ['rowLimit', String(rowLimit)],
    ['truncated', String(truncated)],
    ['contentKind', 'data'],
    ['containsImage', 'false'],
  ];
}

const text = (value: string): CsvValue => ({ text: value });

export type SalesExportData = {
  rows: SalesExportRow[];
  totals: { totalCents: bigint; unitsSold: bigint; lineCount: bigint };
};

export function buildSalesCsv(
  period: Period,
  method: Method | undefined,
  generatedAt: string,
  data: SalesExportData,
): CsvExport {
  const metadata: CsvMetadata = [
    ...commonMetadata('sales-export', period, method, generatedAt),
    ['rowOrder', ROW_ORDER],
    ...footerMetadata(data.rows.length, SALES_EXPORT_MAX_ROWS),
    ['orderStatusScope', 'current-at-generation'],
    ['totals.totalCents', data.totals.totalCents.toString()],
    ['totals.unitsSold', data.totals.unitsSold.toString()],
    ['totals.lineCount', data.totals.lineCount.toString()],
  ];
  const rows = data.rows.map((row) => [
    row.saleId,
    text(row.saleNumber),
    row.orderId,
    row.paymentId,
    row.soldAtUtc,
    row.soldAtLocal,
    text(row.method),
    text(row.orderStatus),
    CURRENCY,
    row.totalCents,
    row.unitsSold,
    row.lineCount,
  ]);
  return {
    filename: filename([
      'dashboard',
      'sales',
      compactInstant(period.from),
      compactInstant(period.to),
      filenameMethod(method),
    ]),
    body: serializeCsv(
      metadata,
      [
        'saleId',
        'saleNumber',
        'orderId',
        'paymentId',
        'soldAtUtc',
        'soldAtLocal',
        'method',
        'orderStatus',
        'currency',
        'totalCents',
        'unitsSold',
        'lineCount',
      ],
      rows,
    ),
  };
}

export type SeriesExportItem = {
  start: string;
  end: string;
  localStart: string;
  effectiveFrom: string;
  effectiveTo: string;
  partial: boolean;
  totalCents: string;
  ticketCount: string;
  unitsSold: string;
};

export function buildSeriesCsv(
  period: Period,
  method: Method | undefined,
  generatedAt: string,
  granularity: 'hour' | 'day',
  items: SeriesExportItem[],
): CsvExport {
  const totals = items.reduce(
    (accumulated, item) => ({
      totalCents: accumulated.totalCents + BigInt(item.totalCents),
      ticketCount: accumulated.ticketCount + BigInt(item.ticketCount),
      unitsSold: accumulated.unitsSold + BigInt(item.unitsSold),
    }),
    { totalCents: 0n, ticketCount: 0n, unitsSold: 0n },
  );
  const rowLimit = granularity === 'hour' ? 745 : 368;
  const metadata: CsvMetadata = [
    ...commonMetadata('sales-series-export', period, method, generatedAt),
    ['granularity', granularity],
    ['bucketCount', String(items.length)],
    ['totals.totalCents', totals.totalCents.toString()],
    ['totals.ticketCount', totals.ticketCount.toString()],
    ['totals.unitsSold', totals.unitsSold.toString()],
    ...footerMetadata(items.length, rowLimit),
  ];
  const rows = items.map((item, index) => [
    String(index + 1),
    item.start,
    item.end,
    item.localStart,
    item.effectiveFrom,
    item.effectiveTo,
    String(item.partial),
    item.totalCents,
    item.ticketCount,
    item.unitsSold,
  ]);
  return {
    filename: filename([
      'dashboard',
      'sales-series',
      compactInstant(period.from),
      compactInstant(period.to),
      granularity,
      filenameMethod(method),
    ]),
    body: serializeCsv(
      metadata,
      [
        'bucketIndex',
        'startUtc',
        'endUtc',
        'localStart',
        'effectiveFromUtc',
        'effectiveToUtc',
        'partial',
        'totalCents',
        'ticketCount',
        'unitsSold',
      ],
      rows,
    ),
  };
}

export type RankingExportItem = {
  productId: string;
  name: string;
  nameSource: 'current' | 'snapshot';
  unitsSold: string;
  totalCents: string;
};

export function buildRankingCsv(
  period: Period,
  method: Method | undefined,
  generatedAt: string,
  input: {
    metric: 'units' | 'amount';
    direction: 'top' | 'bottom';
    top: string;
    matchedProductCount: string;
    matchedUnitsSold: string;
    matchedTotalCents: string;
    items: RankingExportItem[];
  },
): CsvExport {
  const truncated = BigInt(input.matchedProductCount) > BigInt(input.items.length);
  const metadata: CsvMetadata = [
    ...commonMetadata('product-ranking-export', period, method, generatedAt),
    ['metric', input.metric],
    ['direction', input.direction],
    ['top', input.top],
    ['matchedProductCount', input.matchedProductCount],
    ['matchedTotals.unitsSold', input.matchedUnitsSold],
    ['matchedTotals.totalCents', input.matchedTotalCents],
    ['truncated', String(truncated)],
    ['rowCount', String(input.items.length)],
    ['rowLimit', String(RANKING_EXPORT_MAX_ROWS)],
    ['contentKind', 'data'],
    ['containsImage', 'false'],
  ];
  const rows = input.items.map((item, index) => [
    String(index + 1),
    item.productId,
    text(item.name),
    text(item.nameSource),
    item.unitsSold,
    item.totalCents,
  ]);
  return {
    filename: filename([
      'dashboard',
      'product-ranking',
      compactInstant(period.from),
      compactInstant(period.to),
      input.metric,
      `top${input.top}`,
      filenameMethod(method),
    ]),
    body: serializeCsv(
      metadata,
      ['position', 'productId', 'name', 'nameSource', 'unitsSold', 'totalCents'],
      rows,
    ),
  };
}

export type NoMovementExportItem = {
  productId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  isAvailable: boolean;
  createdAt: string;
  createdAtLocal: string;
};

export function buildNoMovementCsv(
  period: Period,
  method: Method | undefined,
  generatedAt: string,
  definition: string,
  items: NoMovementExportItem[],
): CsvExport {
  const metadata: CsvMetadata = [
    ...commonMetadata('no-movement-products-export', period, method, generatedAt),
    ['universe.asOf', period.to.toISOString()],
    ['universe.definition', definition],
    ['universe.includesUnavailable', 'true'],
    ['totalNoMovementProducts', String(items.length)],
    ...footerMetadata(items.length, NO_MOVEMENT_EXPORT_MAX_ROWS),
  ];
  const rows = items.map((item) => [
    item.productId,
    text(item.name),
    item.categoryId,
    text(item.categoryName),
    String(item.isAvailable),
    item.createdAt,
    item.createdAtLocal,
  ]);
  return {
    filename: filename([
      'dashboard',
      'no-movement',
      compactInstant(period.from),
      compactInstant(period.to),
      filenameMethod(method),
    ]),
    body: serializeCsv(
      metadata,
      [
        'productId',
        'name',
        'categoryId',
        'categoryName',
        'isAvailable',
        'createdAtUtc',
        'createdAtLocal',
      ],
      rows,
    ),
  };
}

export type CategoryExportItem = {
  categoryId: string;
  name: string;
  isActive: boolean;
  unitsSold: string;
  totalCents: string;
  sharePercent: string;
};

export function buildCategoryCsv(
  period: Period,
  method: Method | undefined,
  generatedAt: string,
  input: {
    metric: 'units' | 'amount';
    denominatorUnitsSold: string;
    denominatorTotalCents: string;
    totalCategories: string;
    items: CategoryExportItem[];
  },
): CsvExport {
  const metadata: CsvMetadata = [
    ...commonMetadata('category-participation-export', period, method, generatedAt),
    ['metric', input.metric],
    ['denominator.unitsSold', input.denominatorUnitsSold],
    ['denominator.totalCents', input.denominatorTotalCents],
    ['totalCategories', input.totalCategories],
    ...footerMetadata(input.items.length, CATEGORY_EXPORT_MAX_ROWS),
  ];
  const rows = input.items.map((item) => [
    item.categoryId,
    text(item.name),
    String(item.isActive),
    item.unitsSold,
    item.totalCents,
    item.sharePercent,
  ]);
  return {
    filename: filename([
      'dashboard',
      'category-participation',
      compactInstant(period.from),
      compactInstant(period.to),
      input.metric,
      filenameMethod(method),
    ]),
    body: serializeCsv(
      metadata,
      ['categoryId', 'name', 'isActive', 'unitsSold', 'totalCents', 'sharePercent'],
      rows,
    ),
  };
}
