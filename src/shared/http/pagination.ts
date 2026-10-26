import { z } from 'zod';
import { invalidInput } from './problem.js';

export const idSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .pipe(z.string().refine((id) => BigInt(id) <= 9223372036854775807n));
const limitSchema = z
  .string()
  .regex(/^\d{1,3}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100))
  .default(20);
export const pageQuerySchema = z
  .object({ limit: limitSchema, cursor: z.string().min(1).max(2048).optional() })
  .strict();
export type Position = { id: string; createdAt: string };
export type PageEntry<T> = { data: T; position: Position };
const cursorSchema = z
  .object({
    version: z.literal(1),
    scope: z.enum([
      'categories',
      'products',
      'admin-categories',
      'admin-products',
      'admin-option-groups',
      'admin-option-values',
    ]),
    filters: z.string(),
    id: idSchema,
    createdAt: z.string().datetime({ precision: 6 }),
  })
  .strict();

export type CursorScope =
  | 'categories'
  | 'products'
  | 'admin-categories'
  | 'admin-products'
  | 'admin-option-groups'
  | 'admin-option-values';
export function decodeCursor(
  token: string | undefined,
  scope: CursorScope,
  filters: string,
): Position | undefined {
  if (!token) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw invalidInput();
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.toString('base64url') !== token) throw invalidInput();
    const cursor = cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (cursor.scope !== scope || cursor.filters !== filters) throw invalidInput();
    return { id: cursor.id, createdAt: cursor.createdAt };
  } catch {
    throw invalidInput();
  }
}

export function paginate<T>(
  entries: PageEntry<T>[],
  limit: number,
  scope: CursorScope,
  filters: string,
) {
  const page = entries.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    entries.length > limit && last
      ? Buffer.from(JSON.stringify({ version: 1, scope, filters, ...last.position })).toString(
          'base64url',
        )
      : null;
  return { data: page.map((entry) => entry.data), page: { limit, nextCursor } };
}
