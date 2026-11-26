// Serializador CSV acotado para exportaciones administrativas: UTF-8 con BOM,
// coma, RFC 4180 y CRLF final. No implementa streaming ni persistencia.
const BOM = '\uFEFF';
const CRLF = '\r\n';

export type CsvText = { text: string };
export type CsvValue = string | CsvText;

const TEXT_FORMULA_START = '=+-@\t\r\n';
const LEADING_SPACES_FORMULA = /^ +[=+\-@]/;

/** Neutraliza fórmulas solo en campos de texto, sin alterar importes ni IDs. */
export function neutralizeFormula(value: string): string {
  if (value.length === 0) return value;
  const first = value[0]!;
  return TEXT_FORMULA_START.includes(first) || LEADING_SPACES_FORMULA.test(value)
    ? `'${value}`
    : value;
}

function quote(value: string): string {
  return value.includes(',') || value.includes('"') || value.includes('\r') || value.includes('\n')
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

function field(value: CsvValue): string {
  return quote(typeof value === 'string' ? value : neutralizeFormula(value.text));
}

export type CsvMetadata = readonly (readonly [string, string])[];

/**
 * Serializa metadatos `#meta`, encabezado y filas en un único buffer. El BOM no
 * forma parte del primer encabezado lógico y cada registro, incluido el último,
 * termina en CRLF.
 */
export function serializeCsv(
  metadata: CsvMetadata,
  header: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): Buffer {
  const lines: string[] = [];
  for (const [key, value] of metadata)
    lines.push(['#meta', field(key), field({ text: value })].join(','));
  lines.push(header.map((cell) => field(cell)).join(','));
  for (const row of rows) lines.push(row.map((cell) => field(cell)).join(','));
  return Buffer.from(`${BOM}${lines.join(CRLF)}${CRLF}`, 'utf8');
}
