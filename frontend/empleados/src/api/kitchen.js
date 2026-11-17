import { apiFetch } from './client.js';

/**
 * Consulta órdenes en preparación (Cocina / Barista).
 * Rol requerido: PREPARACION, CAJERO o ADMINISTRADOR.
 * @returns {Promise<Array>} Lista de órdenes en preparación
 */
export async function getPreparationOrders() {
  const data = await apiFetch('/preparation/orders?limit=50', {
    method: 'GET',
  });
  return data.data || [];
}

/**
 * Obtiene el detalle completo de una orden específica (incluye items y opciones).
 * @param {string} orderId ID numérico de la orden
 * @returns {Promise<Object>} Detalle de la orden
 */
export async function getOrderDetails(orderId) {
  const data = await apiFetch(`/orders/${orderId}`, {
    method: 'GET',
  });
  return data.data;
}

/**
 * Marca una orden en preparación como LISTO.
 * Rol requerido: PREPARACION, CAJERO o ADMINISTRADOR.
 * @param {string} orderId ID numérico de la orden
 * @returns {Promise<Object>} Resultado de la orden actualizada
 */
export async function markOrderReady(orderId) {
  const data = await apiFetch(`/orders/${orderId}/ready`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.data;
}
