# Clientes: catálogo, perfil, historial y recuperación (`frontend/clientes`)

Documenta la implementación de la aplicación móvil/web para clientes (`frontend/clientes/`) y los
pendientes respecto a los módulos `CAT-01/02`, `CUS-01` y `FIN-01` del backend.

## 1. Flujo de navegación y pantallas

| Ruta | Componente | Función |
| --- | --- | --- |
| `/` | `Navigate` | Redirige a `/iniciar-sesion` |
| `/iniciar-sesion` | `AuthPage.tsx` | Login por teléfono/número + NIP, registro por token de ticket, entrada como invitado |
| `/registro` | `Navigate` | Redirige a `/iniciar-sesion` |
| `/menu` | `MenuPage.tsx` | Menú público, categorías, filtro de favoritos, personalización, carrito, perfil e historial |

## 2. Catálogo y personalización (`MenuPage`, `ProductCard`, `ProductModal`)

- **Carga de catálogo (`MenuPage.tsx`)**: Al montar consulta en paralelo `getCategories()` (`GET /categories?limit=100`) y `getProducts()` (`GET /products?limit=100`). Si ambos devuelven vacío o fallan, lee `coffees_menu_categories_local` y `coffees_menu_products_local` desde `localStorage` (si existen en el mismo navegador).
- **Imágenes y categorías**: `utils/categories.ts` asigna un icono Material Symbols según palabras clave del nombre de categoría (`local_cafe`, `mode_fan`, `eco`, `bakery_dining`, `lunch_dining`, `local_bar`). `getProductImage()` asigna imágenes de respaldo de Unsplash cuando `imageUrl` es `null`.
- **Disponibilidad (`ProductCard.tsx`)**: Muestra etiqueta roja `"Agotado"` y deshabilita el botón `"No disponible"` cuando `!product.isAvailable`.
- **Personalización (`ProductModal.tsx`)**:
  - Al seleccionar un producto, consulta `GET /api/v1/products/{productId}/options` (`getProductOptions`).
  - Preselecciona la primera opción disponible de cada grupo con `minSelections >= 1`.
  - Respeta `maxSelections === 1` (selección única) y multi-selección hasta `maxSelections`, deshabilitando valores con `!val.isAvailable`.
  - Calcula el precio unitario estimado sumando `basePriceCents + sum(surchargeCents)` en centavos enteros y lo multiplica por `quantity` (tope UI de 20 en modal).
  - Permite capturar el nombre para el vaso (`cupName`).

### Qué falta en catálogo y personalización

- **Validación de `minSelections` antes de agregar**: Si un grupo obligatorio no tiene opciones disponibles al cargar o si un grupo multi-selección requiere mínimo 2 opciones, `ProductModal.tsx` no bloquea el botón `"Agregar al pedido"` ni muestra alerta antes de enviar a `POST /orders`.
- **Paginación con cursor**: `catalog.ts` pide un único bloque `limit=100` e ignora `page.nextCursor`.

## 3. Perfil de cliente (`ProfileModal.tsx`)

- **Implementado**:
  - Muestra `customerNumber`, `phone` y `recoveryEmail` (si existe) para clientes autenticados (`GET /api/v1/customers/me`).
  - Permite editar el nombre (`PATCH /api/v1/customers/me` con `{ name }`) para clientes reales o actualizar `guestName` en `localStorage` para invitados.
  - Botón `Cerrar sesión` (`POST /auth/logout`) o `Iniciar sesión` si es invitado.
- **Qué falta (`CUS-01` y `FIN-01`)**:
  - **Cambio de teléfono con NIP actual**: `updateCustomerProfile` en `src/api/auth.ts` ya acepta `{ name, phone, currentPin }`, pero `ProfileModal.tsx` no tiene formulario ni campo para `phone` y `currentPin`, ni maneja la revocación automática de sesiones y redirección a login cuando cambia el teléfono.
  - **Correo de verificación (`POST /customers/me/recovery-email`)**: No muestra si `recoveryEmailVerifiedAt` está verificado ni permite solicitar enlace de verificación de correo.
  - **Cambio de NIP (`PATCH /auth/pin`)**: No existe opción en el perfil para actualizar el NIP actual.

## 4. Historial de pedidos (`OrderHistoryModal.tsx`)

- **Estado actual (Desconectado de la API)**:
  - Aunque `src/api/orders.ts` ya exporta `getCustomerOrders(cursor)` (`GET /api/v1/customers/me/orders`), **`OrderHistoryModal.tsx` no la utiliza**.
  - En su lugar, lee `pastOrders` de `CartContext.tsx`, que provienen de `localStorage.getItem('taffy_past_orders')` (un arreglo vacío desde que se limpiaron los datos demo) y usa filtros estáticos locales (`caliente`, `panaderia`, `te`).
  - El botón `Repetir` llama a `reorderPastItem()` localmente sin consultar catálogo ni opciones reales del backend.
- **Qué falta por implementar**:
  1. Conectar `OrderHistoryModal.tsx` a `getCustomerOrders()` cuando `currentUser` esté autenticado (paginando con `nextCursor` y ocultando o mostrando aviso de login para invitados).
  2. Mostrar el estado real de cada orden (`PENDIENTE_PAGO`, `EN_PREPARACION`, `LISTO`, `EXPIRADA`), método de pago (`CASH` / `STRIPE`), folio y fecha UTC formateada localmente.
  3. Consultar el detalle con snapshots usando `GET /api/v1/orders/{id}`.
  4. Consultar el ticket propio de órdenes pagadas con `GET /api/v1/customers/me/orders/{id}/ticket`.
  5. Conectar el botón de repetir pedido a `POST /api/v1/customers/me/orders/{id}/repeat-preview` (ver [favoritos y repetición](favorites-implementation.md)).

## 5. Verificación de correo y recuperación de NIP (`FIN-01`)

El backend emite enlaces de prueba hacia `/verificar-correo#token=...` y `/recuperar-nip#token=...`.
Ninguna de estas dos rutas existe actualmente en `frontend/clientes/src/App.tsx`:

- Falta ruta `/verificar-correo`: leer token del fragmento `#token=` en memoria, borrarlo de la barra de direcciones inmediatamente con `history.replaceState`, solicitar CSRF y enviar `POST /api/v1/auth/email-verification` `{ token }`.
- Falta flujo y ruta `/recuperar-nip`: pantalla para solicitar recuperación (`POST /api/v1/auth/pin-recovery` `{ identifier }` con mensaje genérico 202) y pantalla para confirmar el enlace capturando fragmento y enviando `POST /api/v1/auth/pin-recovery/confirm` `{ token, newPin }`.

Referencias: [guía CUS-01 backend](../../backend/docs/customers-implementation.md), [integración FIN-01](../../backend/docs/frontend-integration.md), [cobertura API](api/endpoints-coverage.md).
