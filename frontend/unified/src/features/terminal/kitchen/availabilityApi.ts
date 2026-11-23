import { ApiError, apiFetch } from '../../../shared/api/client';

const ID = /^[1-9][0-9]{0,18}$/;
const DIGITS = /^[0-9]+$/;
const CENTS = /^(0|[1-9][0-9]{0,6})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const CATALOG_KEYS = new Set(['id', 'categoryId', 'name', 'description', 'basePriceCents', 'imageUrl', 'isAvailable']);
const CATALOG_ROOT_KEYS = new Set(['data', 'page']);
const PAGE_KEYS = new Set(['limit', 'nextCursor']);
const ADMIN_ROOT_KEYS = new Set(['data']);
const ADMIN_PRODUCT_KEYS = new Set([
  'id', 'categoryId', 'name', 'description', 'basePriceCents', 'imageUrl',
  'imagePublicId', 'imageVersion', 'isAvailable', 'deletedAt', 'createdAt', 'updatedAt',
]);

export type AvailabilityProduct = {
  id: string;
  name: string;
  basePriceCents: string;
  isAvailable: boolean;
};

/** A successful response that cannot be matched to the contract is never applied locally. */
export class UnverifiableAvailabilityResponseError extends Error {
  constructor() {
    super('La respuesta de disponibilidad no se puede verificar');
    this.name = 'UnverifiableAvailabilityResponseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function dateTime(value: unknown): value is string {
  return typeof value === 'string' && DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
}

function parseCatalogProduct(value: unknown): AvailabilityProduct {
  if (!isRecord(value) || !hasOnlyKeys(value, CATALOG_KEYS)
    || typeof value.id !== 'string' || !DIGITS.test(value.id)
    || typeof value.categoryId !== 'string' || !DIGITS.test(value.categoryId)
    || typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 160
    || (value.description !== null && typeof value.description !== 'string')
    || typeof value.basePriceCents !== 'string' || !CENTS.test(value.basePriceCents)
    || (value.imageUrl !== null && typeof value.imageUrl !== 'string')
    || typeof value.isAvailable !== 'boolean') {
    throw new UnverifiableAvailabilityResponseError();
  }
  return {
    id: value.id,
    name: value.name,
    basePriceCents: value.basePriceCents,
    isAvailable: value.isAvailable,
  };
}

function parseAdminProduct(value: unknown): AvailabilityProduct {
  if (!isRecord(value) || !hasOnlyKeys(value, ADMIN_PRODUCT_KEYS)
    || typeof value.id !== 'string' || !ID.test(value.id)
    || typeof value.categoryId !== 'string' || !ID.test(value.categoryId)
    || typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 160
    || (value.description !== null && typeof value.description !== 'string')
    || typeof value.basePriceCents !== 'string' || !CENTS.test(value.basePriceCents)
    || (value.imageUrl !== null && typeof value.imageUrl !== 'string')
    || (value.imagePublicId !== null && (typeof value.imagePublicId !== 'string' || value.imagePublicId.length < 1 || value.imagePublicId.length > 255))
    || (value.imageVersion !== null && (typeof value.imageVersion !== 'string' || value.imageVersion.length < 1 || value.imageVersion.length > 40))
    || typeof value.isAvailable !== 'boolean'
    || (value.deletedAt !== null && !dateTime(value.deletedAt))
    || !dateTime(value.createdAt) || !dateTime(value.updatedAt)) {
    throw new UnverifiableAvailabilityResponseError();
  }
  return {
    id: value.id,
    name: value.name,
    basePriceCents: value.basePriceCents,
    isAvailable: value.isAvailable,
  };
}

/**
 * Active catalogue products, available and sold out, read through the public
 * catalogue endpoint. No local cache: the API remains the source of truth.
 */
export async function listAvailabilityProducts(signal?: AbortSignal): Promise<AvailabilityProduct[]> {
  const products: AvailabilityProduct[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let index = 0; index < 10; index += 1) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor !== null) params.set('cursor', cursor);
    const response = await apiFetch<unknown>(`/products?${params.toString()}`, { signal });
    if (!isRecord(response) || !hasOnlyKeys(response, CATALOG_ROOT_KEYS)
      || !Array.isArray(response.data) || !isRecord(response.page)
      || !hasOnlyKeys(response.page, PAGE_KEYS)
      || !Number.isInteger(response.page.limit) || (response.page.limit as number) < 1
      || (response.page.limit as number) > 100
      || (response.page.nextCursor !== null
        && (typeof response.page.nextCursor !== 'string' || response.page.nextCursor.length === 0))) {
      throw new UnverifiableAvailabilityResponseError();
    }
    products.push(...response.data.map(parseCatalogProduct));
    cursor = response.page.nextCursor as string | null;
    if (cursor === null) return products;
    if (seen.has(cursor)) throw new UnverifiableAvailabilityResponseError();
    seen.add(cursor);
  }
  throw new UnverifiableAvailabilityResponseError();
}

/** The only availability mutation allowed to CAJERO; body is exactly `{ isAvailable }`. */
export async function setProductAvailability(productId: string, isAvailable: boolean): Promise<AvailabilityProduct> {
  if (typeof productId !== 'string' || !ID.test(productId)) throw new TypeError('Producto no válido.');
  if (typeof isAvailable !== 'boolean') throw new TypeError('La disponibilidad debe ser booleana.');
  const response = await apiFetch<unknown>(`/products/${productId}/availability`, {
    method: 'PATCH',
    body: { isAvailable },
  });
  if (!isRecord(response) || !hasOnlyKeys(response, ADMIN_ROOT_KEYS)) throw new UnverifiableAvailabilityResponseError();
  const product = parseAdminProduct(response.data);
  if (product.id !== productId || product.isAvailable !== isAvailable) throw new UnverifiableAvailabilityResponseError();
  return product;
}

export function formatAvailabilityError(error: unknown): string {
  if (error instanceof UnverifiableAvailabilityResponseError) return 'La respuesta de disponibilidad no se puede verificar. No se aplicó ningún cambio.';
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible cambiar la disponibilidad.';
  if (error.status === 403) return 'Sólo caja y administración pueden cambiar la disponibilidad.';
  if (error.status === 404) return 'El producto ya no existe en el catálogo.';
  if (error.status === 409) return 'El producto cambió en otro lugar. Actualiza la lista antes de intentarlo de nuevo.';
  if (error.status === 400) return 'La solicitud de disponibilidad no es válida.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 429) return 'Demasiados cambios. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) return 'No fue posible cambiar la disponibilidad. Inténtalo de nuevo.';
  return 'No fue posible cambiar la disponibilidad.';
}
