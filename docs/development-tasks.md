# Backlog de desarrollo posterior a la aprobación

Actualización 2026-10-21: BASE de persistencia/HTTP y CAT-01/02 implementados,
con pruebas PostgreSQL aisladas y respuestas contra OpenAPI. Ver backend-progress.md.
CAT usa routes/controller/service/repository/types en src/modules/catalog.
AUTH/ADM/ORD/CASH/STR/OPS y demás historias siguen pendientes. Admin inicial
solo se prepara por CLI interactiva, no hay login ni endpoint de administración.

**Estado**: únicamente planificación. Ángel implementará el backend posteriormente y Enrique conserva frontend. Estas historias **no están construidas**.

| ID       | Objetivo/alcance                                           | Exclusiones y dependencias                                | Aceptación verificable / pruebas                                                                                         |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CAT-01   | GET categorías y productos paginados; filtros aprobados    | Sin CRUD; requiere esquema/OpenAPI aprobados              | Ocultar bajas; agotados visibles; cursor estable; limit=101 → 400; sin resultados → 200 vacío. Contrato/integración test |
| CAT-02   | GET detalle y opciones con recargo efectivo                | Sin modificación de catálogo; depende CAT-01              | 404 dados de baja; GLOBAL o PER_PRODUCT resuelto backend. Contract tests                                                 |
| ADM-01   | Roles, admin y mantenimiento de catálogo / Cloudinary      | Sin compras; depende AUTH-01, CAT-01/02 y ADR 0010        | Restricciones por rol, rechazo imagen >5 MiB, baja lógica, logs sanitizados. Integración                                 |
| AUTH-01  | Login clientes/personal, refresh, rotación/revocación      | Sin frontend; depende modelo/session                      | JWT ≤15 min, personal ≤8h, cliente ≤30d, reuso revoca familia. Integración concurrencia                                  |
| AUTH-02  | Registro QR, recuperación correo, NIP temporal y auditoría | Depende AUTH-01, CASH-02, TKT-01 y OPS-01/02              | QR 24h y uso único, verificación/reset 30min, cinco fallos/15m, solo admin presencial. Tests carrera                     |
| ORD-01   | Crear orden inmutable de hasta 50 líneas                   | Sin cobro; depende catálogo y autenticación               | Snapshots y precios servidor; total ≤9999900; método fijo; idempotencia 48h. Tests transaccionales                       |
| CASH-01  | Apertura/cierre de caja y auditoría                        | Sin Stripe; depende AUTH-01                               | Una global abierta, diferencia contado-esperado, cierre excepcional con motivo. Tests concurrencia                       |
| CASH-02  | Cobro CASH por QR, registro venta y preparación            | Sin pago mixto; depende CASH-01 y ORD-01                  | Recibido≥total, cambio correcto, rollback atómico, doble cobro no duplica. Tests transacción                             |
| STR-01   | Checkout Stripe persistente y webhook idempotente          | Sin cajero; depende ORD-01                                | Una sesión abierta, proveedor conciliado, duplicados no duplican venta. Tests mocks/integración                          |
| STR-02   | Reconciliación, expiración, refund e incidencias           | Depende STR-01 y OPS-01; sin venta automática excepcional | Pagado oportuno comunicado tarde se reconoce; pago posterior excepcional se reembolsa y audita. Tests edge               |
| OPS-01   | Infraestructura worker/outbox y limpieza segura            | Solo persistencia aprobada; no depende de AUTH-02/STR-02  | Lease, dedupe, reintentos, reinicio seguro y payload cifrado; pruebas aisladas                                           |
| OPS-02   | Transporte de correo de pruebas y handlers                 | Depende OPS-01; sin SMTP de producción                    | Reintento no duplica efecto; secretos no registrados; fake transport comprobable                                         |
| PREP-01  | Listar EN_PREPARACION y marcar LISTO con actor             | AUTH-01 y CASH-02; sin cancelar ni entregar               | Permisos, transición condicional, lista activa y conservación histórica                                                  |
| TKT-01   | Emitir ticket y token QR de registro de invitado           | CASH-02 y revisión ADR 0011; sin estado de invitado       | QR solo pagado/invitado; acceso limitado al comprobante; expiración/revocación                                           |
| CUS-01   | Perfil, historial y búsqueda mínima para caja              | AUTH-01 y ORD-01                                          | Solo propietario, búsqueda mínima por teléfono/número; sin exposición a invitados                                        |
| FAV-01   | Favoritos y repetir selección                              | CUS-01 y CAT-02                                           | Sin duplicados, precio actual y aviso de opciones retiradas                                                              |
| SALES-01 | Consultar ventas y resumen                                 | AUTH-01 y CASH-02; Stripe amplía después                  | Permisos, filtros, totales coherentes y paginación                                                                       |

**Formato para cada implementación posterior**: registrar módulos/archivos concretos cuando exista la estructura de módulos; `src` está aún en bootstrap. No crear rutas ni servicios de negocio antes de aprobar modelo/contrato.

## Preparación y orden realizable

BASE-01: aprobar candidato corregido y correr db:verify en PostgreSQL 17.
BASE-02: cliente Prisma, validación, errores/requestId, serialización BIGINT,
paginación, datos ficticios y pruebas comunes. No exponer modelos Prisma crudos.

Orden: BASE → CAT-01/02 → AUTH-01 → ADM-01 → ORD-01 → CASH-01/02 →
PREP-01/TKT-01/CUS-01 → AUTH-02/FAV-01/SALES-01. OPS-01 puede construirse
desde BASE; OPS-02 antes de recuperación. STR-01 desde ORD-01 y STR-02 después
de STR-01+OPS-01. Expiración CASH requiere handler OPS-01 en ORD-01/CASH-02.
No existe dependencia inversa OPS → flujos que usan el worker.

Rutas/validación/controlador/servicio/repositorio se ubicarán en
`src/modules/{catalog,auth,orders,cash,payments,customers,tickets}`. Worker en
`src/worker/`, configuración en `src/config/`, pruebas en `tests/` por módulo.
Estos nombres son destinos previstos, no carpetas ni funcionalidades construidas.
