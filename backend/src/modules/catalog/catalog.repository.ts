import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { HttpProblem } from '../../shared/http/problem.js';
import type {
  CatalogRepository,
  CategoryDto,
  ProductDto,
  OptionGroupDto,
  ListInput,
  ProductFilters,
} from './catalog.types.js';

const productColumns = Prisma.sql`p.id::text AS id,p.category_id::text AS "categoryId",p.name,p.description,p.base_price_cents::text AS "basePriceCents",p.image_url AS "imageUrl",p.is_available AS "isAvailable"`;
// Conservar los seis decimales de PostgreSQL; Date de JS pierde microsegundos.
const timestamp = (alias: 'p' | 'c') =>
  alias === 'p'
    ? Prisma.sql`to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
    : Prisma.sql`to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private db: PrismaClient) {}
  async listCategories({ limit, after }: ListInput) {
    const rows = await this.db.$queryRaw<(CategoryDto & { positionTime: string })[]>(Prisma.sql`
      SELECT c.id::text AS id,c.name,${timestamp('c')} AS "positionTime"
      FROM categories c WHERE c.is_active AND c.deleted_at IS NULL
      ${after ? Prisma.sql`AND (c.created_at,c.id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
      ORDER BY c.created_at,c.id LIMIT ${limit + 1}`);
    return rows.map(({ positionTime, ...data }) => ({
      data,
      position: { id: data.id, createdAt: positionTime },
    }));
  }
  async listProducts({ limit, after, categoryId, isAvailable }: ListInput & ProductFilters) {
    const rows = await this.db.$queryRaw<(ProductDto & { positionTime: string })[]>(Prisma.sql`
      SELECT ${productColumns},${timestamp('p')} AS "positionTime" FROM products p
      JOIN categories c ON c.id=p.category_id
      WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active
      ${after ? Prisma.sql`AND (p.created_at,p.id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
      ${categoryId ? Prisma.sql`AND p.category_id=${BigInt(categoryId)}` : Prisma.empty}
      ${isAvailable !== undefined ? Prisma.sql`AND p.is_available=${isAvailable}` : Prisma.empty}
      ORDER BY p.created_at,p.id LIMIT ${limit + 1}`);
    return rows.map(({ positionTime, ...data }) => ({
      data,
      position: { id: data.id, createdAt: positionTime },
    }));
  }
  async getProduct(id: string) {
    const rows = await this.db.$queryRaw<ProductDto[]>(Prisma.sql`
      SELECT ${productColumns} FROM products p JOIN categories c ON c.id=p.category_id
      WHERE p.id=${BigInt(id)} AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active`);
    return rows[0] ?? null;
  }
  async getOptions(id: string) {
    type Row = {
      groupId: string | null;
      groupName: string;
      pricingScope: 'GLOBAL' | 'PER_PRODUCT';
      minSelections: number;
      maxSelections: number;
      valueId: string | null;
      valueName: string;
      surchargeCents: string | null;
      isAvailable: boolean;
    };
    const rows = await this.db.$queryRaw<Row[]>(Prisma.sql`
      SELECT g.id::text AS "groupId",g.name AS "groupName",g.pricing_scope AS "pricingScope",
        a.min_selections AS "minSelections",a.max_selections AS "maxSelections",v.id::text AS "valueId",
        v.name AS "valueName",v.is_available AS "isAvailable",
        (CASE WHEN g.pricing_scope='GLOBAL' THEN v.global_surcharge_cents ELSE av.surcharge_override_cents END)::text AS "surchargeCents"
      FROM products p JOIN categories c ON c.id=p.category_id
      LEFT JOIN product_option_groups a ON a.product_id=p.id
      LEFT JOIN option_groups g ON g.id=a.option_group_id AND g.deleted_at IS NULL
      LEFT JOIN product_option_values av ON av.product_option_group_id=a.id
      LEFT JOIN option_values v ON v.id=av.option_value_id AND v.deleted_at IS NULL AND v.option_group_id=g.id
      WHERE p.id=${BigInt(id)} AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active
      ORDER BY a.id,v.id`);
    if (!rows.length) return null;
    const groups = new Map<string, OptionGroupDto>();
    for (const row of rows) {
      if (!row.groupId) continue;
      let group = groups.get(row.groupId);
      if (!group) {
        group = {
          id: row.groupId,
          name: row.groupName,
          pricingScope: row.pricingScope,
          minSelections: row.minSelections,
          maxSelections: row.maxSelections,
          values: [],
        };
        groups.set(row.groupId, group);
      }
      if (row.valueId) {
        if (row.surchargeCents === null)
          throw new HttpProblem(
            503,
            'DEPENDENCY_UNAVAILABLE',
            'Catálogo temporalmente indisponible',
          );
        group.values.push({
          id: row.valueId,
          name: row.valueName,
          surchargeCents: row.surchargeCents,
          isAvailable: row.isAvailable,
        });
      }
    }
    return [...groups.values()];
  }
}
