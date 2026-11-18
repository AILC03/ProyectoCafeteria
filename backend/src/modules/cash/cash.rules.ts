import { HttpProblem } from '../../shared/http/problem.js';
export const cashConflict = (detail: string) =>
  new HttpProblem(409, 'CASH_CONFLICT', 'Conflicto de caja o cobro', detail);
export function checkedCents(value: bigint) {
  if (value < 0n || value > 9223372036854775807n)
    throw cashConflict('Importe fuera del rango admitido');
  return value;
}
export function cashChange(total: bigint, received: bigint, asserted?: bigint) {
  checkedCents(received);
  checkedCents(total);
  if (received < total) throw cashConflict('Efectivo insuficiente');
  const change = received - total;
  if (asserted !== undefined && asserted !== change)
    throw cashConflict('El cambio indicado no coincide con el cálculo');
  return change;
}
