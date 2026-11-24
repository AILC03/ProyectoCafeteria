export const BUSINESS_TIME_ZONE = 'America/Tijuana';
export const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type PeriodPreset = 'today' | 'last7' | 'last30' | 'custom';
export type PeriodRange = {
  preset: PeriodPreset;
  from: string;
  to: string;
  label: string;
};
type LocalDate = { year: number; month: number; day: number };

export const PERIOD_OPTIONS: ReadonlyArray<{ id: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'last7', label: 'Últimos 7 días' },
  { id: 'last30', label: 'Últimos 30 días' },
];

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

function parseLocalDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new TypeError('La fecha debe usar el formato AAAA-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new TypeError('La fecha no existe.');
  }
  return { year, month, day };
}

function addDays(value: LocalDate, days: number): LocalDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatLocalDate(value: LocalDate): string {
  return `${value.year.toString().padStart(4, '0')}-${value.month
    .toString()
    .padStart(2, '0')}-${value.day.toString().padStart(2, '0')}`;
}

/**
 * Resolves a local midnight to an exact UTC instant. The loop corrects the
 * initial UTC guess using the zone's actual offset, including DST changes.
 */
function localMidnightUtc(value: LocalDate, timeZone: string): Date {
  const desired = Date.UTC(value.year, value.month - 1, value.day);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const difference = desired - represented;
    if (difference === 0) break;
    candidate += difference;
  }
  const resolved = zonedParts(new Date(candidate), timeZone);
  if (
    resolved.year !== value.year ||
    resolved.month !== value.month ||
    resolved.day !== value.day ||
    resolved.hour !== 0 ||
    resolved.minute !== 0 ||
    resolved.second !== 0
  ) {
    throw new Error('No se pudo resolver la medianoche local.');
  }
  return new Date(candidate);
}

function validateDuration(from: string, to: string): void {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new TypeError('El rango de fechas no es válido.');
  }
  if (end - start > MAX_PERIOD_MS) {
    throw new TypeError('El rango no puede superar 366 días.');
  }
}

function range(
  preset: PeriodPreset,
  label: string,
  start: LocalDate,
  endExclusive: LocalDate,
): PeriodRange {
  const from = localMidnightUtc(start, BUSINESS_TIME_ZONE).toISOString();
  const to = localMidnightUtc(endExclusive, BUSINESS_TIME_ZONE).toISOString();
  validateDuration(from, to);
  return { preset, from, to, label };
}

/** Returns Today's business period, the default for Inicio. */
export function defaultPeriod(now: Date = new Date()): PeriodRange {
  return createPresetPeriod('today', now);
}

export function createPresetPeriod(
  preset: Exclude<PeriodPreset, 'custom'>,
  now: Date = new Date(),
): PeriodRange {
  const today = zonedParts(now, BUSINESS_TIME_ZONE);
  const startOffset = preset === 'today' ? 0 : preset === 'last7' ? -6 : -29;
  const start = addDays(today, startOffset);
  const endExclusive = addDays(today, 1);
  const label = PERIOD_OPTIONS.find((option) => option.id === preset)!.label;
  return range(preset, label, start, endExclusive);
}

/** Custom dates are inclusive in the UI and converted to a semi-open UTC range. */
export function createCustomPeriod(startDate: string, endDate: string): PeriodRange {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (formatLocalDate(start) > formatLocalDate(end)) {
    throw new TypeError('La fecha inicial no puede ser posterior a la final.');
  }
  const result = range(
    'custom',
    `${formatLocalDate(start)} a ${formatLocalDate(end)}`,
    start,
    addDays(end, 1),
  );
  return result;
}

export function periodQuery(value: PeriodRange): { from: string; to: string } {
  if (!UTC_INSTANT.test(value.from) || !UTC_INSTANT.test(value.to)) {
    throw new TypeError('Los límites del periodo deben ser instantes UTC.');
  }
  validateDuration(value.from, value.to);
  return { from: value.from, to: value.to };
}

/** Precise integer counts used by dashboard metrics; never routes through Number. */
export function formatInteger(value: string): string {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) {
    throw new TypeError('El conteo no es verificable.');
  }
  return BigInt(value).toLocaleString('es-MX');
}

/** Formats the backend-approved percentage string without recomputing it. */
export function formatPercentChange(value: string | null): string {
  if (value === null) return 'Sin comparación';
  if (
    !/^(0\.[0-9]{2}|[1-9][0-9]*\.[0-9]{2}|-0\.(?:0[1-9]|[1-9][0-9])|-[1-9][0-9]*\.[0-9]{2})$/.test(
      value,
    )
  ) {
    throw new TypeError('El porcentaje no es verificable.');
  }
  if (value === '0.00') return '0.00 %';
  return `${value.startsWith('-') ? '' : '+'}${value} %`;
}
