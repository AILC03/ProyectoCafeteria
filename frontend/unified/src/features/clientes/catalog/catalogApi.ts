import { ApiError, apiFetch } from '../../../shared/api/client';

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: string;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface CatalogOptionValue {
  id: string;
  name: string;
  surchargeCents: string;
  isAvailable: boolean;
}

export interface CatalogOptionGroup {
  id: string;
  name: string;
  pricingScope: 'GLOBAL' | 'PER_PRODUCT';
  minSelections: number;
  maxSelections: number;
  values: CatalogOptionValue[];
}

export interface CatalogPageInfo {
  limit: number;
  nextCursor: string | null;
}

interface CatalogListResponse<T> {
  data: T[];
  page?: CatalogPageInfo;
}

interface CatalogDetailResponse<T> {
  data: T;
}

const DEFAULT_PAGE_LIMIT = 100;
const MAX_CATALOG_PAGES = 10;

async function fetchPaginatedCatalogList<T>(
  baseEndpoint: string,
  baseParams: URLSearchParams,
  signal?: AbortSignal,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  for (let pageIndex = 0; pageIndex < MAX_CATALOG_PAGES; pageIndex += 1) {
    const params = new URLSearchParams(baseParams);
    params.set('limit', String(DEFAULT_PAGE_LIMIT));
    if (cursor !== null) {
      params.set('cursor', cursor);
    }

    const response = await apiFetch<CatalogListResponse<T>>(`${baseEndpoint}?${params.toString()}`, { signal });
    items.push(...response.data);

    const nextCursor = response.page?.nextCursor ?? null;
    if (nextCursor === null || nextCursor.length === 0 || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return items;
}

/** Fetches active catalog categories from the API following opaque pagination cursors. */
export function fetchCatalogCategories(signal?: AbortSignal): Promise<CatalogCategory[]> {
  return fetchPaginatedCatalogList<CatalogCategory>('/categories', new URLSearchParams(), signal);
}

/** Fetches active catalog products from the API following opaque pagination cursors. */
export function fetchCatalogProducts(
  options: { categoryId?: string; isAvailable?: boolean; signal?: AbortSignal } = {},
): Promise<CatalogProduct[]> {
  const params = new URLSearchParams();
  if (options.categoryId !== undefined && options.categoryId.length > 0) {
    params.set('categoryId', options.categoryId);
  }
  if (options.isAvailable !== undefined) {
    params.set('isAvailable', String(options.isAvailable));
  }
  return fetchPaginatedCatalogList<CatalogProduct>('/products', params, options.signal);
}

/** Fetches single product details from the API. */
export async function fetchCatalogProductDetail(productId: string, signal?: AbortSignal): Promise<CatalogProduct> {
  const response = await apiFetch<CatalogDetailResponse<CatalogProduct>>(
    `/products/${encodeURIComponent(productId)}`,
    { signal },
  );
  return response.data;
}

/** Fetches customization option groups and backend-resolved surcharges for a product. */
export async function fetchCatalogProductOptions(
  productId: string,
  signal?: AbortSignal,
): Promise<CatalogOptionGroup[]> {
  const response = await apiFetch<CatalogDetailResponse<CatalogOptionGroup[]>>(
    `/products/${encodeURIComponent(productId)}/options`,
    { signal },
  );
  return response.data;
}

/** Formats catalog API failures into safe, actionable Spanish messages. */
export function formatCatalogError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'No pudimos cargar el catálogo en este momento. Inténtalo de nuevo.';
  }
  if (error.status === 0) {
    return 'Sin conexión con el servidor. Verifica tu red e inténtalo de nuevo.';
  }
  if (error.status === 404) {
    return 'Este producto ya no está disponible en el catálogo.';
  }
  if (error.status === 429) {
    return 'Demasiadas consultas seguidas. Espera un momento e inténtalo de nuevo.';
  }
  if (error.status >= 500) {
    return 'El menú no está disponible temporalmente. Inténtalo más tarde.';
  }
  return 'No pudimos consultar el catálogo. Inténtalo de nuevo.';
}
