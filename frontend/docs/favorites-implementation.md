# Favoritos y repetición de órdenes (`FAV-01`)

Documenta el estado de los favoritos de producto y la repetición de órdenes en `frontend/clientes/`,
comparado con la especificación [FAV-01 del backend](../../backend/docs/favorites-implementation.md).

## 1. Favoritos de producto — Implementado (con matices)

### Archivos involucrados

- `frontend/clientes/src/api/favorites.ts`:
  - `getCustomerFavorites()`: llama a `GET /api/v1/customers/me/favorites?limit=100`.
  - `addCustomerFavorite(productId)`: llama a `PUT /api/v1/customers/me/favorites/{productId}` con cuerpo `{}`.
  - `removeCustomerFavorite(productId)`: llama a `DELETE /api/v1/customers/me/favorites/{productId}` con cuerpo `{}`.
- `frontend/clientes/src/context/AuthContext.tsx`:
  - Carga los IDs favoritos en `refreshProfile()` al iniciar sesión.
  - `toggleFavorite(productId)`: aplica actualización optimista en `currentUser.favorites`, llama a la API y revierte el estado si falla la petición.
- `frontend/clientes/src/components/ProductCard.tsx`, `Header.tsx` y `MenuPage.tsx`:
  - Botón de corazón sobre cada tarjeta y filtro `"Tus Favoritos"` en el header.

### Limitaciones y pendientes en favoritos

1. **Comportamiento para invitados**: El icono de corazón en `ProductCard.tsx` y el filtro en `Header.tsx` siguen visibles para usuarios invitados (`!currentUser`), pero `toggleFavorite()` retorna sin hacer nada ni mostrar aviso al usuario, dando la impresión de que el botón no funciona. Debe ocultarse o mostrar un toast invitando a iniciar sesión/registrarse.
2. **Feedback en error**: Si `addCustomerFavorite` o `removeCustomerFavorite` falla (ej. `404` porque el producto fue retirado del catálogo o `401` por sesión expirada), `AuthContext` solo registra `console.error` sin notificar al usuario vía `ToastContext`.
3. **Paginación**: `getCustomerFavorites()` pide `limit=100` en una sola página e ignora `page.nextCursor`.

## 2. Repetición de órdenes (`repeat-preview`) — Pendiente

### Qué hace actualmente el frontend

- `CartContext.tsx` posee `reorderPastItem()` y `reorderAllPastItems()`, consumidos desde `OrderHistoryModal.tsx`.
- Estas funciones toman datos locales de `taffy_past_orders` (`localStorage`) y agregan el producto directo al carrito con el precio guardado localmente, **sin consultar el catálogo vigente ni validar opciones retiradas o agotadas**. Como `taffy_past_orders` está vacío en uso real, esta funcionalidad está inoperativa.

### Qué falta por implementar según `FAV-01`

1. Añadir en `src/api/orders.ts` (o `src/api/favorites.ts`) la función `previewOrderRepeat(orderId)` que invoque:
   - `POST /api/v1/customers/me/orders/{id}/repeat-preview` con cuerpo `{}` y token CSRF (requiere sesión `CLIENTE`).
2. Crear un modal o sección de revisión en `OrderHistoryModal.tsx` que muestre:
   - Los ítems con su `productName`, opciones originales, `currentUnitPriceCents` y `currentLineTotalCents`.
   - Todos los avisos (`warnings`) devueltos por el backend, diferenciando avisos informativos (`PRICE_CHANGED`, `PRODUCT_CHANGED`, `OPTION_CHANGED`) de bloqueos (`PRODUCT_UNAVAILABLE`, `OPTION_UNAVAILABLE`, `SELECTION_INVALID`, `TOTAL_LIMIT_EXCEEDED`).
3. Cuando `canCreateOrder === false` (y `totalCents === null`), deshabilitar la confirmación directa y permitir al cliente abrir `ProductModal` para reconfigurar el producto con el catálogo vigente.
4. Cuando `canCreateOrder === true`, agregar las líneas válidas al carrito o confirmar generando una **nueva** `Idempotency-Key` contra `POST /api/v1/orders` enviando únicamente `{ productId, quantity, optionValueIds }`.

Referencias: [FAV-01 backend](../../backend/docs/favorites-implementation.md), [guía de integración](../../backend/docs/frontend-integration.md).
