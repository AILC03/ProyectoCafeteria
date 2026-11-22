# Integración de API — Frontend unificado

**Task:** TASK-00 de [TASKS-FE-001](./FRONTEND-UNIFICATION-TASKS.md)
**Estado:** Cerrada — commit `652b23a`
**Fuentes de verdad:** `backend/docs/api/openapi.yaml`, `backend/docs/frontend-integration.md` y `backend/docs/permissions.md`.

## 1. Orígenes, cookies y CSRF

| Tema | Regla de integración |
| --- | --- |
| Base API | Desarrollo puede usar `/api/v1` mediante proxy `/api`. Producción/Electron debe configurar `VITE_API_BASE_URL` con base HTTPS completa, por ejemplo `https://api.ejemplo.com/api/v1`, o validar explícitamente un reverse proxy HTTPS del host SPA para `/api`; no asumir que SPA y API comparten origen. El despliegue debe mantener una política de sitio/dominio de cookies compatible con `credentials: 'include'`. |
| Origen permitido | Producción/Electron debe usar un origen HTTPS configurado y permitido por backend. Desarrollo vigente permite `http://localhost:5173` y `http://localhost:5174`; otro origen recibe `ORIGIN_NOT_ALLOWED`. |
| Cookies | Usar `credentials: 'include'`. Access/refresh/CSRF son cookies HttpOnly; JavaScript no las lee ni persiste. |
| CSRF | Antes de mutar, pedir `GET /auth/csrf` y conservar sólo el token en memoria. Enviar `X-CSRF-Token`, cookie CSRF y `Origin` permitido. |
| Errores | `401`: refresh coordinado y, si falla, limpiar/volver a entrada. `403 CSRF_INVALID`: invalidar CSRF y reintentar una vez. `403 PIN_CHANGE_REQUIRED`: sólo cambio de NIP o logout. `409 REFRESH_ALREADY_ROTATED`: esperar/reintentar refresh una vez. |
| Refresh | Web Locks es obligatorio para elegir un único líder por perfil y coordinar/difundir el resultado entre pestañas/ventanas, sin secretos. Sin `navigator.locks`, no se llama a refresh automático y se deja un estado recuperable. Se prohíben lease, fallback o almacenamiento local para esta coordinación; nunca se usa autologin local. |

Electron no puede usar `file://` para mutaciones. Antes de TASK-20 se debe validar: URL HTTPS de distribución, `FRONTEND_ORIGIN` permitido, fallback SPA para `/terminal/**` y conectividad API.

## 2. Actor y permisos de interfaz

| Actor | Área | Límites relevantes |
| --- | --- | --- |
| Invitado | Cliente | Catálogo y orden móvil; no historial, perfil ni órdenes ajenas. |
| CLIENTE | Cliente | Perfil, favoritos, historial, repetición y órdenes propias. |
| CAJERO | Terminal | POS, caja, cobro, operación, disponibilidad permitida y ticket protegido. |
| PREPARACION | Terminal | Cola `EN_PREPARACION` y transición `LISTO` permitida. |
| ADMINISTRADOR | Terminal | Hereda caja y administra catálogo/opciones/empleados; no hereda CLIENTE. |

El actor se resuelve mediante `GET /auth/me` y las respuestas de API. Las guardas visuales no reemplazan autorización de backend.

## 3. Endpoints por dominio

| Dominio | Endpoints | Requisitos críticos |
| --- | --- | --- |
| Catálogo público | `GET /categories`, `/products`, `/products/{id}`, `/products/{id}/options` | Precio final y disponibilidad se validan en backend. |
| Sesión | `GET /auth/csrf`, `POST /auth/login/customer`, `/auth/login/staff`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | Cookies/CSRF; no leer ni escribir tokens en storage. |
| Orden móvil | `POST /orders` | Invitado o CLIENTE; CSRF y `Idempotency-Key` UUID v4; crea `PENDIENTE_PAGO`, no cobra. |
| Cuenta cliente | `GET/PATCH /customers/me`, `GET /customers/me/orders`, `GET /customers/me/orders/{id}/ticket` | Sólo CLIENTE propietario; cambio de teléfono exige NIP actual. |
| Favoritos/repetición | `GET/PUT/DELETE /customers/me/favorites`, `POST /customers/me/orders/{id}/repeat-preview` | Sólo CLIENTE; preview no crea ni cobra. |
| POS | `POST /cashier/orders`, `POST /cashier/customers/search`, `PATCH /cashier/orders/{id}/customer` | CAJERO/ADMINISTRADOR; asociación sólo antes de pago/vencimiento. |
| Caja/CASH | `GET /cash-sessions/current`, `POST /cash-sessions`, `GET /cash-sessions/{id}`, `POST /cash-sessions/{id}/close`, `POST /payments/cash` | CSRF e idempotencia; sólo responsable de caja abierta puede cobrar/cerrar ordinariamente. |
| Cocina | `GET /preparation/orders`, `POST /orders/{id}/ready` | PREPARACION/CAJERO/ADMINISTRADOR; sólo orden pagada en `EN_PREPARACION`. |
| Ventas | `GET /sales`, `GET /sales/summary` | CAJERO/ADMINISTRADOR; no exponer PII de clientes. |
| Administración | `/admin/categories`, `/admin/products`, opciones, empleados y clientes | ADMINISTRADOR; CAJERO sólo usa disponibilidad donde contrato lo permite. |

## 4. QR, tickets y tokens — separación obligatoria

| Credencial | Uso permitido | Prohibiciones |
| --- | --- | --- |
| QR de registro `cafeteria:register:<token>` | Proviene de `registration.qrPayload` del ticket protegido de una venta invitada pagada (`GET /sales/{id}/ticket`). El token va sólo en memoria a `POST /customer-registration/ticket`. | No es QR CASH ni comprobante digital; no URL, fragmento, logs, analítica, mensajes de error o storage. No inicia sesión. |
| QR CASH `cafeteria:cash:<token>` | Emisión inicial móvil: `POST /orders` con `includeCashQr:true` y la misma `Idempotency-Key` en un reintento. Emisión/reimpresión de staff: `POST /cashier/orders/{id}/cash-qr` sólo para CASH `PENDIENTE_PAGO`, vigente, sin `paidAt`; no exige caja abierta. Escaneo: `/cashier/orders/scan-cash-qr` por CAJERO/ADMINISTRADOR. | No registra cliente, no es ticket y escanearlo no cobra. Reemisión y escaneo exigen sesión vigente, Origin permitido y CSRF; el cobro sigue en `/payments/cash`. |
| `X-Ticket-Token` | Sólo `GET /guest-ticket` para comprobante digital de invitado. | Fuera de alcance en SPEC-FE-001. Nunca se usa como QR de registro, estado, historial, cuenta o QR CASH. |
| `X-Checkout-Token` | Sólo checkout Stripe de invitado autorizado. | No autoriza lectura de orden, estado o historial; Stripe queda fuera de la primera migración. |

El registro exige actor invitado sin sesión access/refresh. La interfaz detecta actor por API; si hay CLIENTE o personal, confirma el reemplazo y completa logout antes de CSRF prelogin. Registro exitoso muestra confirmación y ofrece login normal: no crea sesión automáticamente.

## 5. Idempotencia y resultado incierto

| Operación | Regla |
| --- | --- |
| Crear orden móvil/POS | UUID v4, misma clave y mismo cuerpo al reintentar; cuerpo distinto con misma clave produce conflicto. |
| Abrir/cerrar caja y cobrar CASH | UUID v4, misma clave/cuerpo ante red incierta. El replay devuelve resultado original, no estado actual. |
| Checkout Stripe | El backend reutiliza intento persistente; no crear un intento nuevo tras timeout. Fuera de alcance actual. |
| Registro QR | No usa `Idempotency-Key`; ante respuesta perdida no repetir automáticamente ni asumir sesión. |
| Ticket digital | Cada emisión rota token anterior; fuera de alcance actual y no reemitir automáticamente. |

Un timeout o 503 durante cobro nunca permite mostrar venta, recibo o ticket definitivo. Sólo una respuesta confirmada de API habilita impresión/renderizado final.

## 6. Bloqueos y correcciones que no se migran

| Hallazgo actual | Tratamiento en frontend unificado |
| --- | --- |
| Electron carga API en desarrollo y `file://` en producción. | Resolver en TASK-20 con URL HTTP(S), allowlist y fallback SPA previamente validados. |
| Terminal hace autologin con `localStorage` y credenciales por defecto tras 401. | No migrar; reemplazar por refresh coordinado y flujo de sesión explícito. |
| Las interfaces actuales generan nueva clave de idempotencia por llamada. | Resolver en TASK-08 antes de ordenar/cobrar. |
| Terminal abre caja automáticamente al no encontrar una sesión. | No migrar; apertura requiere acción explícita y tratamiento de conflicto. |
| Adaptador staff interpreta de forma incorrecta respuesta de `GET /auth/me`. | Corregir al migrar sesión staff en TASK-13. |
| Registro actual espera ID interno distinto al contrato. | Ajustar en TASK-16 a `data.customer`, sin IDs internos. |

## 7. Servicios fuera de alcance o no habilitados

- Stripe real, correo, Cloudinary real y entrega/impresión definitiva de tickets dependen de configuración y autorización backend; no se presentan como activos.
- El comprobante digital con `X-Ticket-Token`, retorno Stripe, recuperación/cambio de NIP y reset presencial requieren spec posterior.
- Las aplicaciones antiguas permanecen como contingencia durante coexistencia; esta task no modifica ni retira ninguna.
