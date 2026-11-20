# Cobertura de endpoints OpenAPI 0.11.0 en el frontend

## Avance de `frontend/unified/` — TASK-11 (2026-11-20)

En el paquete unificado, `features/clientes/cart/` revalida cada línea del
borrador mediante `GET /products/{productId}` y
`GET /products/{productId}/options`; `features/clientes/orders/mobileOrders.ts`
consume `POST /orders` para crear una orden móvil `CASH` o `STRIPE` pendiente.
Mantiene una misma clave/cuerpo ante resultado incierto y no interpreta la
creación como cobro. No solicita QR CASH, token de checkout ni retorno Stripe.
Esta nota **no cambia** los estados de las aplicaciones legadas auditadas abajo.

Inventario completo de las rutas definidas en [OpenAPI 0.11.0](../../../backend/docs/api/openapi.yaml)
contrastadas contra los módulos `src/api/` y componentes de `frontend/clientes/` y
`frontend/empleados/` al **2026-11-18**.

Leyenda de estado:
- **Conectado**: Función API definida y llamada desde al menos una pantalla/flujo activo.
- **Definido sin uso**: Función existe en `src/api/`, pero ninguna pantalla la invoca todavía.
- **Uso erróneo**: Se invoca para un propósito o flujo distinto al definido en el contrato.
- **Pendiente**: No existe ni cliente API ni pantalla que lo consuma.

## 1. Salud y catálogo público (`Catalog`)

| Método y ruta | `clientes` (`src/api/`) | `empleados` (`src/api/`) | Estado | Notas |
| --- | --- | --- | --- | --- |
| `GET /api/v1/health` | — | — | **Pendiente** | Sin indicador visual de estado de API |
| `GET /api/v1/categories` | `catalog.ts → getCategories()` | `catalog.js → getCategories()` | **Conectado** | Fijo `limit=100`; no pagina con `nextCursor` |
| `GET /api/v1/products` | `catalog.ts → getProducts()` | `catalog.js → getProducts()` | **Conectado** | Fijo `limit=100`; no usa `isAvailable` ni `nextCursor` |
| `GET /api/v1/products/{productId}` | `catalog.ts → getProduct()` | — | **Definido sin uso** | `clientes` usa datos de `getProducts()` directamente |
| `GET /api/v1/products/{productId}/options` | `catalog.ts → getProductOptions()` (`ProductModal.tsx`) | `catalog.js → getProductOptions()` | **Conectado (`clientes`)** / **Sin uso (`empleados`)** | En `empleados` existe la función pero `OrderingWorkspace` nunca la llama |

## 2. Autenticación y credenciales (`Auth`)

| Método y ruta | `clientes` (`src/api/`) | `empleados` (`src/api/`) | Estado | Notas |
| --- | --- | --- | --- | --- |
| `GET /api/v1/auth/csrf` | `client.ts → getCsrfToken()` | `client.js → getCsrfToken()` | **Conectado** | Automático antes de mutaciones y reintento `403` |
| `POST /api/v1/auth/login/customer` | `auth.ts → loginCustomer()` (`AuthPage.tsx`) | — | **Conectado** | Descarta `data.csrfToken` de la respuesta (no actualiza cache) |
| `POST /api/v1/auth/login/staff` | — | `auth.js → loginStaff()` (`EmployeePinScreen`, `AdminAuthModal`, `client.js`) | **Conectado** | `client.js` lo usa indebidamente como auto-login ante `401` |
| `POST /api/v1/auth/refresh` | — | — | **Pendiente** | Falta en ambas apps (single-flight + Web Locks + `409`) |
| `POST /api/v1/auth/logout` | `auth.ts → logoutCustomer()` (`AuthContext.tsx`) | `auth.js → logoutStaff()` (`App.jsx`) | **Conectado** | Limpia cache CSRF en memoria |
| `GET /api/v1/auth/me` | — | `auth.js → getCurrentUser()` | **Definido sin uso** | `clientes` usa `GET /customers/me`; `empleados` lee `localStorage` |
| `PATCH /api/v1/auth/pin` | — | — | **Pendiente** | Falta cambio de NIP propio y flujo obligatorio `mustChangePin` |
| `PATCH /api/v1/auth/password` | — | — | **Pendiente** | Falta cambio de contraseña propia para personal |
| `POST /api/v1/auth/email-verification` | — | — | **Pendiente** | Falta ruta `/verificar-correo#token=...` |
| `POST /api/v1/auth/pin-recovery` | — | — | **Pendiente** | Falta pantalla de solicitud de recuperación |
| `POST /api/v1/auth/pin-recovery/confirm` | — | — | **Pendiente** | Falta ruta `/recuperar-nip#token=...` |

## 3. Administración (`Admin` y disponibilidad)

| Método y ruta | `clientes` | `empleados` (`src/api/`) | Estado | Notas |
| --- | --- | --- | --- | --- |
| `GET /api/v1/admin/categories` | — | — | **Pendiente** | `MenuManagementWorkspace` usa `/categories` público |
| `POST /api/v1/admin/categories` | — | `catalog.js → createAdminCategory()` | **Conectado** | Invocado en `MenuManagementWorkspace.jsx` |
| `GET /api/v1/admin/categories/{id}` | — | — | **Pendiente** | — |
| `PATCH /api/v1/admin/categories/{id}` | — | — | **Pendiente** | Sin edición de categorías en UI |
| `DELETE /api/v1/admin/categories/{id}` | — | `catalog.js → deleteAdminCategory()` | **Conectado** | Invocado en `MenuManagementWorkspace.jsx` |
| `GET /api/v1/admin/products` | — | — | **Pendiente** | `MenuManagementWorkspace` usa `/products` público |
| `POST /api/v1/admin/products` | — | `catalog.js → createAdminProduct()` | **Conectado** | Invocado en `MenuManagementWorkspace.jsx` |
| `GET /api/v1/admin/products/{id}` | — | — | **Pendiente** | — |
| `PATCH /api/v1/admin/products/{id}` | — | `catalog.js → updateAdminProduct()` | **Conectado** | Invocado en `MenuManagementWorkspace.jsx` |
| `DELETE /api/v1/admin/products/{id}` | — | `catalog.js → deleteAdminProduct()` | **Conectado** | Invocado en `MenuManagementWorkspace.jsx` |
| `PATCH /api/v1/products/{id}/availability` | — | `catalog.js → setProductAvailability()` | **Parcial** | Solo accesible al admin (`MenuManagementWorkspace`); falta exponerlo al `CAJERO` |
| `GET/POST/PATCH/DELETE /api/v1/admin/option-groups*` | — | — | **Pendiente** | Sin gestión administrativa de grupos de opciones |
| `GET/POST/PATCH/DELETE /api/v1/admin/option-values*` | — | — | **Pendiente** | Sin gestión administrativa de valores de opciones |
| `GET/PUT /api/v1/admin/products/{id}/configuration` | — | — | **Pendiente** | Sin asignación de grupos/valores a productos en UI |
| `POST /api/v1/admin/products/{id}/image-upload` | — | — | **Pendiente** | Flujo Cloudinary sin UI |
| `PUT /api/v1/admin/products/{id}/image` | — | — | **Pendiente** | Flujo Cloudinary sin UI |
| `GET /api/v1/admin/employees` | — | `employees.js → getAdminEmployees()` | **Conectado** | Invocado en `EmployeeIdScreen` y `UserManagementWorkspace` |
| `POST /api/v1/admin/employees` | — | `employees.js → createAdminEmployee()` | **Conectado** | UI incluye rol inválido `GERENTE` además de los 3 válidos |
| `PATCH /api/v1/admin/employees/{id}` | — | `employees.js → updateAdminEmployee()` | **Conectado** | Cubre edición y baja/reactivación lógica con `reason` |
| `PATCH /api/v1/admin/customers/{id}` | — | — | **Pendiente** | Corrección administrativa de nombre/teléfono sin UI |
| `POST /api/v1/admin/customers/{id}/pin-reset` | — | — | **Pendiente** | Reset presencial auditado sin UI |

## 4. Órdenes, caja, preparación y pagos (`Orders`, `Cash`, `Payments`, `Sales`)

| Método y ruta | `clientes` (`src/api/`) | `empleados` (`src/api/`) | Estado | Notas |
| --- | --- | --- | --- | --- |
| `POST /api/v1/orders` | `orders.ts → createMobileOrder()` (`CartContext.tsx`) | — | **Conectado** | Regenera `Idempotency-Key` en cada intento |
| `POST /api/v1/cashier/orders` | — | `cash.js → createCashierOrder()` (`App.jsx`) | **Conectado** | Envía siempre `optionValueIds: []` y sin asociación de cliente |
| `GET /api/v1/orders/{id}` | — | `kitchen.js → getOrderDetails()` (`KitchenWorkspace.jsx`) | **Conectado (`empleados`)** / **Pendiente (`clientes`)** | Falta usarlo para detalle en historial de `clientes` |
| `GET /api/v1/preparation/orders` | — | `kitchen.js → getPreparationOrders()` | **Conectado** | Polling cada 8 s en `KitchenWorkspace.jsx` |
| `POST /api/v1/orders/{id}/ready` | — | `kitchen.js → markOrderReady()` | **Conectado** | Botón `✓ Marcar como LISTO` en `KitchenWorkspace.jsx` |
| `POST /api/v1/cashier/customers/search` | — | — | **Pendiente** | Sin búsqueda mínima de cliente en caja |
| `PATCH /api/v1/cashier/orders/{id}/customer` | — | — | **Pendiente** | Sin asociación posterior previa al pago |
| `POST /api/v1/cash-sessions` | — | `cash.js → openCashSession()` | **Conectado** | Se llama manual en `ShiftWorkspace` y automático en `getOrEnsureCashSession` |
| `GET /api/v1/cash-sessions/current` | — | `cash.js → getCurrentCashSession()` | **Conectado** | Usado en `ShiftWorkspace` y `cash.js` |
| `GET /api/v1/cash-sessions/{id}` | — | — | **Pendiente** | Sin consulta de sesiones históricas por ID |
| `POST /api/v1/cash-sessions/{id}/close` | — | `cash.js → closeCashSession()` | **Conectado** | Falta input UI para `exceptionalCloseReason` en admin |
| `POST /api/v1/payments/cash` | — | `cash.js → chargeCashOrder()` | **Conectado** | Llamado en `App.jsx` y `ScanQrModal.jsx` |
| `POST /api/v1/cashier/orders/{id}/cash-qr` | — | — | **Pendiente** | Sin botón para emitir/reimprimir QR CASH de orden pendiente |
| `POST /api/v1/cashier/orders/scan-cash-qr` | — | `cash.js → scanCashPaymentQr()` | **Conectado** | Pegado manual en `ScanQrModal.jsx`; falta cámara |
| `GET /api/v1/sales` | — | `sales.js → getSales()` (`HistoryWorkspace.jsx`) | **Conectado (con bug)** | Bug en `HistoryWorkspace.jsx` deja `loading = true` si hay ventas |
| `GET /api/v1/sales/summary` | — | `sales.js → getSalesSummary()` (`ShiftWorkspace.jsx`) | **Conectado (parcial)** | Revisar mapeo de propiedades exactas del resumen |
| `POST /api/v1/orders/{id}/checkout` | — | — | **Pendiente** | Stripe deshabilitado en servidor; falta flujo Checkout y retorno |
| `POST /api/v1/stripe/webhook` | — | — | **N/A Frontend** | Endpoint exclusivo de Stripe backend |

## 5. Tickets, registro QR y perfil de cliente (`Tickets`, `Registration`, `Customers`)

| Método y ruta | `clientes` (`src/api/`) | `empleados` (`src/api/`) | Estado | Notas |
| --- | --- | --- | --- | --- |
| `GET /api/v1/sales/{id}/ticket` | — | — | **Pendiente (Crítico)** | Es la ruta que entrega `registration.token` (`AUTH-02`) e ítems oficiales |
| `POST /api/v1/sales/{id}/ticket-access` | — | `cash.js → issueTicketAccess()` (`App.jsx`) | **Uso erróneo** | Genera `X-Ticket-Token` (`TKT-02`), pero `App.jsx` lo imprime como código de registro |
| `GET /api/v1/guest-ticket` | — | — | **Pendiente** | Falta pantalla de lectura de comprobante digital para invitado |
| `POST /api/v1/customer-registration/ticket` | `registration.ts → registerWithTicket()` (`AuthPage.tsx`) | — | **Conectado** | Requiere ajustar limpieza de prefijo `cafeteria:register:` y rangos de nombre |
| `GET /api/v1/customers/me` | `auth.ts → getCustomerProfile()` (`AuthContext.tsx`) | — | **Conectado** | Al carga inicial y al refrescar perfil |
| `PATCH /api/v1/customers/me` | `auth.ts → updateCustomerProfile()` (`ProfileModal.tsx`) | — | **Parcial** | Solo expone edición de `name`; faltan `phone` y `currentPin` |
| `GET /api/v1/customers/me/orders` | `orders.ts → getCustomerOrders()` | — | **Definido sin uso** | `OrderHistoryModal.tsx` sigue leyendo `localStorage` |
| `GET /api/v1/customers/me/orders/{id}/ticket` | — | — | **Pendiente** | Sin visor de ticket propio pagado para cliente |
| `GET /api/v1/customers/me/favorites` | `favorites.ts → getCustomerFavorites()` | — | **Conectado** | Llamado en `AuthContext.tsx` |
| `PUT /api/v1/customers/me/favorites/{productId}` | `favorites.ts → addCustomerFavorite()` | — | **Conectado** | Llamado en `AuthContext.tsx` |
| `DELETE /api/v1/customers/me/favorites/{productId}` | `favorites.ts → removeCustomerFavorite()` | — | **Conectado** | Llamado en `AuthContext.tsx` |
| `POST /api/v1/customers/me/orders/{id}/repeat-preview` | — | — | **Pendiente** | Sin cliente API ni UI de revisión antes de repetir |
| `POST /api/v1/customers/me/recovery-email` | — | — | **Pendiente** | Sin formulario en `ProfileModal.tsx` |

Referencias: [contrato OpenAPI](../../../backend/docs/api/openapi.yaml), [auditoría FE-GAP-01](../tasks/FE-GAP-01-integration-audit.md).
