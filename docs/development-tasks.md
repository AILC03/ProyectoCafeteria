# Backlog de desarrollo posterior a la aprobación

## Estado vigente — 2026-10-26

ADR 0001–0012 aceptados. En `dev` están implementados BASE, CAT-01/02,
AUTH-01 (excepto recuperación), ADM-01 (Cloudinary real pendiente) y ORD-01.
Las historias restantes continúan como backlog. La tabla conserva el alcance y
criterios originales; las etiquetas **[hecha]**, **[parcial]** y **[pendiente]**
aclaran el estado real. Ver [estado reconciliado](tasks/DOC-01-adr-status-reconciliation.md).

Entrega local posterior — 2026-10-27: CASH-01 implementado/verificado; CASH-02
cubre el cobro por ID, venta/preparación y ticket JSON. La entrega posterior AUTH-02
consume el QR de registro de invitado; su QR **de cobro** original y el acceso digital
invitado al ticket siguen pendientes. TKT-01 queda parcial, no se declara el flujo
completo. Esta entrega local aún no está integrada/publicada.
[Guía y evidencia](cash-implementation.md).

Entrega local posterior — 2026-10-31: AUTH-02 cubre **solo registro QR**,
no recuperación/correo/reset administrativo. El alta final del QR de CASH ya está
implementada; ticket digital invitado, QR de cobro e impresión frontend siguen
pendientes. [Tarea y verificación AUTH-02](tasks/AUTH-02-ticket-qr-registration.md).

| ID                      | Objetivo/alcance                                           | Exclusiones y dependencias                                | Aceptación verificable / pruebas                                                                                         |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CAT-01 [hecha]          | GET categorías y productos paginados; filtros aprobados    | Sin CRUD; requiere esquema/OpenAPI aprobados              | Ocultar bajas; agotados visibles; cursor estable; limit=101 → 400; sin resultados → 200 vacío. Contrato/integración test |
| CAT-02 [hecha]          | GET detalle y opciones con recargo efectivo                | Sin modificación de catálogo; depende CAT-01              | 404 dados de baja; GLOBAL o PER_PRODUCT resuelto backend. Contract tests                                                 |
| ADM-01 [parcial]        | Roles, admin y mantenimiento de catálogo / Cloudinary      | Sin compras; depende AUTH-01, CAT-01/02 y ADR 0010        | CRUD y controles implementados; proveedor Cloudinary real pendiente.                                                     |
| AUTH-01 [parcial]       | Login clientes/personal, refresh, rotación/revocación      | Sin frontend; depende modelo/session                      | Sesiones, JWT, cookies, CSRF, roles y revocación implementados; recuperación queda en AUTH-02.                           |
| AUTH-02 [parcial local] | Registro QR, recuperación correo, NIP temporal y auditoría | Alta QR implementada; recuperación depende OPS-01/02      | QR 24h, uso único, transacción, carreras y hash cubiertos; correo/reset siguen pendientes.                               |
| ORD-01 [hecha]          | Crear orden inmutable de hasta 50 líneas                   | Sin cobro; depende catálogo y autenticación               | Snapshots y precios servidor; total ≤9999900; método fijo; idempotencia 48h. Tests transaccionales                       |
| CASH-01 [local]         | Apertura/cierre de caja y auditoría                        | Sin Stripe; depende AUTH-01                               | Implementado/probado: una abierta, diferencias, responsable y excepción admin; pendiente integración.                    |
| CASH-02 [parcial local] | Cobro CASH, venta y preparación                            | Sin pago mixto; depende CASH-01 y ORD-01                  | Cobro por ID/ticket implementados y probados; QR de cobro/escaneo pendiente.                                             |
| STR-01                  | Checkout Stripe persistente y webhook idempotente          | Sin cajero; depende ORD-01                                | Una sesión abierta, proveedor conciliado, duplicados no duplican venta. Tests mocks/integración                          |
| STR-02                  | Reconciliación, expiración, refund e incidencias           | Depende STR-01 y OPS-01; sin venta automática excepcional | Pagado oportuno comunicado tarde se reconoce; pago posterior excepcional se reembolsa y audita. Tests edge               |
| OPS-01                  | Infraestructura worker/outbox y limpieza segura            | Solo persistencia aprobada; no depende de AUTH-02/STR-02  | Lease, dedupe, reintentos, reinicio seguro y payload cifrado; pruebas aisladas                                           |
| OPS-02                  | Transporte de correo de pruebas y handlers                 | Depende OPS-01; sin SMTP de producción                    | Reintento no duplica efecto; secretos no registrados; fake transport comprobable                                         |
| PREP-01                 | Listar EN_PREPARACION y marcar LISTO con actor             | AUTH-01 y CASH-02; sin cancelar ni entregar               | Permisos, transición condicional, lista activa y conservación histórica                                                  |
| TKT-01 [parcial local]  | Ticket JSON y token QR de registro                         | CASH-02; sin estado de invitado                           | Emisión/reimpresión y alta QR implementadas; ticket digital invitado/impresión frontend pendientes.                      |
| CUS-01                  | Perfil, historial y búsqueda mínima para caja              | AUTH-01 y ORD-01                                          | Solo propietario, búsqueda mínima por teléfono/número; sin exposición a invitados                                        |
| FAV-01                  | Favoritos y repetir selección                              | CUS-01 y CAT-02                                           | Sin duplicados, precio actual y aviso de opciones retiradas                                                              |
| SALES-01                | Consultar ventas y resumen                                 | AUTH-01 y CASH-02; Stripe amplía después                  | Permisos, filtros, totales coherentes y paginación                                                                       |

**Formato para cada implementación posterior**: registrar módulos/archivos concretos
en la tarea. `src/modules` ya contiene catálogo, auth y orders. No crear rutas
ni servicios del flujo pendiente antes de aprobar su contrato y diseño.

## Preparación y orden realizable

BASE-01 y BASE-02 están cubiertas por la infraestructura existente. CASH-01/02 y
AUTH-02 también tienen implementación local pendiente de revisión/integración. Los
siguientes bloques funcionales son PREP-01, TKT-01 restante y CUS-01; Stripe parte de
ORD-01 y requiere STR-01 antes de STR-02.

Orden vigente: BASE → CAT-01/02 → AUTH-01 → ADM-01 → ORD-01 → CASH-01/02 →
AUTH-02 → PREP-01/TKT-01 restante/CUS-01 → FAV-01/SALES-01. OPS-01 puede construirse
desde BASE; OPS-02 va antes de recuperación. STR-01 parte de ORD-01 y STR-02 sigue a
STR-01+OPS-01. Expiración CASH requiere handler OPS-01 en ORD-01/CASH-02. No existe
dependencia inversa OPS → flujos que usan el worker.

Catálogo, auth y orders ya usan rutas/validación/controlador/servicio/repositorio
en `src/modules`. Los módulos futuros `cash`, `payments`, `customers` y `tickets`
seguirán esa organización; el worker irá en `src/worker/`, con pruebas por módulo
en `tests/`.
