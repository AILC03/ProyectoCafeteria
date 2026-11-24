# Backlog de desarrollo del frontend

## Unificación en curso — TASK-20 (2026-11-23)

En `frontend/unified/`, TASK-20 migra el contenedor Electron a una URL HTTP(S)
configurada en `/terminal`, sin `file://` ni respaldo offline, con bloqueo del
área cliente y empaquetado Windows. La validación de login y mutación CSRF se
ejecutó contra backend local; siguen pendientes un origen HTTPS de distribución
con fallback SPA y el build macOS. Los renglones
inferiores son la auditoría histórica de
`frontend/clientes/` y `frontend/empleados/`, no el estado del paquete
unificado; el avance verificable está en el
[registro de cierres](specs/frontend-unification/FRONTEND-UNIFICATION-STATUS.md).

Estado de las tareas funcionales y técnicas del frontend al **2026-11-18**, tomando como referencia
el contrato [OpenAPI 0.11.0](../../backend/docs/api/openapi.yaml) y las auditorías realizadas en
[FE-GAP-01](tasks/FE-GAP-01-integration-audit.md).

Etiquetas: **`[hecha]`** (implementada y conectada sin brechas mayores), **`[parcial]`** (operativa en flujos principales pero con pendientes o bugs respecto a OpenAPI), **`[pendiente]`** (sin implementar en UI).

| ID | Área / App | Objetivo y alcance | Estado | Brechas / criterios restantes |
| --- | --- | --- | --- | --- |
| `FE-CAT-01` | `clientes` | Catálogo público, categorías, detalle y opciones con recargos (`GET /categories`, `/products`, `/products/{id}/options`) | **`[hecha]`** | Añadir paginación con cursor y validación estricta de `minSelections` en `ProductModal` antes de agregar al carrito |
| `FE-AUTH-01` | Ambas | Login cliente y personal, cookies `HttpOnly`, CSRF y logout | **`[parcial]`** | Implementar `POST /auth/refresh` (Web Locks + `409 REFRESH_ALREADY_ROTATED`); eliminar almacenamiento de contraseñas en `localStorage` y fallback `Admin1234` en `empleados/client.js`; soportar `PIN_CHANGE_REQUIRED` (`PATCH /auth/pin`) y `PATCH /auth/password` |
| `FE-AUTH-02` | `clientes` | Alta de invitado con QR/código de ticket pagado (`POST /customer-registration/ticket`) | **`[parcial]`** | Arreglar emisión de código en POS (ver `FE-TKT-01`); recortar prefijo `cafeteria:register:` al escanear/pegar; alinear validaciones de nombre (1–120) y códigos `404`/`409`/`429`; no exigir login automático si falla sin perder mensaje de éxito |
| `FE-AUTH-03` | `clientes` | Verificación de correo (`/verificar-correo`) y recuperación de NIP (`/recuperar-nip`) | **`[pendiente]`** | Crear pantallas/rutas con lectura segura de `#token=`, `history.replaceState`, `POST /customers/me/recovery-email`, `email-verification`, `pin-recovery` y `pin-recovery/confirm` |
| `FE-ORD-01` | `clientes` | Creación de orden móvil con `Idempotency-Key` (`POST /orders`) | **`[parcial]`** | Conservar `Idempotency-Key` entre reintentos de red; corregir tracker de `OrderConfirmationModal` para no mostrar `CASH PENDIENTE_PAGO` como `En preparación`; validar límites 50 líneas / 99 u. / `9999900` centavos |
| `FE-ORD-02` | `empleados` | Toma de orden en caja (`POST /cashier/orders`), opciones y asociación de cliente | **`[parcial]`** | Eliminar `+16% IVA` local en `OrderingWorkspace` y `App.jsx`; integrar selector de opciones (`/products/{id}/options`); deshabilitar productos agotados; añadir búsqueda y asociación de cliente (`cashier/customers/search`, `cashier/orders/{id}/customer`) |
| `FE-KDS-01` | `empleados` | Cola de preparación y marcar `LISTO` (`GET /preparation/orders`, `/orders/{id}`, `/orders/{id}/ready`) | **`[parcial]`** | Corregir `opt.optionName` → `opt.valueName` en `KitchenWorkspace.jsx`; mostrar estado de error si falla el detalle y evitar re-descargar detalles ya cargados |
| `FE-CASH-01` | `empleados` | Sesiones de caja, cobro efectivo y corte (`ShiftWorkspace`, `CheckoutModal`, `HistoryWorkspace`) | **`[parcial]`** | Eliminar apertura automática silenciosa de caja; añadir `exceptionalCloseReason` en cierre admin ajeno; corregir `loading` colgado en `HistoryWorkspace`; alinear nombres de campos en `ShiftWorkspace`; retirar modos falsos tarjeta/transferencia y no simular éxito en `localStorage` si la API falla |
| `FE-CASH-02` | Ambas | QR de cobro efectivo (`CASH-03`: opt-in móvil, emisión caja, escaneo y cobro) | **`[parcial]`** | Renderizar código QR gráfico (`cafeteria:cash:<token>`) en `OrderConfirmationModal`; añadir lector de cámara en `ScanQrModal`; conectar botón de emisión/reimpresión (`cashier/orders/{id}/cash-qr`) y mostrar líneas de productos en `ScanQrModal` |
| `FE-TKT-01` | Ambas | Ticket térmico con QR de registro (`CASH-02`), acceso digital (`TKT-02`) y ticket propio | **`[parcial]`** | **Prioridad alta:** en `App.jsx` y `ScanQrModal.jsx` leer `GET /sales/{id}/ticket` para extraer `registration.token`/`qrPayload` en lugar de llamar a `issueTicketAccess`; no guardar token en `localStorage`; crear visor `GET /guest-ticket` con `X-Ticket-Token` y visor propio `GET /customers/me/orders/{id}/ticket` |
| `FE-CUS-01` | `clientes` | Perfil propio, cambio de teléfono con NIP e historial real (`CUS-01`) | **`[parcial]`** | Conectar `OrderHistoryModal.tsx` a `GET /customers/me/orders` (con paginación cursor y detalle `GET /orders/{id}`); habilitar edición de teléfono + `currentPin` en `ProfileModal.tsx` con limpieza de sesión |
| `FE-FAV-01` | `clientes` | Favoritos (`PUT/DELETE`) y preview de repetición (`repeat-preview`) | **`[parcial]`** | Ocultar o guiar al login cuando un invitado toca favoritos; implementar modal de revisión con `POST /customers/me/orders/{id}/repeat-preview` mostrando avisos (`warnings`) y confirmación vía `POST /orders` |
| `FE-ADM-01` | `empleados` | Administración completa de catálogo, disponibilidad por cajero, opciones y Cloudinary | **`[parcial]`** | Usar rutas `/admin/categories` y `/admin/products` (con `includeDeleted` y edición de categoría); dar acceso al cajero a disponibilidad; implementar CRUD de grupos/valores/configuración atómica de producto y subida de imágenes a Cloudinary |
| `FE-ADM-02` | `empleados` | Administración de empleados, corrección de clientes y reset presencial | **`[parcial]`** | Retirar rol inexistente `GERENTE` del formulario; crear módulo para `PATCH /admin/customers/{id}` y `POST /admin/customers/{id}/pin-reset` (con selección de última venta pagada); evitar que `AdminAuthModal` sustituya cookies de sesión |
| `FE-STR-01` | `clientes` | Flujo Checkout Stripe y retorno (`/pago/retorno`) | **`[pendiente]`** | Guardar `checkout.token` en memoria, llamar a `POST /orders/{id}/checkout` con `Idempotency-Key` y redirigir; crear `/pago/retorno`; mantener oculto/deshabilitado mientras backend reporte `503` |
| `FE-TEST-01` | Ambas | Cobertura de pruebas unitarias, componentes, E2E y CI | **`[pendiente]`** | Resolver warnings de `oxlint` en `clientes`; añadir ESLint/Oxlint en `empleados`; configurar Vitest + React Testing Library + Playwright y job en `.github/workflows/` |

## Orden recomendado de ejecución

1. **Bloque 1 — Correcciones críticas de integridad y seguridad**: `FE-TKT-01` (desambiguar `GET /sales/{id}/ticket` vs `ticket-access`), `FE-ORD-02` (quitar IVA 16% y añadir opciones en caja), `FE-KDS-01` (`valueName`), `FE-CASH-01` (quitar apertura silenciosa de caja, arreglar `loading` en historial) y `FE-AUTH-01` (quitar contraseñas de `localStorage` e implementar `/auth/refresh`).
2. **Bloque 2 — Flujos de cliente completos**: `FE-CUS-01` (historial real), `FE-FAV-01` (`repeat-preview`), `FE-CASH-02` (QR gráfico y cámara), `FE-AUTH-02` (escaneo QR registro) y `FE-AUTH-03` (correo/recuperación).
3. **Bloque 3 — Administración avanzada, Stripe y calidad**: `FE-ADM-01`, `FE-ADM-02`, `FE-STR-01` (coordinado con habilitación backend) y `FE-TEST-01`.

Referencias: [auditoría FE-GAP-01](tasks/FE-GAP-01-integration-audit.md), [criterios de aceptación](planning-readiness.md).
