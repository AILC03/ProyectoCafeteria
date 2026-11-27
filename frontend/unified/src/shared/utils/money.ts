const DECIMAL_INTEGER_PATTERN = /^-?\d+$/;

/** Parses a decimal integer cent string into BigInt without floating-point rounding. */
export function parseCentsBigInt(cents: string | null | undefined): bigint {
  if (cents === null || cents === undefined) return 0n;
  const trimmed = cents.trim();
  if (!DECIMAL_INTEGER_PATTERN.test(trimmed)) return 0n;
  return BigInt(trimmed);
}

/** Adds two decimal cent strings using integer BigInt arithmetic. */
export function addCents(a: string, b: string): string {
  return (parseCentsBigInt(a) + parseCentsBigInt(b)).toString();
}

/** Sums an array of decimal cent strings using integer BigInt arithmetic. */
export function sumCents(values: readonly string[]): string {
  let total = 0n;
  for (const value of values) {
    total += parseCentsBigInt(value);
  }
  return total.toString();
}

/** Multiplies a decimal cent string by a non-negative integer quantity. */
export function multiplyCents(cents: string, quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return '0';
  return (parseCentsBigInt(cents) * BigInt(Math.trunc(quantity))).toString();
}

/**
 * Splits a tax-inclusive total into subtotal and included IVA using integer math.
 * Prices already include IVA, so `totalCents` never changes; subtotal + iva === total.
 * Defaults to the standard Mexican IVA rate (16%).
 */
export function splitIncludedIva(totalCents: string, ratePercent = 16): {
  subtotalCents: string;
  ivaCents: string;
  totalCents: string;
} {
  const total = parseCentsBigInt(totalCents);
  const rate = Number.isInteger(ratePercent) && ratePercent >= 0 && ratePercent <= 100 ? BigInt(ratePercent) : 16n;
  const divisor = 100n + rate;
  const signedTotal = total < 0n ? -total : total;
  const roundedSubtotal = (signedTotal * 100n + divisor / 2n) / divisor;
  const subtotal = total < 0n ? -roundedSubtotal : roundedSubtotal;
  return {
    subtotalCents: subtotal.toString(),
    ivaCents: (total - subtotal).toString(),
    totalCents: total.toString(),
  };
}

/** Formats decimal cents (e.g. "6500") as "$65.00" without floating-point conversion. */
export function formatMxnCents(cents: string | null | undefined): string {
  const value = parseCentsBigInt(cents);
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, '0');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${groupedWhole}.${frac}`;
}
