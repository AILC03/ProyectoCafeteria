import { ApiError, apiFetch } from '../../../shared/api/client';
import type { CartDraftItem } from '../../../shared/storage';
import type { PaymentMethod } from '../orders/mobileOrders';

export type Profile = { customerNumber: string; name: string; phone: string; recoveryEmail: string | null; recoveryEmailVerifiedAt: string | null; createdAt: string };
export type Favorite = { productId: string; categoryId: string; name: string; description: string | null; basePriceCents: string; imageUrl: string | null; isAvailable: boolean; favoritedAt: string };
export type OrderSummary = { id: string; folio: string; status: 'PENDIENTE_PAGO' | 'EN_PREPARACION' | 'LISTO' | 'EXPIRADA'; paymentMethod: PaymentMethod; totalCents: string; createdAt: string; paymentExpiresAt: string; paidAt: string | null; readyAt: string | null };
export type OrderDetail = OrderSummary & { source: 'MOBILE' | 'CASHIER'; items: { productName: string; quantity: number; unitPriceCents: string; lineTotalCents: string }[] };
export type Preview = { sourceOrderId: string; canCreateOrder: boolean; totalCents: string | null; items: (CartDraftItem & { productName: string; currentUnitPriceCents: string | null; currentLineTotalCents: string | null })[]; warnings: { line: number | null; code: 'PRODUCT_UNAVAILABLE' | 'OPTION_UNAVAILABLE' | 'SELECTION_INVALID' | 'PRICE_CHANGED' | 'PRODUCT_CHANGED' | 'OPTION_CHANGED' | 'TOTAL_LIMIT_EXCEEDED'; blocking: boolean; optionValueId: string | null }[] };
export type Page<T> = { data: T[]; page: { limit: number; nextCursor: string | null } };
type Envelope<T> = { data: T };
const validId = (id: string) => /^[1-9][0-9]{0,18}$/.test(id);
function idPath(id: string): string { if (!validId(id)) throw new Error('ID inválido'); return encodeURIComponent(id); }
const pageQuery = (cursor?: string) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';

export const getProfile = (signal?: AbortSignal) => apiFetch<Envelope<Profile>>('/customers/me', { signal }).then((r) => r.data);
export const patchProfile = (body: { name?: string; phone?: string; currentPin?: string }) => apiFetch<Envelope<{ id: string; customerNumber: string; name: string; phone: string }>>('/customers/me', { method: 'PATCH', body });
export const getFavorites = (cursor?: string, signal?: AbortSignal) => apiFetch<Page<Favorite>>(`/customers/me/favorites${pageQuery(cursor)}`, { signal });
export const changeFavorite = (id: string, add: boolean) => apiFetch<void>(`/customers/me/favorites/${idPath(id)}`, { method: add ? 'PUT' : 'DELETE' });
export const getOrders = (cursor?: string, signal?: AbortSignal) => apiFetch<Page<OrderSummary>>(`/customers/me/orders${pageQuery(cursor)}`, { signal });
export const getOrder = (id: string, signal?: AbortSignal) => apiFetch<Envelope<OrderDetail>>(`/orders/${idPath(id)}`, { signal }).then((r) => r.data);
export const getPreview = (id: string, signal?: AbortSignal) => apiFetch<Envelope<Preview>>(`/customers/me/orders/${idPath(id)}/repeat-preview`, { method: 'POST', body: {}, signal }).then((r) => r.data);

export function checkedPreview(preview: Preview, sourceId: string): CartDraftItem[] {
  if (preview.sourceOrderId !== sourceId || !preview.canCreateOrder || preview.totalCents === null
    || preview.warnings.some((warning) => warning.blocking) || preview.items.length < 1 || preview.items.length > 50
    || preview.items.some((item) => !validId(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99
      || !Array.isArray(item.optionValueIds) || item.optionValueIds.some((id) => !validId(id))
      || item.currentUnitPriceCents === null || item.currentLineTotalCents === null)) {
    throw new ApiError(0, 'La selección no se puede confirmar. Actualiza la vista previa.');
  }
  return preview.items.map(({ productId, quantity, optionValueIds }) => ({ productId, quantity, optionValueIds: [...optionValueIds] }));
}
