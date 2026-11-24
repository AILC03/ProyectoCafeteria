import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import type { Principal } from '../auth/auth.types.js';
import type { DashboardSummaryQuery, SalesFilters } from './sales.validation.js';
import type { SalesRepository } from './sales.read.repository.js';
export { SalesRepository } from './sales.read.repository.js';

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
  async list(actor: Principal, input: SalesFilters & { limit: number; cursor?: string }) {
    const { limit, cursor, ...filters } = input;
    const scope = JSON.stringify([
      filters.from ?? null,
      filters.to ?? null,
      filters.method ?? null,
    ]);
    return paginate(
      await this.repository.list(actor, filters, limit, decodeCursor(cursor, 'sales', scope)),
      limit,
      'sales',
      scope,
    );
  }
  summary(actor: Principal, input: SalesFilters) {
    return this.repository.summary(actor, input);
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
