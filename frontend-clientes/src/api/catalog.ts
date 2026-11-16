import { apiFetch } from './client';

export interface ApiCategory {
  id: string;
  name: string;
}

export interface ApiProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: string;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface ApiOptionValue {
  id: string;
  name: string;
  surchargeCents: string;
  isAvailable: boolean;
}

export interface ApiOptionGroup {
  id: string;
  name: string;
  pricingScope: 'GLOBAL' | 'PER_PRODUCT';
  minSelections: number;
  maxSelections: number;
  values: ApiOptionValue[];
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
}

export interface ApiResponse<T> {
  data: T;
  page?: PageInfo;
}

/**
 * Obtiene todas las categorías activas.
 */
export async function getCategories(): Promise<ApiCategory[]> {
  const res = await apiFetch<ApiResponse<ApiCategory[]>>('/categories?limit=100');
  return res.data;
}

/**
 * Lista productos activos del catálogo.
 * Opcionalmente filtrados por categoría.
 */
export async function getProducts(categoryId?: string): Promise<ApiProduct[]> {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}&limit=100` : '?limit=100';
  const res = await apiFetch<ApiResponse<ApiProduct[]>>(`/products${query}`);
  return res.data;
}

/**
 * Obtiene el detalle de un producto por ID.
 */
export async function getProduct(productId: string): Promise<ApiProduct> {
  const res = await apiFetch<ApiResponse<ApiProduct>>(`/products/${productId}`);
  return res.data;
}

/**
 * Obtiene los grupos y valores de opciones (tamaños, leches, extras) configurados para el producto.
 */
export async function getProductOptions(productId: string): Promise<ApiOptionGroup[]> {
  const res = await apiFetch<ApiResponse<ApiOptionGroup[]>>(`/products/${productId}/options`);
  return res.data;
}
