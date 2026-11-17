import { apiFetch } from './client.js';

/**
 * Consulta el listado paginado de ventas por rango de fechas (UTC) y método.
 */
export async function getSales({ from, to, method, limit = 20, cursor }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (method) params.set('method', method);
  if (limit) params.set('limit', limit.toString());
  if (cursor) params.set('cursor', cursor);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/sales${query}`);
  return {
    data: res.data || [],
    page: res.page || null,
  };
}

/**
 * Obtiene el resumen consolidado de ventas del período (suma de centavos y total de ventas).
 */
export async function getSalesSummary({ from, to, method }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (method) params.set('method', method);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/sales/summary${query}`);
  return res.data;
}
