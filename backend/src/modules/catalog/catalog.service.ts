import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import { notFound } from '../../shared/http/problem.js';
import type { CatalogRepository, ProductFilters } from './catalog.types.js';

export class CatalogService {
  constructor(private repository: CatalogRepository) {}
  async categories(input: { limit: number; cursor?: string }) {
    const after = decodeCursor(input.cursor, 'categories', '');
    return paginate(
      await this.repository.listCategories({ limit: input.limit, after }),
      input.limit,
      'categories',
      '',
    );
  }
  async products(input: { limit: number; cursor?: string } & ProductFilters) {
    const filters = JSON.stringify({
      categoryId: input.categoryId ?? null,
      isAvailable: input.isAvailable ?? null,
    });
    const after = decodeCursor(input.cursor, 'products', filters);
    const rows = await this.repository.listProducts({
      limit: input.limit,
      after,
      categoryId: input.categoryId,
      isAvailable: input.isAvailable,
    });
    return paginate(rows, input.limit, 'products', filters);
  }
  async product(id: string) {
    const product = await this.repository.getProduct(id);
    if (!product) throw notFound();
    return { data: product };
  }
  async options(id: string) {
    const groups = await this.repository.getOptions(id);
    if (groups === null) throw notFound();
    return { data: groups };
  }
}
