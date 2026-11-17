import { apiFetch } from './client';
import type { ApiProduct } from './catalog';

/**
 * Obtiene la lista de productos favoritos del cliente autenticado.
 */
export async function getCustomerFavorites(): Promise<ApiProduct[]> {
  try {
    const res = await apiFetch<{ data: ApiProduct[] }>('/customers/me/favorites?limit=100');
    return res.data || [];
  } catch (err) {
    console.warn('No se pudieron obtener favoritos:', err);
    return [];
  }
}

/**
 * Agrega un producto a los favoritos del cliente.
 */
export async function addCustomerFavorite(productId: string): Promise<void> {
  await apiFetch(`/customers/me/favorites/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({}),
  });
}

/**
 * Remueve un producto de los favoritos del cliente.
 */
export async function removeCustomerFavorite(productId: string): Promise<void> {
  await apiFetch(`/customers/me/favorites/${productId}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}
