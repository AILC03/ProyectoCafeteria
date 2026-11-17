/**
 * Manejo financiero en centavos enteros para la terminal de empleados.
 * Garantiza cumplimiento con las reglas inmutables del backend.
 */

export function formatCents(cents) {
  if (cents == null || cents === '') return '$0.00 MXN';
  const num = typeof cents === 'string' ? parseInt(cents, 10) : Math.round(Number(cents));
  if (isNaN(num)) return '$0.00 MXN';
  return (num / 100).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

export function formatPrice(cents) {
  if (cents == null || cents === '') return '$0.00';
  const num = typeof cents === 'string' ? parseInt(cents, 10) : Math.round(Number(cents));
  if (isNaN(num)) return '$0.00';
  return `$${(num / 100).toFixed(2)}`;
}

export function centsToNumber(cents) {
  const num = typeof cents === 'string' ? parseInt(cents, 10) : Math.round(Number(cents));
  return isNaN(num) ? 0 : num / 100;
}

export function numberToCents(amount) {
  const num = Number(amount) || 0;
  return Math.round(num * 100).toString();
}
