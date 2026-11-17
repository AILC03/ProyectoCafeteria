// ADR0011: secuencias identity, sin MAX+1, truncamiento ni reinicio diario.
export function visibleNumber(prefix: 'A' | 'C' | 'V', id: bigint) {
  if (id < 1n || id > 9223372036854775807n) throw new Error('Identity fuera de rango');
  return `${prefix}${id.toString().padStart(6, '0')}`;
}
