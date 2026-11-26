import { apiFetchFile } from '../../../../shared/api/client';
import type { DashboardMethod } from '../dashboard/summaryApi';
import { buildDashboardSummaryQuery } from '../dashboard/summaryApi';
import type {
  ProductRankingDirection,
  ProductRankingMetric,
  ProductRankingTop,
} from '../analytics/rankingApi';
import { buildProductRankingQuery } from '../analytics/rankingApi';
import type { SalesSeriesGranularity } from '../analytics/seriesApi';
import { buildSalesSeriesQuery } from '../analytics/seriesApi';
import { buildNoMovementExportQuery } from '../analytics/noMovementApi';
import type { CategoryParticipationMetric } from '../analytics/categoriesApi';
import { buildCategoryParticipationQuery } from '../analytics/categoriesApi';

export type CsvExportKind = 'sales' | 'series' | 'ranking' | 'no-movement' | 'categories';

export type CsvExportRequest = {
  kind: CsvExportKind;
  endpoint: string;
  query: string;
  /** Safe local name used only when Content-Disposition is absent or unusable. */
  fallbackFilename: string;
};

export type CsvDownloadResult = { filename: string };

export type CsvDownloadEnvironment = {
  fetchFile?: typeof apiFetchFile;
  save?: (blob: Blob, filename: string) => void;
};

const ENDPOINTS: Record<CsvExportKind, string> = {
  sales: '/admin/dashboard/sales-export.csv',
  series: '/admin/dashboard/sales-series-export.csv',
  ranking: '/admin/dashboard/product-ranking-export.csv',
  'no-movement': '/admin/dashboard/no-movement-products-export.csv',
  categories: '/admin/dashboard/category-participation-export.csv',
};

const MAX_FILENAME_LENGTH = 116;
const MAX_EXPORT_MS = 366 * 24 * 60 * 60 * 1000;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Minimum `from` accepted by every E2 export: 2000-01-01 00:00 America/Tijuana. */
export const CSV_EXPORT_MIN_FROM_MS = Date.parse('2000-01-01T08:00:00.000Z');

export const CSV_EXPORT_RANGE_UNAVAILABLE =
  'La exportación no está disponible para rangos anteriores al 1 de enero de 2000.';

/**
 * E2 exports reject `from` before 2000-01-01T08:00:00.000Z, malformed UTC
 * instants and ranges over 366 days. Panels call this before building a
 * request so an unsupported range disables the download instead of throwing
 * while rendering.
 */
export function canExportRange(from: string, to: string): boolean {
  if (!UTC_INSTANT.test(from) || !UTC_INSTANT.test(to)) return false;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return false;
  return (
    fromMs >= CSV_EXPORT_MIN_FROM_MS &&
    fromMs < toMs &&
    toMs - fromMs <= MAX_EXPORT_MS
  );
}

/** `YYYYMMDDTHHMMSSZ`, the same compact instant used by the backend names. */
function compactInstant(iso: string): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) {
    throw new TypeError('El periodo de la exportación no es válido.');
  }
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function methodSuffix(method: DashboardMethod | 'ALL' | undefined): string {
  return (method === undefined || method === 'ALL' ? 'all' : method).toLowerCase();
}

function request(
  kind: CsvExportKind,
  query: string,
  fallbackFilename: string,
): CsvExportRequest {
  return { kind, endpoint: ENDPOINTS[kind], query, fallbackFilename };
}

export function buildSalesCsvRequest(input: {
  from: string;
  to: string;
  method?: DashboardMethod | 'ALL';
}): CsvExportRequest {
  const method = input.method === 'ALL' ? undefined : input.method;
  const query = buildDashboardSummaryQuery({
    from: input.from,
    to: input.to,
    ...(method === undefined ? {} : { method }),
  });
  return request(
    'sales',
    query,
    `dashboard-sales-${compactInstant(input.from)}-${compactInstant(input.to)}-${methodSuffix(input.method)}.csv`,
  );
}

export function buildSeriesCsvRequest(input: {
  from: string;
  to: string;
  granularity: SalesSeriesGranularity;
  method?: DashboardMethod | 'ALL';
}): CsvExportRequest {
  const method = input.method === 'ALL' ? undefined : input.method;
  const query = buildSalesSeriesQuery({
    from: input.from,
    to: input.to,
    granularity: input.granularity,
    ...(method === undefined ? {} : { method }),
  });
  return request(
    'series',
    query,
    `dashboard-sales-series-${compactInstant(input.from)}-${compactInstant(input.to)}-${input.granularity}-${methodSuffix(input.method)}.csv`,
  );
}

export function buildRankingCsvRequest(input: {
  from: string;
  to: string;
  metric: ProductRankingMetric;
  direction: ProductRankingDirection;
  top: ProductRankingTop;
  method?: DashboardMethod | 'ALL';
}): CsvExportRequest {
  const query = buildProductRankingQuery({
    from: input.from,
    to: input.to,
    metric: input.metric,
    direction: input.direction,
    top: input.top,
    ...(input.method === undefined ? {} : { method: input.method }),
  });
  return request(
    'ranking',
    query,
    `dashboard-product-ranking-${compactInstant(input.from)}-${compactInstant(input.to)}-${input.metric}-${input.direction}${input.top}-${methodSuffix(input.method)}.csv`,
  );
}

export function buildNoMovementCsvRequest(input: {
  from: string;
  to: string;
  method?: DashboardMethod | 'ALL';
}): CsvExportRequest {
  const query = buildNoMovementExportQuery({
    from: input.from,
    to: input.to,
    ...(input.method === undefined ? {} : { method: input.method }),
  });
  return request(
    'no-movement',
    query,
    `dashboard-no-movement-${compactInstant(input.from)}-${compactInstant(input.to)}-${methodSuffix(input.method)}.csv`,
  );
}

export function buildCategoryCsvRequest(input: {
  from: string;
  to: string;
  metric: CategoryParticipationMetric;
  method?: DashboardMethod | 'ALL';
}): CsvExportRequest {
  const query = buildCategoryParticipationQuery({
    from: input.from,
    to: input.to,
    metric: input.metric,
    ...(input.method === undefined ? {} : { method: input.method }),
  });
  return request(
    'categories',
    query,
    `dashboard-category-participation-${compactInstant(input.from)}-${compactInstant(input.to)}-${input.metric}-${methodSuffix(input.method)}.csv`,
  );
}

function decodeExtendedValue(value: string): string | null {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value);
  const encoded = match === null ? value : match[2];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** Extracts filename/filename* from Content-Disposition without trusting it. */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (header === null || header.trim().length === 0) return null;

  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (extended !== null) {
    const decoded = decodeExtendedValue(extended[1].trim().replace(/^"|"$/g, ''));
    if (decoded !== null && decoded.length > 0) return decoded;
  }

  const plain = /filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]+)/i.exec(header);
  if (plain === null) return null;
  const raw = plain[1].trim();
  const unquoted = raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1).replace(/\\(.)/g, '$1')
    : raw;
  return unquoted.length > 0 ? unquoted : null;
}

function sanitizeBase(raw: string): string {
  const withoutControls = Array.from(raw, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? '_' : character;
  }).join('');
  const basename = withoutControls.split(/[\\/]/).pop() ?? '';
  const cleaned = basename
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[.]+/, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'download';
}

function ensureCsvExtension(name: string): string {
  const csvName = /\.csv$/i.test(name)
    ? name
    : `${name.replace(/\.[A-Za-z0-9]{1,10}$/, '') || 'download'}.csv`;
  if (csvName.length <= MAX_FILENAME_LENGTH) return csvName;
  return `${csvName.slice(0, MAX_FILENAME_LENGTH - 4)}.csv`;
}

/** Resolves the attachment name, constraining it to a safe ASCII `.csv`. */
export function resolveCsvFilename(header: string | null, fallback: string): string {
  const fromHeader = parseContentDispositionFilename(header);
  const candidate = fromHeader ?? fallback;
  return ensureCsvExtension(sanitizeBase(candidate));
}

export function saveCsvToBrowser(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  // Keep the first failure (click before remove) so neither one is swallowed,
  // while the release below is scheduled exactly once no matter what throws.
  let failure: { reason: unknown } | null = null;
  try {
    anchor.click();
  } catch (reason) {
    failure = { reason };
  }
  try {
    anchor.remove();
  } catch (reason) {
    if (failure === null) failure = { reason };
  }
  // Some engines start the download asynchronously after the click; deferring
  // one macrotask avoids revoking the URL before it is consumed. Scheduling the
  // release outside both operations keeps it guaranteed exactly once.
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
  if (failure !== null) throw failure.reason;
}

/**
 * Fetches a CSV through the existing HTTP client, derives the filename and
 * triggers one browser download. The object URL is always released.
 */
export async function downloadCsv(
  csvRequest: CsvExportRequest,
  signal?: AbortSignal,
  environment: CsvDownloadEnvironment = {},
): Promise<CsvDownloadResult> {
  const fetchFile = environment.fetchFile ?? apiFetchFile;
  const save = environment.save ?? saveCsvToBrowser;
  const { blob, contentDisposition } = await fetchFile(
    `${csvRequest.endpoint}${csvRequest.query}`,
    { signal },
  );
  if (signal?.aborted) {
    throw new DOMException('La descarga fue cancelada', 'AbortError');
  }
  const filename = resolveCsvFilename(contentDisposition, csvRequest.fallbackFilename);
  save(blob, filename);
  return { filename };
}
