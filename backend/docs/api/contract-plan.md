# Estado del contrato y operaciones por completar

## Contrato vigente FIN-01 — 2026-11-10

OpenAPI **0.11.0** completa ventas/resumen, edición de perfil, empleados/correcciones,
verificación/recuperación/reset de NIP, Checkout/webhook Stripe y ticket propio.
El worker implementa expiración/reconciliación/refund con outbox cifrada y leases.
Se añade opt-in `includeCheckoutToken` exclusivo del invitado STRIPE: permiso solo
de Checkout, no consulta de órdenes. Tickets CASH/STRIPE conservan permisos previos;
cliente tiene lectura exclusiva del ticket de su propia orden pagada.
Contrato y pruebas simuladas no habilitan proveedores reales: server/worker no
instancian Stripe SDK. Correo exige clave externa/worker/transporte local configurado.
[Diseño y límites](../backend-completion.md), [guía frontend](../frontend-integration.md).
Las continuidades y tablas inferiores describen cortes históricos del contrato.

## Continuidad FAV-01 — 2026-11-09

OpenAPI **0.10.0** añade favoritos personales de producto (GET/PUT/DELETE) y POST
`/customers/me/orders/{id}/repeat-preview`, solo CLIENTE/propietario. Mutaciones
y preview exigen Origin/CSRF. Repetición devuelve selección actual revisable y
avisos, sin crear orden ni alterar históricos; confirmación reutiliza POST `/orders`
con Idempotency-Key. [Diseño y límites](../favorites-implementation.md).
Referencias inferiores a favoritos/repetición pendientes corresponden a cortes anteriores.

## Continuidad CUS-01 — 2026-11-09

OpenAPI **0.9.0** añade GET `/api/v1/customers/me` y
`/api/v1/customers/me/orders`, solo CLIENTE/propietario con sesión vigente.
Perfil mínimo e historial de órdenes paginado en todos sus estados; detalle
reutiliza GET `/orders/{id}` con propiedad/snapshots ya existentes. Solo lectura,
sin edición, favoritos, recuperación, filtros de identidad ni nuevos permisos
administrativos. [Diseño y límites](../customers-implementation.md).
Referencias inferiores a perfil/historial pendiente describen cortes anteriores.

## Continuidad CASH-03 — 2026-11-09

OpenAPI **0.8.0** añade QR CASH opt-in en creación, emisión/reimpresión protegida
y escaneo exclusivo de caja, sin confirmar pago. Mantiene POST `/payments/cash`
como único cobro CASH. [Diseño, migración y límites](../cash-qr-implementation.md).
Las referencias de QR pendiente inferiores describen cortes anteriores.

## Continuidad TKT-02 — 2026-11-09

OpenAPI **0.7.0** añade POST `/api/v1/sales/{id}/ticket-access` para caja y GET
`/api/v1/guest-ticket` con permiso exclusivo en `X-Ticket-Token`. Emisión/reemisión
revoca anteriores sin ampliar las 24h desde pago. Solo comprobante CASH pagado,
nunca estado/historial ni registro. Tabla física `guest_ticket_tokens` existente,
sin migración. [Contrato funcional aprobado, implementación y evidencia](../tasks/TKT-02-guest-digital-ticket.md).
Pendientes QR de cobro/escaneo, frontend e integración humana. Las notas 0.6.0
inferiores conservan el corte previo, no el estado de esta operación nueva.

Entrega local CASH-01/02 — 2026-10-27: caja, cobro CASH por ID, venta y ticket
protegido. [Alcance](../cash-implementation.md). AUTH-02 local — 2026-10-31 añade el
registro de cliente exclusivamente con QR de ese ticket pagado, sin sesión automática.
El contrato vigente es OpenAPI 0.6.0; QR de cobro, ticket digital público, Stripe y
worker siguen pendientes. Rutas anteriores conservadas; LISTO CASH comprueba
pago/venta coherentes.

## Estado de entregas locales — 2026-10-31

OpenAPI 0.6.0 contiene auth/admin, catálogo, órdenes, caja/efectivo, ticket protegido y
registro QR de invitado. Las entregas CASH y AUTH-02 están implementadas y verificadas
localmente, pendientes de revisión humana/integración; Stripe, worker, QR de cobro,
ticket digital público, recuperación y perfil/historial continúan pendientes.
Las notas inferiores describen etapas históricas, no pendientes vigentes.

### Historial — 2026-10-21 y entrega inicial

Actualización 2026-10-21: health y las cuatro operaciones de catálogo de lectura
ya estaban implementadas/probadas. OpenAPI 0.2.0 era el contrato de esa entrega. Las
operaciones de escritura, auth y demás módulos siguen pendientes. La descripción
inferior de la entrega de Leonel se conserva como historial de revisión.

En la entrega inicial solo GET /api/v1/health estaba implementado. openapi.yaml
incorporaba además cuatro
lecturas del catálogo recibidas de Leonel, todavía sin implementación. Contrato
y ejemplos validados en revisión; ajustes pendientes en
[lista de correcciones](../database/correcciones-pendientes.md).

### Trabajo restante (reconciliado 2026-11-09)

La tabla distingue operaciones restantes de las ya presentes en OpenAPI 0.6.0;
no anuncia nuevas rutas disponibles. Convenciones aceptadas en ADR 0006;
validar esquemas y casos de error antes de implementar cada operación pendiente.

| Módulo    | Operaciones a especificar                                                                         | Criterios                                        |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| auth      | Recuperación por correo y reset administrativo; login/sesión/cambio ya disponibles                | AC-16/17                                         |
| catalog   | Cloudinary real; lecturas y CRUD administrativo ya disponibles                                    | ADR 0010: JPEG/PNG/WebP, una por producto, 5 MiB |
| orders    | Expiración automática e historial; crear/consultar/asociar/LISTO ya disponibles                   | AC-01/02/10                                      |
| payments  | Crear/reutilizar Checkout y webhook con cuerpo raw; efectivo ya disponible                        | AC-03/05/07/08/09                                |
| cash      | Caja y cierre ya disponibles; revisar/integrar entrega local                                      | AC-04; responsable y cierre excepcional auditado |
| customers | Perfil/historial; búsqueda y consumo de token ticket ya disponibles                               | AC-11/12/13/14                                   |
| customers | Favoritos y repetir selección con catálogo actual                                                 | AC-19/21                                         |
| tickets   | Revisar/integrar TKT-02; acceso digital limitado y ticket CASH protegido implementados localmente | QR de cobro/escaneo y canal frontend pendientes  |

Para cada operación: rol y propiedad, body/query/path, campos obligatorios y límites,
respuesta/códigos/ejemplos, idempotencia, regla y prueba. El ticket digital de invitado
usa en TKT-02 un permiso opaco de alcance limitado: no utilizar folio público ni QR de cobro
como autorización. El token de acceso usa el diseño físico existente `guest_ticket_tokens`.

Secuencia vigente: preparar perfil/historial y ticket digital; preparación/LISTO ya
están disponibles en ORD-01 con comprobaciones CASH posteriores. Construir
worker y correo antes de recuperación, y Stripe según sus dependencias.

Las reglas ya aceptadas deben figurar en cada operación: JWT cookie/CSRF,
roles y propiedad, LISTO por preparación/cajero/admin, responsable de caja,
recibido/cambio, límites de pedidos e Idempotency-Key para crear/cobrar efectivo.
Coordinar esquema con Leonel y entradas/respuestas con Enrique.
