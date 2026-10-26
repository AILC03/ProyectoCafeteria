import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import { notFound, invalidInput } from '../../shared/http/problem.js';
import type { Resource } from './admin.validation.js';

const metadata = {
  categories: {
    table: 'categories',
    columns: 'id,name,is_active,deleted_at,created_at',
    time: true,
  },
  products: {
    table: 'products',
    columns:
      'id,category_id,name,description,base_price_cents,image_url,image_public_id,image_version,is_available,deleted_at,created_at,updated_at',
    time: true,
  },
  'option-groups': {
    table: 'option_groups',
    columns: 'id,name,pricing_scope,deleted_at',
    time: false,
  },
  'option-values': {
    table: 'option_values',
    columns: 'id,option_group_id,name,global_surcharge_cents,is_available,deleted_at',
    time: false,
  },
} as const;
function camel(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_match, c: string) => c.toUpperCase()),
      value,
    ]),
  );
}
export class AdminRepository {
  constructor(readonly db: PrismaClient) {}
  async list(
    resource: Resource,
    input: { limit: number; cursor?: string; includeDeleted: boolean; groupId?: string },
  ) {
    if (input.groupId && resource !== 'option-values') throw invalidInput();
    const meta = metadata[resource],
      scope = `admin-${resource}` as const;
    const filters = JSON.stringify({
      includeDeleted: input.includeDeleted,
      groupId: input.groupId ?? null,
    });
    const after = decodeCursor(input.cursor, scope, filters);
    const table = Prisma.raw(meta.table),
      columns = Prisma.raw(meta.columns);
    const time = meta.time
      ? Prisma.sql`to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
      : Prisma.sql`'1970-01-01T00:00:00.000000Z'::text`;
    const rows = await this.db.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`SELECT ${columns},${time} AS position_time FROM ${table}
      WHERE ${input.includeDeleted ? Prisma.sql`true` : Prisma.sql`deleted_at IS NULL`}
      ${input.groupId ? Prisma.sql`AND option_group_id=${BigInt(input.groupId)}` : Prisma.empty}
      ${after ? (meta.time ? Prisma.sql`AND (created_at,id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.sql`AND id>${BigInt(after.id)}`) : Prisma.empty}
      ORDER BY ${meta.time ? Prisma.sql`created_at,id` : Prisma.sql`id`} LIMIT ${input.limit + 1}`);
    return paginate(
      rows.map(({ position_time, ...row }) => ({
        data: camel(row),
        position: { id: String(row.id), createdAt: String(position_time) },
      })),
      input.limit,
      scope,
      filters,
    );
  }
  async get(resource: Resource, id: bigint) {
    const meta = metadata[resource];
    const rows = await this.db.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT ${Prisma.raw(meta.columns)} FROM ${Prisma.raw(meta.table)} WHERE id=${id}`,
    );
    if (!rows[0]) throw notFound();
    return camel(rows[0]);
  }
}
