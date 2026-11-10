import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import type { Principal } from '../auth/auth.types.js';
import type { SalesFilters } from './sales.validation.js';
import type { SalesRepository } from './sales.read.repository.js';
export { SalesRepository } from './sales.read.repository.js';
export class SalesService {
  constructor(readonly repository: SalesRepository) {}
  async list(actor: Principal, input: SalesFilters & { limit: number; cursor?: string }) {
    const { limit, cursor, ...filters } = input;
    const scope = JSON.stringify([
      filters.from ?? null,
      filters.to ?? null,
      filters.method ?? null,
    ]);
    return paginate(
      await this.repository.list(actor, filters, limit, decodeCursor(cursor, 'sales', scope)),
      limit,
      'sales',
      scope,
    );
  }
  summary(actor: Principal, input: SalesFilters) {
    return this.repository.summary(actor, input);
  }
}
