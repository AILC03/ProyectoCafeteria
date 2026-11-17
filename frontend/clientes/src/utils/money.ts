/**
 * Utilidades para manejo seguro de moneda según el contrato del backend:
 * El backend maneja todo el dinero en centavos enteros como cadenas (e.g. "6500" = $65.00 MXN).
 */

export function formatCents(cents: string | number | null | undefined): string {
  if (cents == null || cents === '') return '$0.00 MXN';
  const numCents = typeof cents === 'string' ? parseInt(cents, 10) : Math.round(cents);
  if (isNaN(numCents)) return '$0.00 MXN';
  return (numCents / 100).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

export function formatPrice(cents: string | number | null | undefined): string {
  if (cents == null || cents === '') return '$0.00';
  const numCents = typeof cents === 'string' ? parseInt(cents, 10) : Math.round(cents);
  if (isNaN(numCents)) return '$0.00';
  return `$${(numCents / 100).toFixed(2)}`;
}

export function centsToNumber(cents: string | number): number {
  const numCents = typeof cents === 'string' ? parseInt(cents, 10) : Math.round(cents);
  return isNaN(numCents) ? 0 : numCents / 100;
}

export function numberToCents(amount: number): string {
  return Math.round(amount * 100).toString();
}
