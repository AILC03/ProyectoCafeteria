import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import { invalidInput } from '../../shared/http/problem.js';
import type { Principal } from '../auth/auth.types.js';
import {
  decodeNoMovementCursor,
  encodeNoMovementCursor,
  NO_MOVEMENT_UNIVERSE_DEFINITION,
  parseSalesSeriesInstant,
  type DashboardSummaryQuery,
  type NoMovementCursorFilters,
  type SalesFilters,
  type SalesNoMovementQuery,
  type SalesOrder,
  type SalesRankingQuery,
  type SalesSeriesQuery,
} from './sales.validation.js';
import type { SalesRepository } from './sales.read.repository.js';
export { SalesRepository } from './sales.read.repository.js';

const SERIES_HOUR_MS = 60 * 60 * 1000;
const SERIES_MAX_BUCKETS = { hour: 745, day: 368 } as const;
const TIJUANA_TIME_ZONE = 'America/Tijuana';
const tijuanaPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIJUANA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
export type SalesSeriesBucket = {
  start: Date;
  end: Date;
  localStart: string;
  effectiveFrom: Date;
  effectiveTo: Date;
  partial: boolean;
};

function localParts(date: Date): LocalParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of tijuanaPartsFormatter.formatToParts(date))
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

function tijuanaOffsetMinutes(date: Date): number {
  const parts = localParts(date);
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((wallClock - date.getTime()) / 60_000);
}

/** UTC del inicio del día civil local en Tijuana; sin offsets fijos. */
function tijuanaMidnight(year: number, month: number, day: number): Date {
  const wallClock = Date.UTC(year, month - 1, day);
  let offset = tijuanaOffsetMinutes(new Date(wallClock));
  let instant = wallClock - offset * 60_000;
  const refined = tijuanaOffsetMinutes(new Date(instant));
  if (refined !== offset) {
    offset = refined;
    instant = wallClock - offset * 60_000;
  }
  return new Date(instant);
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0');
}

/** ISO/RFC 3339 sin fracción, con el offset IANA exacto de ese instante. */
export function formatTijuanaLocalStart(date: Date): string {
  const parts = localParts(date);
  const offset = tijuanaOffsetMinutes(date);
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function nextLocalDay(parts: LocalParts): LocalParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

function makeSeriesBucket(startMs: number, endMs: number, from: number, to: number) {
  if (endMs <= startMs) throw invalidInput();
  const start = new Date(startMs),
    end = new Date(endMs);
  const effectiveFrom = Math.max(startMs, from),
    effectiveTo = Math.min(endMs, to);
  if (effectiveTo <= effectiveFrom) throw invalidInput();
  for (const instant of [start, end]) {
    const year = instant.getUTCFullYear();
    if (year < 2000 || year > 9999) throw invalidInput();
  }
  const localYear = localParts(start).year;
  if (localYear < 2000 || localYear > 9999) throw invalidInput();
  return {
    start,
    end,
    localStart: formatTijuanaLocalStart(start),
    effectiveFrom: new Date(effectiveFrom),
    effectiveTo: new Date(effectiveTo),
    partial: effectiveFrom !== startMs || effectiveTo !== endMs,
  } satisfies SalesSeriesBucket;
}

/**
 * Fronteras horarias: con las reglas IANA de Tijuana desde 2000 el offset es
 * siempre un número entero de horas, así que cada hora UTC con milisegundos
 * cero es exactamente una frontera local (omite la hora inexistente de
 * primavera y conserva ambas ocurrencias de otoño). No se usa offset fijo.
 */
function buildHourBuckets(from: number, to: number): SalesSeriesBucket[] {
  const buckets: SalesSeriesBucket[] = [];
  let start = Math.floor(from / SERIES_HOUR_MS) * SERIES_HOUR_MS;
  while (start < to) {
    const end = start + SERIES_HOUR_MS;
    buckets.push(makeSeriesBucket(start, end, from, to));
    start = end;
  }
  return buckets;
}

function buildDayBuckets(from: number, to: number): SalesSeriesBucket[] {
  const buckets: SalesSeriesBucket[] = [];
  let civil = localParts(new Date(from));
  for (;;) {
    const start = tijuanaMidnight(civil.year, civil.month, civil.day);
    if (start.getTime() >= to) break;
    const next = nextLocalDay(civil);
    const end = tijuanaMidnight(next.year, next.month, next.day);
    buckets.push(makeSeriesBucket(start.getTime(), end.getTime(), from, to));
    civil = next;
  }
  return buckets;
}

export function buildSalesSeriesBuckets(
  from: number,
  to: number,
  granularity: SalesSeriesQuery['granularity'],
): SalesSeriesBucket[] {
  const buckets = granularity === 'hour' ? buildHourBuckets(from, to) : buildDayBuckets(from, to);
  if (buckets.length === 0 || buckets.length > SERIES_MAX_BUCKETS[granularity])
    throw invalidInput();
  return buckets;
}

function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Divisor de resumen inválido');
  return (numerator + denominator / 2n) / denominator;
}

function comparisonMetric(current: bigint, previous: bigint) {
  const change = current - previous;
  let changePercent: string | null = null;
  if (previous !== 0n) {
    const negative = change < 0n;
    const scaled = roundedDivide((negative ? -change : change) * 10000n, previous);
    if (scaled === 0n) changePercent = '0.00';
    else {
      const whole = scaled / 100n;
      const fraction = (scaled % 100n).toString().padStart(2, '0');
      changePercent = `${negative ? '-' : ''}${whole}.${fraction}`;
    }
  }
  return { previous: previous.toString(), change: change.toString(), changePercent };
}

export class SalesService {
  constructor(
    readonly repository: SalesRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  async list(
    actor: Principal,
    input: SalesFilters & { limit: number; cursor?: string; order?: SalesOrder },
  ) {
    const { limit, cursor, order = 'asc', ...filters } = input;
    // Preserve existing ascending cursors; descending cursors bind the order explicitly.
    const scope = JSON.stringify([
      filters.from ?? null,
      filters.to ?? null,
      filters.method ?? null,
      ...(order === 'desc' ? [order] : []),
    ]);
    return paginate(
      await this.repository.list(
        actor,
        filters,
        limit,
        decodeCursor(cursor, 'sales', scope),
        order,
      ),
      limit,
      'sales',
      scope,
    );
  }
  summary(actor: Principal, input: SalesFilters) {
    return this.repository.summary(actor, input);
  }
  async salesSeries(actor: Principal, input: SalesSeriesQuery) {
    const from = parseSalesSeriesInstant(input.from),
      to = parseSalesSeriesInstant(input.to);
    const buckets = buildSalesSeriesBuckets(from, to, input.granularity);
    const aggregates = await this.repository.seriesAggregates(
      actor,
      { from: new Date(from), to: new Date(to), method: input.method },
      buckets,
    );
    const totals = { totalCents: 0n, ticketCount: 0n, unitsSold: 0n };
    const series = buckets.map((bucket, index) => {
      const aggregate = aggregates[index];
      if (!aggregate) throw new Error('Agregado de serie incompleto');
      totals.totalCents += BigInt(aggregate.totalCents);
      totals.ticketCount += BigInt(aggregate.ticketCount);
      totals.unitsSold += BigInt(aggregate.unitsSold);
      return {
        start: bucket.start.toISOString(),
        end: bucket.end.toISOString(),
        localStart: bucket.localStart,
        effectiveFrom: bucket.effectiveFrom.toISOString(),
        effectiveTo: bucket.effectiveTo.toISOString(),
        partial: bucket.partial,
        totalCents: aggregate.totalCents,
        ticketCount: aggregate.ticketCount,
        unitsSold: aggregate.unitsSold,
      };
    });
    return {
      data: {
        generatedAt: this.now().toISOString(),
        currency: 'MXN',
        period: {
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          timeZone: TIJUANA_TIME_ZONE,
        },
        method: input.method ?? null,
        granularity: input.granularity,
        bucketCount: series.length.toString(),
        totals: {
          totalCents: totals.totalCents.toString(),
          ticketCount: totals.ticketCount.toString(),
          unitsSold: totals.unitsSold.toString(),
        },
        buckets: series,
      },
    };
  }
  async productRanking(actor: Principal, input: SalesRankingQuery) {
    const from = parseSalesSeriesInstant(input.from),
      to = parseSalesSeriesInstant(input.to);
    const top = Number(input.top);
    const aggregate = await this.repository.rankingAggregates(actor, {
      from: new Date(from),
      to: new Date(to),
      method: input.method,
      metric: input.metric,
      direction: input.direction,
      limit: top,
    });
    if (!aggregate || !Array.isArray(aggregate.items))
      throw new Error('Agregado de ranking incompleto');
    const items = aggregate.items.map((item, index) => {
      // El nombre se resuelve en SQL; si una baja no tuviera snapshot, el fallo
      // es explícito en lugar de inventar un nombre.
      if (typeof item.name !== 'string') throw new Error('Nombre de producto no resuelto');
      if (item.nameSource !== 'current' && item.nameSource !== 'snapshot')
        throw new Error('Origen de nombre de producto inválido');
      return {
        position: (index + 1).toString(),
        productId: item.productId,
        name: item.name,
        nameSource: item.nameSource,
        unitsSold: item.unitsSold,
        totalCents: item.totalCents,
      };
    });
    return {
      data: {
        generatedAt: this.now().toISOString(),
        currency: 'MXN',
        period: {
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          timeZone: TIJUANA_TIME_ZONE,
        },
        method: input.method ?? null,
        metric: input.metric,
        direction: input.direction,
        top: input.top,
        matchedProductCount: aggregate.matchedProductCount,
        matchedTotals: {
          unitsSold: aggregate.matchedUnitsSold,
          totalCents: aggregate.matchedTotalCents,
        },
        truncated: BigInt(aggregate.matchedProductCount) > BigInt(items.length),
        items,
      },
    };
  }
  /**
   * Lista E2-09: valida el cursor propio contra los valores efectivos, pide la
   * página keyset y el total en una sola lectura, y compone el DTO cerrado. El
   * total es el del conjunto completo antes de paginar; la página no reordena.
   */
  async noMovementProducts(actor: Principal, input: SalesNoMovementQuery) {
    const from = new Date(parseSalesSeriesInstant(input.from)),
      to = new Date(parseSalesSeriesInstant(input.to)),
      limit = input.limit;
    const filters: NoMovementCursorFilters = {
      from: from.toISOString(),
      to: to.toISOString(),
      method: input.method ?? null,
      limit,
    };
    const aggregate = await this.repository.noMovementProducts(actor, {
      from,
      to,
      ...(input.method ? { method: input.method } : {}),
      limit: Number(limit),
      after: decodeNoMovementCursor(input.cursor, filters),
    });
    if (
      !aggregate ||
      typeof aggregate.totalNoMovementProducts !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(aggregate.totalNoMovementProducts) ||
      !Array.isArray(aggregate.items)
    )
      throw new Error('Agregado de productos sin movimiento incompleto');
    const pageLimit = Number(limit),
      page = aggregate.items.slice(0, pageLimit),
      last = page.at(-1);
    const items = page.map((item) => {
      if (
        typeof item.productId !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.categoryId !== 'string' ||
        typeof item.categoryName !== 'string' ||
        typeof item.isAvailable !== 'boolean' ||
        typeof item.createdAt !== 'string'
      )
        throw new Error('Producto sin movimiento incompleto');
      return {
        productId: item.productId,
        name: item.name,
        category: { id: item.categoryId, name: item.categoryName },
        isAvailable: item.isAvailable,
        createdAt: item.createdAt,
      };
    });
    return {
      data: {
        generatedAt: this.now().toISOString(),
        currency: 'MXN',
        period: {
          from: filters.from,
          to: filters.to,
          timeZone: TIJUANA_TIME_ZONE,
        },
        method: filters.method,
        universe: {
          asOf: filters.to,
          definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
          includesUnavailable: true,
        },
        totalNoMovementProducts: aggregate.totalNoMovementProducts,
        page: {
          limit,
          nextCursor:
            aggregate.items.length > pageLimit && last
              ? encodeNoMovementCursor(filters, {
                  name: last.name,
                  productId: last.productId,
                })
              : null,
        },
        items,
      },
    };
  }
  async administrativeSummary(actor: Principal, input: DashboardSummaryQuery) {
    const aggregate = await this.repository.administrativeSummary(actor, input);
    const totalCents = BigInt(aggregate.totalCents);
    const ticketCount = BigInt(aggregate.ticketCount);
    const unitsSold = BigInt(aggregate.unitsSold);
    const previousTotalCents = BigInt(aggregate.previousTotalCents);
    const previousTicketCount = BigInt(aggregate.previousTicketCount);
    const previousUnitsSold = BigInt(aggregate.previousUnitsSold);
    const averageTicketCents = ticketCount === 0n ? 0n : roundedDivide(totalCents, ticketCount);
    const previousAverageTicketCents =
      previousTicketCount === 0n ? 0n : roundedDivide(previousTotalCents, previousTicketCount);
    const from = new Date(input.from);
    const to = new Date(input.to);
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    return {
      data: {
        generatedAt: this.now().toISOString(),
        currency: 'MXN',
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
          timeZone: 'America/Tijuana',
          previousFrom: previousFrom.toISOString(),
          previousTo: from.toISOString(),
        },
        totalCents: totalCents.toString(),
        ticketCount: ticketCount.toString(),
        averageTicketCents: averageTicketCents.toString(),
        unitsSold: unitsSold.toString(),
        paymentMix: {
          cashCents: aggregate.cashCents,
          stripeCents: aggregate.stripeCents,
        },
        comparison: {
          totalCents: comparisonMetric(totalCents, previousTotalCents),
          ticketCount: comparisonMetric(ticketCount, previousTicketCount),
          averageTicketCents: comparisonMetric(averageTicketCents, previousAverageTicketCents),
          unitsSold: comparisonMetric(unitsSold, previousUnitsSold),
        },
      },
    };
  }
}
