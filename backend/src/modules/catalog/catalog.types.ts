import type { PageEntry, Position } from '../../shared/http/pagination.js';

export type CategoryDto = { id: string; name: string };
export type ProductDto = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: string;
  imageUrl: string | null;
  isAvailable: boolean;
};
export type OptionValueDto = {
  id: string;
  name: string;
  surchargeCents: string;
  isAvailable: boolean;
};
export type OptionGroupDto = {
  id: string;
  name: string;
  pricingScope: 'GLOBAL' | 'PER_PRODUCT';
  minSelections: number;
  maxSelections: number;
  values: OptionValueDto[];
};
export type ProductFilters = { categoryId?: string; isAvailable?: boolean };
export type ListInput = { limit: number; after?: Position };
export interface CatalogRepository {
  listCategories(input: ListInput): Promise<PageEntry<CategoryDto>[]>;
  listProducts(input: ListInput & ProductFilters): Promise<PageEntry<ProductDto>[]>;
  getProduct(id: string): Promise<ProductDto | null>;
  getOptions(id: string): Promise<OptionGroupDto[] | null>;
}
