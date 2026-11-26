const HOUR_MS = 60 * 60 * 1000;

const zoneParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Tijuana',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parts(ms: number) {
  const values = Object.fromEntries(
    zoneParts
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year as number,
    month: values.month as number,
    day: values.day as number,
    hour: values.hour as number,
    minute: values.minute as number,
    second: values.second as number,
  };
}

function localIso(ms: number): string {
  const value = parts(ms);
  const offsetMinutes =
    (Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second) - ms) /
    60000;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}T${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}:${String(value.second).padStart(2, '0')}${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function localMidnight(year: number, month: number, day: number): number {
  const desired = Date.UTC(year, month - 1, day);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const value = parts(candidate);
    const represented = Date.UTC(
      value.year,
      value.month - 1,
      value.day,
      value.hour,
      value.minute,
      value.second,
    );
    const difference = desired - represented;
    if (difference === 0) break;
    candidate += difference;
  }
  return candidate;
}

type BucketValues = {
  totalCents?: string;
  ticketCount?: string;
  unitsSold?: string;
};

/**
 * Builds a contract-shaped series for the exact request URL. Test-only data:
 * it lets unrelated panel tests satisfy the strict parser without hiding the
 * series behind a mock inside production code.
 */
export function salesSeriesForUrl(
  url: string,
  values: (index: number) => BucketValues = () => ({}),
) {
  const query = new URL(url).searchParams;
  const from = query.get('from')!;
  const to = query.get('to')!;
  const granularity = query.get('granularity') as 'hour' | 'day';
  const method = query.get('method');
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const buckets: Array<{
    start: string;
    end: string;
    localStart: string;
    effectiveFrom: string;
    effectiveTo: string;
    partial: boolean;
    totalCents: string;
    ticketCount: string;
    unitsSold: string;
  }> = [];
  let start = granularity === 'hour'
    ? Math.floor(fromMs / HOUR_MS) * HOUR_MS
    : (() => {
        const value = parts(fromMs);
        return localMidnight(value.year, value.month, value.day);
      })();
  let index = 0;
  while (start < toMs) {
    const end = granularity === 'hour'
      ? start + HOUR_MS
      : (() => {
          const value = parts(start);
          return localMidnight(value.year, value.month, value.day + 1);
        })();
    const effectiveFrom = Math.max(start, fromMs);
    const effectiveTo = Math.min(end, toMs);
    if (effectiveFrom < effectiveTo) {
      const resolved = values(index);
      buckets.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        localStart: localIso(start),
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        effectiveTo: new Date(effectiveTo).toISOString(),
        partial: effectiveFrom !== start || effectiveTo !== end,
        totalCents: resolved.totalCents ?? (index === 0 ? '777' : '0'),
        ticketCount: resolved.ticketCount ?? (index === 0 ? '1' : '0'),
        unitsSold: resolved.unitsSold ?? (index === 0 ? '1' : '0'),
      });
      index += 1;
    }
    start = end;
  }
  const totals = buckets.reduce(
    (sum, bucket) => ({
      totalCents: sum.totalCents + BigInt(bucket.totalCents),
      ticketCount: sum.ticketCount + BigInt(bucket.ticketCount),
      unitsSold: sum.unitsSold + BigInt(bucket.unitsSold),
    }),
    { totalCents: 0n, ticketCount: 0n, unitsSold: 0n },
  );
  return {
    generatedAt: '2026-11-24T18:30:00.000Z',
    currency: 'MXN',
    period: { from, to, timeZone: 'America/Tijuana' },
    method: method === 'CASH' || method === 'STRIPE' ? method : null,
    granularity,
    bucketCount: String(buckets.length),
    totals: {
      totalCents: totals.totalCents.toString(),
      ticketCount: totals.ticketCount.toString(),
      unitsSold: totals.unitsSold.toString(),
    },
    buckets,
  };
}
