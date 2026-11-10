# Documentación del backend

## Estado reconciliado — 2026-11-10

Este índice resume implementación en `dev`, no despliegue ni aprobación humana de
integración. FIN-01 completa el backlog funcional en pruebas sobre el avance previo.
Ver [entrega y evidencia vigente](tasks/FIN-01-backend-completion.md) y
[operación/límites](backend-completion.md). Las continuidades inferiores conservan
evidencia histórica de cada entrega. Stripe real no habilitado en server/worker.

| Área                  | Implementación presente                                                                                                      | Límites y pendientes                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Base y catálogo       | Persistencia, infraestructura HTTP, lecturas y administración                                                                | Revisar integración con frontend; no implica preparación de producción.                           |
| Auth/admin            | Login, sesiones, refresh, CSRF, credenciales, recuperación/reset y CRUD de empleados                                         | Correo exige clave/transporte/worker; Cloudinary real no autorizado.                              |
| Órdenes y preparación | Creación móvil/caja, snapshots, idempotencia, asociación mínima, historial propio, preparación/LISTO y expiración por worker | Stripe solo expira tras conciliación; no hay consulta de invitado ni cancelación.                 |
| CASH-01/02/03         | Caja, cobro, pago/venta, ticket protegido y QR CASH opt-in/emisión/reimpresión/escaneo                                       | Revisión humana/integración y cámara/renderizado frontend pendientes.                             |
| AUTH-02               | Alta de invitado con QR pagado, asociación exclusiva y consumo único transaccional                                           | Solo registro QR: sin sesión automática, recuperación ni correo; revisión/integración pendientes. |
| Tickets               | QR de registro/AUTH-02 y TKT-02: emisión/reemisión y lectura limitada de comprobante CASH con token independiente            | Sin canal frontend de entrega ni impresión; revisión/integración TKT-02 pendientes.               |
| Clientes              | Perfil/historial, edición propia y corrección administrativa auditada, ticket propio y búsqueda mínima de caja               | Teléfono propio exige NIP; personal no accede a favoritos ni historial privado.                   |
| FAV-01                | Favoritos propios de producto y preview revisable de repetición con precios actuales/avisos                                  | Revisión/integración y UI de confirmación pendientes; confirmar usa POST orders existente.        |
| FIN-01                | Ventas/resumen; worker con leases/reintentos/outbox cifrada; Stripe Checkout/eventos/reconciliación/refund; tickets Stripe   | Proveedores simulados en pruebas; sin Stripe runtime ni servicios remotos configurados.           |

Contrato actual: [OpenAPI 0.11.0](api/openapi.yaml). ADR 0001–0012 aceptados;
aceptación, implementación, evidencia de pruebas e integración son estados distintos.
No se deduce integración/publicación por un árbol limpio o por la rama local.
CUS-01 no añade migraciones, secretos ni dependencias; se limita a consultas propias.
FIN-01 sí añade una migración aditiva y dependencias justificadas (Stripe SDK y
Nodemailer); requiere claves externas para tokens/outbox, nunca valores por defecto.

La migración `20261026_cash_ticket_delivery` está versionada y fue probada en
PostgreSQL aislado; su aplicación a las bases del proyecto **no está acreditada**.
`20261109_cash_qr_delivery` añade recuperación cifrada de QR CASH y fue probada
solo en bases temporales; **no se aplicó a bases del proyecto**.
`20261110_backend_completion` añade metadatos Stripe, permiso Checkout de invitado,
lease UUID y unicidad de intento pendiente; probada exclusivamente en bases temporales.
Antes de uso real: revisión humana, migración autorizada, clave externa de tickets,
limpieza periódica y coordinación frontend. Cloudinary continúa simulado también
en CI; no configurar credenciales ni llamar al proveedor sin autorización.

## Qué fuente consultar

1. Decisiones: [reglas](business-rules.md), [permisos](permissions.md) y
   [ADR aceptados](adr/README.md). Código y pruebas no aprueban cambios de negocio.
2. Contrato: [OpenAPI](api/openapi.yaml); alcance restante en
   [plan del contrato](api/contract-plan.md).
3. Implementación: código, esquema y migraciones versionadas; una migración
   presente no demuestra que esté aplicada a un entorno.
4. Evidencia y límites por entrega: [auth/admin](auth-admin-implementation.md),
   [ORD-01](tasks/ORD-01-pending-orders.md), [CASH](tasks/CASH-01-02-cash-payments.md)
   [AUTH-02](tasks/AUTH-02-ticket-qr-registration.md), [TKT-02](guest-ticket-implementation.md)
   y [CASH-03](cash-qr-implementation.md).
5. Trabajo siguiente: [backlog](development-tasks.md). Integración de pantallas:
   [guía frontend](frontend-integration.md). Proceso: [flujo obligatorio](workflow/README.md).

## Historial y mantenimiento

[PROJECT-CONTEXT](PROJECT-CONTEXT.md), [avance](backend-progress.md), DOC-01 y los
informes iniciales de `database/` conservan cortes históricos. Sus versiones y
conteos de pruebas describen aquella entrega, no el total vigente. Los JSON de
`database/review-evidence/` no se reescriben para aparentar nuevas ejecuciones.
La delegación a Leonel conserva propuestas iniciales superadas por ADR 0012.

Conciliación de esta revisión: [DOC-02](tasks/DOC-02-documentation-reconciliation.md).
Actualizar este índice y las guías afectadas cuando cambie una entrega; conservar
fechas y evidencia histórica. Si hay un conflicto real entre decisiones aceptadas,
consultar al responsable antes de cambiar el contrato o implementar la parte afectada.
