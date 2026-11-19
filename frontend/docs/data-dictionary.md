# Diccionario de datos y almacenamiento del frontend

Define los tipos de dominio usados en `frontend/clientes/` (`src/types/index.ts` y DTOs en
`src/api/*.ts`), el estado en `frontend/empleados/` y el inventario completo de claves en
`localStorage`.

## 1. Modelos y tipos en `frontend/clientes/`

### Catálogo (`src/api/catalog.ts` y `src/types/index.ts`)

| Tipo | Campos principales | Notas de contrato |
| --- | --- | --- |
| `ApiCategory` / `Category` | `id: string`, `name: string`, `icon?`, `count?` | `id` siempre decimal como string (`"1"`). `icon` y `count` son derivados en UI |
| `ApiProduct` / `Product` | `id`, `categoryId`, `name`, `description`, `basePriceCents: string`, `imageUrl`, `isAvailable: boolean` | `Product` adapta `basePriceCents` a `price: number` para presentación mediante `centsToNumber()` |
| `ApiOptionGroup` | `id`, `name`, `pricingScope: 'GLOBAL' \| 'PER_PRODUCT'`, `minSelections: number`, `maxSelections: number`, `values: ApiOptionValue[]` | Determina reglas de selección en `ProductModal.tsx` |
| `ApiOptionValue` | `id`, `name`, `surchargeCents: string`, `isAvailable: boolean` | `surchargeCents` ya viene resuelto por el backend según `pricingScope` |

### Carrito, órdenes y usuario (`src/types/index.ts` y `src/api/*.ts`)

| Tipo | Campos principales | Origen / uso |
| --- | --- | --- |
| `CartItem` | `cartItemId`, `productId`, `name`, `price`, `basePriceCents`, `unitPriceCents`, `quantity`, `image`, `cupName`, `optionValueIds: string[]`, `customizationsSummary?` | Persiste en `taffy_cart` (`localStorage`); solo `productId`, `quantity` y `optionValueIds` se envían a `POST /orders` |
| `CustomerAuthUser` | `id`, `name`, `role: 'CLIENTE'`, `accountType: 'CUSTOMER'`, `mustChangePin: boolean` | Respuesta de `POST /auth/login/customer` |
| `CustomerProfile` | `customerNumber`, `name`, `phone`, `recoveryEmail`, `recoveryEmailVerifiedAt`, `createdAt` | Respuesta de `GET /customers/me` |
| `User` | `id`, `customerNumber?`, `name`, `phone?`, `email?`, `favorites: string[]` | Modelo en memoria de `AuthContext` (incluye `pin?` obsoleto sin usar) |
| `BackendOrder` | `id`, `folio`, `source`, `status`, `paymentMethod`, `totalCents`, `customerId`, `guestName`, `paymentExpiresAt`, `paidAt`, `readyAt`, `readyByEmployeeId`, `createdAt`, `items?` | Respuesta de `POST /orders`, `GET /orders/{id}` y `GET /customers/me/orders` |
| `CreateOrderResponse` | `data: BackendOrder`, `cashQr?`, `checkout?` | `cashQr`: `{ purpose: 'CASH_PAYMENT', token, qrPayload, expiresAt }`; `checkout`: `{ purpose: 'STRIPE_CHECKOUT', token, expiresAt }` |
| `Order` | Versión adaptada para UI con `pickupType: 'aqui' \| 'llevar'`, `cupName`, `total: number` y `cashQr?` | Usada en `CartContext` y `OrderConfirmationModal` |

> [!NOTE]
> En `src/types/index.ts` (línea 102) y `src/api/orders.ts` (línea 35), los tipos declaran estados
> `PAGADA`, `PREPARANDO`, `ENTREGADA` y `CANCELADA` que **no existen** en el backend. Los estados
> reales en PostgreSQL / OpenAPI son únicamente `PENDIENTE_PAGO`, `EN_PREPARACION`, `LISTO` y `EXPIRADA`.

---

## 2. Modelos de estado en `frontend/empleados/`

- **Empleado (`employees.js`)**: `{ id, name, username, role, pin?, password?, avatar, color, isAdmin, isActive, isSyncedWithDb }`.
- **Ítem de comanda en caja (`OrderingWorkspace.jsx`)**: `{ id, name, price, categoryId, sku, qty, note }` *(no almacena `optionValueIds` todavía)*.
- **Orden en espera (`App.jsx` → `heldOrders`)**: `{ ticketNumber, orderType, tableOrCustomer, cart, discountPercent, tipPercent, heldAt }` (solo en memoria RAM).
- **Registro de venta local (`App.jsx` → `db.saveOrder`)**: `{ ticketNumber, folio, saleId, registrationToken, orderType, tableOrCustomer, cashierId, cashierName, items, itemCount, subtotal, tax, total, paymentMethod, cashReceived, changeDue, timestamp }`.
- **Resumen de orden KDS (`kitchen.js`)**: `GET /preparation/orders` retorna `{ id, folio, guestName, createdAt }`; `GET /orders/{id}` añade `items: [{ id, productName, quantity, options: [{ groupName, valueName, surchargeCents }] }]`.

---

## 3. Diccionario de claves en `localStorage`

### En `frontend/clientes/`

| Clave | Contenido | Sensibilidad y política |
| --- | --- | --- |
| `taffy_cart` | JSON de `CartItem[]` del carrito actual | Dato no sensible de UI (permitido por guía de integración) |
| `taffy_past_orders` | JSON de `PastOrderItem[]` (purgado de demos al iniciar) | Residuo heredado; debe reemplazarse por `GET /customers/me/orders` |
| `taffy_is_guest` | `'true'` o ausente | Preferencia temporal de acceso invitado |
| `taffy_guest_name` | Nombre ingresado para vasos como invitado | Dato de UI no sensible |

### En `frontend/empleados/`

Nota: por compatibilidad heredada, muchas escrituras duplican la clave con prefijo `coffees_*` y
`taffy_*`.

| Clave principal (+ alias `taffy_*`) | Contenido | Riesgo / acción recomendada |
| --- | --- | --- |
| `coffees_pos_account` | `{ businessName, terminalName, ... }` | Configuración local de terminal (segura) |
| `coffees_current_employee` | Objeto del empleado logueado **incluyendo `pin` y `password` en texto plano** | **Riesgo de seguridad**: eliminar `pin`/`password` de `localStorage` y usar sesión por cookie + `/auth/refresh` |
| `coffees_employees_local` | Lista cacheada de empleados (incluye `AngelAdmin` con credencial de prueba en `DEFAULT_EMPLOYEES`) | **Riesgo de seguridad**: retirar credenciales predeterminadas y usar solo DTO público tras login |
| `coffees_menu_products_local` | Caché/respaldo de productos del menú | Solo fallback visual; no es fuente de verdad para precios |
| `coffees_menu_categories_local` | Caché/respaldo de categorías | Solo fallback visual |
| `coffees_orders_local` | Historial local de tickets cobrados; **almacena `registrationToken`** | **Riesgo de seguridad**: no persistir tokens de registro (`AUTH-02`) ni de ticket digital (`TKT-02`) en `localStorage` |
| `coffees_theme` | `'theme-nordic' \| 'theme-dark' \| 'theme-latte' \| 'theme-mint'` | Preferencia visual (segura) |
| `coffees_audio` | `'true' \| 'false'` | Preferencia de sonido háptico (segura) |
| `coffees_ticket_width` | `'80mm' \| '58mm'` | Preferencia de impresión térmica (segura) |
| `coffees_auto_print` | `'true' \| 'false'` | Preferencia de impresión (segura; leída en `MenuModal` aunque no activa impresión automática) |
| `coffees_ticket_footer` | Texto de despedida del ticket | Preferencia de impresión (segura) |
| `coffees_accounts_registry` | Registro multi-tenant offline (`utils/tenant.js`) con hash SHA-256 (`crypto.js`) | Código heredado de modo offline sin uso en el flujo principal actual |
| `coffees_unlinked_manual` | Flag de desvinculación de terminal | Residuo heredado de pantalla `setup` |

Referencias: [persistencia local](storage/local-persistence.md), [diccionario backend](../../backend/docs/data-dictionary.md).
