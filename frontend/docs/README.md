# Documentación del frontend

## Estado reconciliado — 2026-11-18

Este índice documenta el estado real del frontend del proyecto **Coffee's POS** en `dev`,
compuesto por dos aplicaciones web independientes dentro del monorepositorio
(`frontend/clientes/` y `frontend/empleados/`) conforme a la organización del
repositorio aceptada en [ADR 0013](../../backend/docs/adr/0013-application-repository-layout.md)
y la arquitectura descrita en [arquitectura](architecture.md). La documentación contrasta lo
implementado en las pantallas y clientes HTTP contra el contrato vigente del backend
([OpenAPI 0.11.0](../../backend/docs/api/openapi.yaml), entrega `FIN-01`) y su
[guía de integración](../../backend/docs/frontend-integration.md).

> [!NOTE]
> Que una función tenga código en `src/api/`, componentes de respaldo en `localStorage` o
> contrato disponible en `OpenAPI 0.11.0` **no significa** que el flujo completo esté
> conectado o validado en interfaz. Ver [completitud y límites](frontend-completion.md) y
> [auditoría de brechas](tasks/FE-GAP-01-integration-audit.md).

| Área | Implementación presente | Límites y pendientes |
| --- | --- | --- |
| Portal de clientes — Catálogo y carrito | `MenuPage`, `ProductCard`, `ProductModal` y `CartDrawer` consumen categorías, productos y opciones dinámicas (`/categories`, `/products`, `/products/{id}/options`) y crean órdenes `POST /orders` con `Idempotency-Key` | Fallback local en `localStorage` si la API falla; `ProductModal` no valida min/max en grupos multiselección antes de enviar; `Idempotency-Key` se regenera en cada clic sin conservarse en reintentos de red |
| Portal de clientes — Auth y registro QR | `AuthPage`, `PinInput` y `AuthContext` cubren login de cliente (`POST /auth/login/customer`), acceso invitado y alta por token de ticket (`POST /customer-registration/ticket`) | Falta flujo obligatorio `mustChangePin` (`PATCH /auth/pin`), refresh automático ante `401` (`POST /auth/refresh`), verificación de correo (`/verificar-correo`) y recuperación de NIP (`/recuperar-nip`) |
| Portal de clientes — Perfil, favoritos e historial | `ProfileModal` lee y edita nombre (`GET/PATCH /customers/me`); `favorites.ts` y `AuthContext` sincronizan favoritos (`GET/PUT/DELETE /customers/me/favorites`) | `OrderHistoryModal` lee `taffy_past_orders` de `localStorage` en lugar de `getCustomerOrders()` (`GET /customers/me/orders`); faltan cambio de teléfono con NIP, detalle/ticket propio y `repeat-preview` |
| Terminal POS — Auth y control por rol | `EmployeeIdScreen`, `EmployeePinScreen` y `AdminAuthModal` autentican vía `POST /auth/login/staff`; `App.jsx` y `PosHeader` restringen vistas por rol | Auto-login de respaldo guarda contraseña en `localStorage` (`client.js`); existe rol visual `GERENTE` no contemplado en backend; falta `PATCH /auth/password` y `POST /auth/refresh` |
| Terminal POS — Toma de orden, caja y QR | `OrderingWorkspace`, `CheckoutModal`, `ShiftWorkspace` y `ScanQrModal` operan creación en caja, apertura/cierre de caja, cobro efectivo y escaneo QR CASH (`CASH-03`) | `OrderingWorkspace` envía `optionValueIds: []` y suma `16% IVA` local discordante con backend; `CheckoutModal` ofrece tarjeta/transferencia sin ruta backend; falta asociar cliente, `exceptionalCloseReason` y reemisión QR CASH |
| Terminal POS — Cocina / Barista (KDS) | `KitchenWorkspace` consulta `GET /preparation/orders` cada 8 s, obtiene detalles con `GET /orders/{id}` y marca órdenes como listas con `POST /orders/{id}/ready` | Usa `opt.optionName` en lugar de `valueName` del DTO backend; no muestra estado visual de error en carga de detalle por tarjeta ni permite filtrado adicional |
| Terminal POS — Administración | `AdminDashboardWorkspace`, `MenuManagementWorkspace` y `UserManagementWorkspace` cubren CRUD básico de categorías, productos, disponibilidad y empleados | Falta administración de grupos/valores de opciones, configuración atómica de producto, subida firmada de imágenes Cloudinary, corrección/reset de clientes y acceso de `CAJERO` a disponibilidad |
| Tickets, QR visual y Stripe | `ReceiptModal` imprime tickets térmicos 80mm/58mm; `OrderConfirmationModal` muestra el token QR CASH en texto | **Brecha crítica:** `App.jsx` solicita `POST /sales/{id}/ticket-access` (`TKT-02`) en vez de `GET /sales/{id}/ticket` para el token de registro `AUTH-02`; falta renderizado gráfico de QR, visor público `X-Ticket-Token` y flujo Stripe (`POST /orders/{id}/checkout`) |

Contrato backend vigente de referencia: [OpenAPI 0.11.0](../../backend/docs/api/openapi.yaml).
Cobertura exacta endpoint por endpoint: [cobertura de API](api/endpoints-coverage.md).

## Qué fuente consultar

1. Contexto y arquitectura: [contexto del proyecto](PROJECT-CONTEXT.md), [arquitectura](architecture.md) y [ADRs del frontend](adr/README.md).
2. Reglas y permisos en interfaz: [reglas de negocio](business-rules.md), [matriz de permisos](permissions.md) y [evaluación de criterios AC](planning-readiness.md).
3. Integración técnica y persistencia local: [integración con backend](backend-integration.md), [cobertura de endpoints](api/endpoints-coverage.md), [diccionario de datos](data-dictionary.md) y [persistencia local](storage/local-persistence.md).
4. Guías por módulo funcional:
   - [Auth y administración](auth-admin-implementation.md)
   - [Clientes, perfil e historial](customers-implementation.md)
   - [Favoritos y repetición](favorites-implementation.md)
   - [Órdenes y Cocina (KDS)](orders-implementation.md)
   - [Caja, cobro efectivo y ventas](cash-implementation.md)
   - [QR de cobro efectivo](cash-qr-implementation.md)
   - [Tickets e invitado (TKT-02 / AUTH-02)](guest-ticket-implementation.md)
5. Operación, calidad y pendientes: [arranque local y empaquetado](local-setup.md), [guía de desarrollo](development-guide.md), [pruebas](testing.md), [backlog del frontend](development-tasks.md) y [proceso de trabajo](workflow/README.md).

## Historial y mantenimiento

La evolución desde el prototipo Vanilla JS y el modo restaurante archivado (`frontend/empleados/respaldo/`) hasta las dos aplicaciones React 19 integradas con la API se documenta en [avance del frontend](frontend-progress.md). La auditoría inicial completa y su matriz de trazabilidad se registran en [FE-GAP-01](tasks/FE-GAP-01-integration-audit.md).

Actualizar este índice, la [cobertura de endpoints](api/endpoints-coverage.md) y el [backlog](development-tasks.md) en cada entrega que conecte un flujo pendiente, modifique almacenamiento local o ajuste el consumo de `/api/v1`. Ante divergencias entre pantallas y contrato, verificar primero con [OpenAPI 0.11.0](../../backend/docs/api/openapi.yaml) y coordinar con el responsable del backend antes de asumir campos no documentados.
